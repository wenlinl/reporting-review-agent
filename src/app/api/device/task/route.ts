import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLET_DEVICE_ID = "xzd-t5e1-001";

/**
 * POST /api/device/task —— 外置平板选择动作后调用（平板 Token 鉴权）：
 *   body: { "deviceId": "shike-xiao-001", "action": "in" | "out" }
 *   云端保存内模组的"当前动作"（持久化，直到下次 POST 覆盖；GET 不消费）。
 *
 * GET /api/device/task?deviceId=shike-xiao-001 —— 内模组扫码前调用（内模组 Token 鉴权）：
 *   返回 { code:0, data:{ action: "in"|"out"|null, updatedAt } }；无记录 action=null，固件默认 in。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const targetDeviceId = (body?.deviceId || "").slice(0, 64);
  const action = body?.action === "out" ? "out" : body?.action === "in" ? "in" : "";

  if (!targetDeviceId || !action) {
    return xzdJson({ code: 1, msg: "参数错误：需要 deviceId 与 action(in|out)" }, 400);
  }

  const auth = await verifyDevice(req, TABLET_DEVICE_ID);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  const target = await prisma.device.findUnique({ where: { deviceId: targetDeviceId } });
  if (!target) {
    return xzdJson({ code: 404, msg: "目标设备不存在" }, 404);
  }

  await prisma.device.update({
    where: { id: target.id },
    data: { pendingAction: action, pendingActionAt: new Date() },
  });
  return xzdJson({ code: 0, data: { deviceId: targetDeviceId, action } });
}

export async function GET(req: NextRequest) {
  const deviceId = (req.nextUrl.searchParams.get("deviceId") || "").slice(0, 64);
  if (!deviceId) {
    return xzdJson({ code: 1, msg: "缺少 deviceId" }, 400);
  }

  const auth = await verifyDevice(req, deviceId);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  const device = await prisma.device.findUnique({ where: { deviceId } });
  return xzdJson({
    code: 0,
    data: {
      action: device?.pendingAction || null,
      updatedAt: device?.pendingActionAt ? device.pendingActionAt.toISOString() : null,
    },
  });
}

export { xzdOptions as OPTIONS };
