import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMyMember } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 离开家庭；家庭管理员离开 = 解散家庭（所有成员回到无家庭状态）。 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const me = await getMyMember(session);
  if (!me.familyId) {
    return NextResponse.json({ error: "你还没有加入家庭" }, { status: 400 });
  }
  if (me.role === "admin") {
    await prisma.family.delete({ where: { id: me.familyId } });
    return NextResponse.json({ code: 0, dissolved: true });
  }
  await prisma.member.update({
    where: { id: me.id },
    data: { familyId: null, role: "member" },
  });
  return NextResponse.json({ code: 0, dissolved: false });
}
