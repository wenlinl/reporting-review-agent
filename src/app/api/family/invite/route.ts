import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateInviteCode, getMyMember } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 重新生成邀请码（仅家庭管理员）。 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const me = await getMyMember(session);
  if (!me.familyId || me.role !== "admin") {
    return NextResponse.json({ error: "仅家庭管理员可以生成邀请码" }, { status: 403 });
  }
  const family = await prisma.family.update({
    where: { id: me.familyId },
    data: { inviteCode: generateInviteCode() },
  });
  return NextResponse.json({ code: 0, inviteCode: family.inviteCode });
}
