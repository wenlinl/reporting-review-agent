import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLET_DEVICE_ID = "xzd-t5e1-001";

/**
 * POST /api/summary/confirm —— 外置平板确认汇总批次（平板 Token 鉴权）：
 *   body: { "batchId": "...", "items": [{ "id": "...", "status": "confirmed"|"ignored" }] }
 *   - items 缺省：批次整体确认（全部 confirmed）；
 *   - items 提供：逐条更新状态，全部处理完后批次标记 confirmed。
 *   批次状态：pending -> confirmed。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const batchId = (body?.batchId || "").slice(0, 64);
  if (!batchId) {
    return xzdJson({ code: 1, msg: "参数错误：需要 batchId" }, 400);
  }

  const auth = await verifyDevice(req, TABLET_DEVICE_ID);
  if (!auth.ok) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }

  const batch = await prisma.summaryBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return xzdJson({ code: 404, msg: "批次不存在" }, 404);
  }
  if (batch.status === "confirmed") {
    return xzdJson({ code: 0, data: { batchId, status: "confirmed" } });
  }

  const items: Array<{ id: string; status: string }> = Array.isArray(body?.items)
    ? body.items
        .filter(
          (it: { id?: unknown; status?: unknown }) =>
            typeof it?.id === "string" &&
            (it.status === "confirmed" || it.status === "ignored"),
        )
        .map((it: { id: string; status: string }) => ({
          id: it.id.slice(0, 64),
          status: it.status,
        }))
    : [];

  if (items.length > 0) {
    const targetIds = new Set(items.map((it) => it.id));
    const existing = await prisma.summaryItem.findMany({
      where: { batchId, id: { in: [...targetIds] } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((e) => e.id));
    await prisma.$transaction(
      items
        .filter((it) => validIds.has(it.id))
        .map((it) =>
          prisma.summaryItem.update({
            where: { id: it.id },
            data: { status: it.status },
          }),
        ),
    );
  }

  await prisma.summaryBatch.update({
    where: { id: batchId },
    data: { status: "confirmed", confirmedAt: new Date() },
  });
  return xzdJson({ code: 0, data: { batchId, status: "confirmed" } });
}

export { xzdOptions as OPTIONS };
