import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseMultipart } from "@/lib/multipart";
import { saveUpload, deleteFile } from "@/lib/files";
import { extractPptText } from "@/lib/ppt";

const ALLOWED = [".pptx", ".pdf"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const presentation = await prisma.presentation.findUnique({ where: { id } });
  if (!presentation) return NextResponse.json({ error: "汇报不存在" }, { status: 404 });
  if (session.role !== "admin" && presentation.userId !== session.id) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { files } = await parseMultipart(req, { maxFileSizeMB: 100 });
  const file = files.find((f) => f.field === "file");
  if (!file || file.buffer.length === 0) {
    return NextResponse.json({ error: "请选择要上传的 PPT 文件" }, { status: 400 });
  }

  const ext = path.extname(file.filename).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json(
      { error: "仅支持 .pptx 或 .pdf 文件" },
      { status: 400 },
    );
  }

  // 先保存文件，再尝试提取文本
  const filePath = saveUpload("ppt", file.filename, file.buffer);
  let pptText = "";
  let extractError: string | null = null;
  try {
    pptText = await extractPptText(filePath);
  } catch (e) {
    extractError = e instanceof Error ? e.message : String(e);
  }

  const updated = await prisma.presentation.update({
    where: { id },
    data: {
      pptPath: filePath,
      pptName: file.filename,
      pptText: pptText || null,
      status: "draft",
    },
  });

  return NextResponse.json({
    presentation: updated,
    extracted: Boolean(pptText),
    textLength: pptText.length,
    extractError,
    fileSizeMB: Math.round((file.buffer.length / 1024 / 1024) * 100) / 100,
  });
}
