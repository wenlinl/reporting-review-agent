import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { deleteFile } from "@/lib/files";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ rid: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { rid } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id: rid },
    include: { presentation: { select: { userId: true } } },
  });
  if (!recording) return NextResponse.json({ error: "录音不存在" }, { status: 404 });
  if (
    session.role !== "admin" &&
    recording.presentation.userId !== session.id
  ) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { transcript } = await req.json().catch(() => ({ transcript: null }));
  if (typeof transcript !== "string") {
    return NextResponse.json({ error: "转写文本不能为空" }, { status: 400 });
  }

  const updated = await prisma.recording.update({
    where: { id: rid },
    data: { transcript, transcriptStatus: "manual" },
  });
  return NextResponse.json({ recording: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ rid: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { rid } = await params;
  const recording = await prisma.recording.findUnique({
    where: { id: rid },
    include: { presentation: { select: { userId: true } } },
  });
  if (!recording) return NextResponse.json({ error: "录音不存在" }, { status: 404 });
  if (
    session.role !== "admin" &&
    recording.presentation.userId !== session.id
  ) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  deleteFile(recording.filePath);
  await prisma.recording.delete({ where: { id: rid } });
  return NextResponse.json({ ok: true });
}
