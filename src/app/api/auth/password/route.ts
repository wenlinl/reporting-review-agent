import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 修改密码：需要登录会话，校验旧密码后更新。 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { oldPassword, newPassword } = await req.json().catch(() => ({}));
  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "请输入旧密码和新密码" }, { status: 400 });
  }
  const rawNew = String(newPassword);
  if (rawNew.length < 6) {
    return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
  }
  if (rawNew === String(oldPassword)) {
    return NextResponse.json({ error: "新密码不能与旧密码相同" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "账号不可用" }, { status: 403 });
  }
  const ok = await bcrypt.compare(String(oldPassword), user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "旧密码错误" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(rawNew, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return NextResponse.json({ ok: true });
}
