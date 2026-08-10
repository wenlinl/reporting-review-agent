import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getSession } from "@/lib/auth";
import { synthesizeText, ttsConfigured } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ttsCacheDir(): string {
  const dir = path.join(process.env.DATA_DIR || path.join(process.cwd(), "data", "uploads"), "tts");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function GET() {
  return NextResponse.json({ configured: ttsConfigured() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { text, key } = await req.json().catch(() => ({ text: null as string | null, key: null as string | null }));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "缺少合成文本" }, { status: 400 });
  }
  const trimmed = text.trim().slice(0, 2000);

  if (!ttsConfigured()) {
    return NextResponse.json({ error: "TTS 未配置" }, { status: 501 });
  }

  // 缓存键基于「文本内容」哈希：内容一变就重新合成，避免反馈重新生成后播放旧音频
  const cacheKey = `t-${crypto.createHash("sha1").update(trimmed).digest("hex").slice(0, 16)}`;
  const cached = path.join(ttsCacheDir(), `${cacheKey}.mp3`);
  if (fs.existsSync(cached)) {
    return new Response(fs.readFileSync(cached), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  try {
    const { audio, mime } = await synthesizeText(trimmed);
    try {
      fs.writeFileSync(cached, audio);
    } catch {
      // 缓存失败不影响播放
    }
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "语音合成失败，请稍后重试" },
      { status: 502 },
    );
  }
}
