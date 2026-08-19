import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { getMyMember } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // 按家庭隔离：有家庭只看自家成员；未加入家庭时保留全量（兼容演示数据）
  const session = await getSession();
  let where = {};
  if (session) {
    const me = await getMyMember(session);
    if (me.familyId) where = { familyId: me.familyId };
  }
  const members = await prisma.member.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const logs = await prisma.scanLog.groupBy({
    by: ["memberId"],
    where: { createdAt: { gte: start } },
    _count: { _all: true },
  });
  const countMap = new Map(logs.map((l) => [l.memberId, l._count._all]));
  const data = members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    avatar: m.avatar || "👤",
    responsibleCategory: m.responsibleCategory,
    preferences: m.preferences ? JSON.parse(m.preferences) : [],
    monthlyScans: countMap.get(m.id) || 0,
  }));
  return xzdJson({ code: 0, members: data });
}

export { xzdOptions as OPTIONS };
