import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";
import { settleWindows } from "@/lib/windowSettle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLET_DEVICE_ID = "xzd-t5e1-001";

/**
 * GET /api/summary/pending?deviceId=xzd-t5e1-001 —— 外置平板查询待确认汇总批次
 *   （平板 Token 鉴权；deviceId 默认平板自身，也可传内模组 id 查看其批次）。
 *   返回最近一个 status=pending 的批次及明细；无批次 data=null。
 *   data: { batch: { id, inCount, outCount, midOutCount, unknownCount, createdAt },
 *           items: [{ id, kind, name, status, note }] }
 */
export async function GET(req: NextRequest) {
  const deviceId = (req.nextUrl.searchParams.get("deviceId") || TABLET_DEVICE_ID).slice(0, 64);
  const auth = await verifyDevice(req, TABLET_DEVICE_ID);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  // 惰性结算：把已闭合的扫码窗口生成待确认批次（ADR-005 延迟确认）
  await settleWindows(deviceId);

  const batch = await prisma.summaryBatch.findFirst({
    where: { deviceId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });

  if (!batch) {
    return xzdJson({ code: 0, data: null });
  }

  return xzdJson({
    code: 0,
    data: {
      batch: {
        id: batch.id,
        inCount: batch.inCount,
        outCount: batch.outCount,
        midOutCount: batch.midOutCount,
        unknownCount: batch.unknownCount,
        createdAt: batch.createdAt.toISOString(),
      },
      items: batch.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        name: it.name,
        status: it.status,
        note: it.note,
      })),
    },
  });
}

export { xzdOptions as OPTIONS };
