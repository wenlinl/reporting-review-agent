import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/scan/latest?deviceId=shike-xiao-001 —— 外置平板在 WAIT_SCAN 每 2–3s 轮询：
 *   返回该设备最近一次扫码事件；无记录 data=null。
 *   data: { id, name, action, scannedAt(ISO), expiryDate(YYYY-MM-DD), daysLeft,
 *           suggestedContainer, stockTotal }
 */
export async function GET(req: NextRequest) {
  const deviceId = (req.nextUrl.searchParams.get("deviceId") || "").slice(0, 64);
  if (!deviceId) {
    return xzdJson({ code: 1, msg: "缺少 deviceId" }, 400);
  }

  const auth = await verifyDevice(req, deviceId);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  const last = await prisma.scanLog.findFirst({
    where: { deviceId },
    orderBy: { createdAt: "desc" },
  });

  const stock = await prisma.foodItem.aggregate({
    where: { deviceId },
    _sum: { quantity: true },
  });

  return xzdJson({
    code: 0,
    data: last
      ? {
          id: last.id,
          name: last.name,
          action: last.action,
          scannedAt: last.scannedAt.toISOString(),
          expiryDate: fmtDate(last.expiryDate),
          daysLeft: last.daysLeft,
          suggestedContainer: last.container,
          stockTotal: stock._sum.quantity || 0,
        }
      : null,
  });
}

export { xzdOptions as OPTIONS };
