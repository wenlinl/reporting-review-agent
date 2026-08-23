import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";
import { settleWindows, type ExtraEvent } from "@/lib/windowSettle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/summary/submit —— 内模组关门结算上报（内模组 Token 鉴权）。
 *   body: {
 *     "deviceId": "shike-xiao-001",   // 内模组
 *     "requestId": "win-...",         // 幂等键
 *     "events": [                     // 补充事件（未识别 / 中途取出等扫码日志没有的信息）
 *       { "action": "midout"|"unknown", "name": "牛奶", "timestamp": "..." }
 *     ]
 *   }
 * 无 events 时仅触发"立即结算"：把当前打开的窗口闭合生成批次。
 * 响应 { code:0, data:{ settled:true } }。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const deviceId = (body?.deviceId || "").slice(0, 64);
  if (!deviceId) {
    return xzdJson({ code: 1, msg: "缺少 deviceId" }, 400);
  }

  const auth = await verifyDevice(req, deviceId);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  const requestId = (body?.requestId || "").slice(0, 80);
  if (requestId) {
    const dup = await prisma.deviceLog.findFirst({
      where: { deviceId, event: "SUMMARY_SUBMIT", msg: requestId },
      select: { id: true },
    });
    if (dup) {
      return xzdJson({ code: 0, data: { settled: true, duplicated: true } });
    }
  }

  const allowed = new Set(["in", "out", "midout", "unknown"]);
  const events: ExtraEvent[] = Array.isArray(body?.events)
    ? body.events
        .filter(
          (e: { action?: unknown; name?: unknown }) =>
            e && typeof e.action === "string" && allowed.has(e.action),
        )
        .map((e: { action: string; name?: string; timestamp?: string }) => ({
          action: e.action as ExtraEvent["action"],
          name: typeof e.name === "string" ? e.name.slice(0, 64) : null,
          timestamp: typeof e.timestamp === "string" ? e.timestamp.slice(0, 32) : undefined,
        }))
    : [];

  await settleWindows(deviceId, events, true);

  if (requestId) {
    await prisma.deviceLog
      .create({
        data: { deviceId, event: "SUMMARY_SUBMIT", msg: requestId },
      })
      .catch(() => {});
  }
  return xzdJson({ code: 0, data: { settled: true } });
}

export { xzdOptions as OPTIONS };
