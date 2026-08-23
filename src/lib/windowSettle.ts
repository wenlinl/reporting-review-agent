import { prisma } from "@/lib/db";

/**
 * 关门结算 · 云端自动窗口结算（ADR-005 延迟确认）
 *
 * 窗口定义：同一设备的 ScanLog 按 scannedAt 排序，相邻两条间隔 ≤ WINDOW_GAP_MS
 * （默认 10 分钟，EXP-02 实测开门平均 <20s）视为同一开门窗口。
 *
 * 结算时机：
 *  - 每次 /api/scan 入账后（惰性：只结算"已闭合"的窗口）；
 *  - GET /api/summary/pending 查询前（惰性，关门后稍等即可见）；
 *  - POST /api/summary/submit（内模组上报补充事件，force 立即结算）。
 *
 * 幂等：日志打上 batchId 后不再重复归批。
 */
export const WINDOW_GAP_MS = 10 * 60 * 1000;

export type ExtraEvent = {
  action: "in" | "out" | "midout" | "unknown";
  name?: string | null;
  timestamp?: string;
};

async function settleSegments(
  deviceId: string,
  extras: ExtraEvent[],
  force: boolean,
) {
  const logs = await prisma.scanLog.findMany({
    where: { deviceId, batchId: null },
    orderBy: { scannedAt: "asc" },
  });
  const now = Date.now();

  // 按间隔切分窗口
  const segments: typeof logs[] = [];
  let cur: typeof logs = [];
  for (const l of logs) {
    if (
      cur.length &&
      l.scannedAt.getTime() - cur[cur.length - 1].scannedAt.getTime() > WINDOW_GAP_MS
    ) {
      segments.push(cur);
      cur = [];
    }
    cur.push(l);
  }
  if (cur.length) segments.push(cur);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const lastAt = seg[seg.length - 1].scannedAt.getTime();
    const closed = force || !isLast || now - lastAt > WINDOW_GAP_MS;
    if (!closed) continue;

    // 幂等：段首日志已归批则跳过
    const ref = await prisma.scanLog.findFirst({
      where: { id: seg[0].id, batchId: { not: null } },
      select: { id: true },
    });
    if (ref) continue;

    const batchExtras = isLast ? extras : [];
    const inCount = seg.filter((l) => l.action === "in").length;
    const outCount = seg.filter((l) => l.action === "out").length;
    const midOutCount = batchExtras.filter((e) => e.action === "midout").length;
    const unknownCount = batchExtras.filter((e) => e.action === "unknown").length;
    const batch = await prisma.summaryBatch.create({
      data: {
        deviceId,
        familyId: seg[0].familyId ?? null,
        inCount,
        outCount,
        midOutCount,
        unknownCount,
        status: "pending",
        items: {
          create: [
            ...seg.map((l) => ({
              kind: l.action === "out" ? ("out" as const) : ("in" as const),
              name: l.name,
              status: "pending" as const,
            })),
            ...batchExtras.map((e) => ({
              kind: e.action,
              name: e.name || null,
              status: "pending" as const,
            })),
          ],
        },
      },
    });
    await prisma.scanLog.updateMany({
      where: { id: { in: seg.map((l) => l.id) } },
      data: { batchId: batch.id },
    });
  }

  // 纯补充事件（无未批次日志）：单独成批
  if (extras.length && !segments.length) {
    await prisma.summaryBatch.create({
      data: {
        deviceId,
        inCount: extras.filter((e) => e.action === "in").length,
        outCount: extras.filter((e) => e.action === "out").length,
        midOutCount: extras.filter((e) => e.action === "midout").length,
        unknownCount: extras.filter((e) => e.action === "unknown").length,
        status: "pending",
        items: {
          create: extras.map((e) => ({
            kind: e.action,
            name: e.name || null,
            status: "pending" as const,
          })),
        },
      },
    });
  }
}

/** 对外入口：吞掉异常，不拖累调用方（scan 响应 / pending 查询）。 */
export async function settleWindows(
  deviceId: string,
  extras: ExtraEvent[] = [],
  force = false,
): Promise<void> {
  try {
    await settleSegments(deviceId, extras, force);
  } catch (e) {
    console.error("[windowSettle] failed:", deviceId, e);
  }
}
