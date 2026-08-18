import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 当前登录用户的口味偏好（对应其家庭成员档案 Member.preferences）。 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const member = await prisma.member.findUnique({ where: { userId: session.id } });
  return NextResponse.json({
    preferences: member?.preferences ? JSON.parse(member.preferences) : [],
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { preferences } = await req.json().catch(() => ({}));
  if (!Array.isArray(preferences)) {
    return NextResponse.json({ error: "preferences 需为数组" }, { status: 400 });
  }
  const member = await prisma.member.findUnique({ where: { userId: session.id } });
  if (!member) {
    return NextResponse.json({ error: "尚未创建家庭档案" }, { status: 404 });
  }
  const clean = preferences
    .map((p) => String(p).slice(0, 20))
    .filter(Boolean)
    .slice(0, 12);
  await prisma.member.update({
    where: { id: member.id },
    data: { preferences: JSON.stringify(clean) },
  });
  return NextResponse.json({ preferences: clean });
}
