import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 最近活动流：扫描出入库 + 消耗/过期记录（H5 履历页用，均为数据库数据）。 */
export async function GET() {
  const limit = 30;
  const [scans, consumes] = await Promise.all([
    prisma.scanLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.consumptionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  const members = await prisma.member.findMany({
    select: { id: true, name: true, avatar: true },
  });
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const rows = [
    ...scans.map((s) => ({
      type: "scan" as const,
      action: s.action, // in | out
      name: s.name,
      container: s.container,
      member: s.memberId ? memberMap.get(s.memberId)?.name || null : null,
      avatar: s.memberId ? memberMap.get(s.memberId)?.avatar || null : null,
      createdAt: s.createdAt,
    })),
    ...consumes.map((c) => ({
      type: "consume" as const,
      action: c.reason, // consumed | wasted | expired
      name: c.name,
      container: null,
      member: c.memberId ? memberMap.get(c.memberId)?.name || null : null,
      avatar: c.memberId ? memberMap.get(c.memberId)?.avatar || null : null,
      createdAt: c.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return xzdJson({ code: 0, logs: rows });
}

export { xzdOptions as OPTIONS };
