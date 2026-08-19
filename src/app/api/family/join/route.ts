import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMyMember } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 通过邀请码加入家庭。 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { code } = await req.json().catch(() => ({}));
  const inviteCode = String(code || "").trim().toUpperCase();
  if (!inviteCode) {
    return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });
  }
  const family = await prisma.family.findUnique({ where: { inviteCode } });
  if (!family) {
    return NextResponse.json({ error: "邀请码无效，请核对后重试" }, { status: 404 });
  }
  const me = await getMyMember(session);
  if (me.familyId) {
    return NextResponse.json({ error: "你已经在家庭中" }, { status: 400 });
  }
  await prisma.member.update({
    where: { id: me.id },
    data: { familyId: family.id, role: "member" },
  });
  return NextResponse.json({
    code: 0,
    family: { id: family.id, name: family.name, inviteCode: family.inviteCode },
  });
}
