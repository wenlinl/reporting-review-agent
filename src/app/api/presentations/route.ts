import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const where = session.role === "admin" ? {} : { userId: session.id };
  const presentations = await prisma.presentation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      _count: { select: { reviews: true, recordings: true } },
      feedback: { select: { id: true } },
    },
  });
  return NextResponse.json({ presentations });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { title, goal } = await req.json().catch(() => ({}));
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: "请填写汇报标题" }, { status: 400 });
  }

  const presentation = await prisma.presentation.create({
    data: {
      userId: session.id,
      title: String(title).trim(),
      goal: goal ? String(goal).trim() : null,
    },
  });
  return NextResponse.json({ presentation }, { status: 201 });
}
