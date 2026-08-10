import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { presentations: true } },
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { name, email, password } = await req.json().catch(() => ({}));
  if (!name || !email || !password) {
    return NextResponse.json({ error: "姓名、邮箱、初始密码均不能为空" }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "初始密码至少 6 位" }, { status: 400 });
  }

  const normalized = String(email).toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email: normalized } });
  if (exists) {
    return NextResponse.json({ error: "该邮箱已存在" }, { status: 409 });
  }

  const hash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: { name: String(name).trim(), email: normalized, passwordHash: hash },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json({ user }, { status: 201 });
}
