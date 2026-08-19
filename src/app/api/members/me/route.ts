import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMyMember, memberPublic } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 修改自己在家庭里的显示名（与账户名分开）等资料。 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    avatar?: string;
    responsibleCategory?: string;
  };
  const data: { name?: string; avatar?: string; responsibleCategory?: string | null } = {};
  if (body.name !== undefined) {
    const n = String(body.name).trim().slice(0, 20);
    if (!n) return NextResponse.json({ error: "姓名不能为空" }, { status: 400 });
    data.name = n;
  }
  if (body.avatar !== undefined) data.avatar = String(body.avatar).slice(0, 8);
  if (body.responsibleCategory !== undefined) {
    data.responsibleCategory =
      String(body.responsibleCategory).trim().slice(0, 20) || null;
  }
  const me = await getMyMember(session);
  const updated = await prisma.member.update({
    where: { id: me.id },
    data,
  });
  return NextResponse.json({ code: 0, member: memberPublic(updated) });
}
