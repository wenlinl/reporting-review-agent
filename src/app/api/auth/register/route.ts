import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json().catch(() => ({}));
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // 限流：同 IP 每小时最多 5 次注册
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `注册过于频繁，请 ${rl.retryAfter}s 后重试` },
      { status: 429 },
    );
  }

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "请输入姓名" }, { status: 400 });
  }
  if (String(name).trim().length > 50) {
    return NextResponse.json({ error: "姓名不能超过 50 个字符" }, { status: 400 });
  }

  const normalizedEmail = String(email || "").toLowerCase().trim();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
  }

  const rawPassword = String(password || "");
  if (rawPassword.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (exists) {
    return NextResponse.json(
      { error: "该邮箱已被注册，请直接登录" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: String(name).trim(),
          email: normalizedEmail,
          passwordHash,
          role: "user",
          active: true,
        },
        select: { id: true, name: true, email: true, role: true },
      });
      // 自动创建关联的家庭成员档案（与 H5「我的 / 家庭共享」打通）
      await tx.member.create({
        data: {
          userId: u.id,
          name: u.name,
          role: "member",
          avatar: "👤",
          preferences: "[]",
        },
      });
      return u;
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ error: "该邮箱已被注册，请直接登录" }, { status: 409 });
    }
    throw e;
  }

  const token = await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const res = NextResponse.json({ user }, { status: 201 });
  setSessionCookie(res, token);
  return res;
}
