import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const presentation = await prisma.presentation.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviews: { orderBy: { createdAt: "desc" } },
      recordings: { orderBy: { createdAt: "asc" } },
      feedback: true,
    },
  });
  if (!presentation) {
    return NextResponse.json({ error: "汇报不存在" }, { status: 404 });
  }
  if (session.role !== "admin" && presentation.userId !== session.id) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ presentation });
}
