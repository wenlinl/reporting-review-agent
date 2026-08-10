import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseMultipart } from "@/lib/multipart";
import { saveUpload } from "@/lib/files";
import { transcribeRecording } from "@/lib/asr";

const ALLOWED_AUDIO = [
  ".webm",
  ".ogg",
  ".opus",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".mp4",
  ".flac",
];

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

  const { fields, files } = await parseMultipart(req, { maxFileSizeMB: 300 });
  const file = files.find((f) => f.field === "file");
  if (!file || file.buffer.length === 0) {
    return NextResponse.json({ error: "未收到录音文件" }, { status: 400 });
  }

  const ext = path.extname(file.filename).toLowerCase();
  if (!ALLOWED_AUDIO.includes(ext)) {
    return NextResponse.json(
      { error: `不支持的录音格式: ${ext || "未知"}` },
      { status: 400 },
    );
  }

  const filePath = saveUpload("audio", file.filename, file.buffer);
  const durationSec = Number.parseInt(fields.duration || "0", 10) || null;
  const liveTranscript =
    typeof fields.liveTranscript === "string" && fields.liveTranscript.trim()
      ? fields.liveTranscript.trim()
      : null;

  const recording = await prisma.recording.create({
    data: {
      presentationId: id,
      filePath,
      fileName: file.filename,
      durationSec,
      ...(liveTranscript
        ? { transcript: liveTranscript, transcriptStatus: "done" }
        : { transcriptStatus: "pending" }),
    },
  });

  // 有实时转写结果则直接采用，无需再离线转写；否则后台异步转写兜底
  if (!liveTranscript) {
    void transcribeRecording(recording.id);
  }

  return NextResponse.json({ recording }, { status: 201 });
}
