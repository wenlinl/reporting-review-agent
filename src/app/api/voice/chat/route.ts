import { NextRequest, NextResponse } from "next/server";
import { realtimeChat } from "@/lib/arkRealtime";
import { parseWav, pcmToWav } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 实时语音对话：K230 上传 16k WAV -> 豆包端到端实时语音（识别+对话+合成）-> 返回 16k WAV。
 * 响应头：X-Reply（文本）/ X-First-Audio-Ms / X-Total-Ms。
 */
export async function POST(req: NextRequest) {
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length < 1000) {
    return NextResponse.json({ error: "音频数据过短" }, { status: 400 });
  }

  const { pcm } = parseWav(body);
  if (pcm.length < 1000) {
    return NextResponse.json({ error: "无法解析音频" }, { status: 400 });
  }

  let result;
  try {
    result = await realtimeChat(pcm);
  } catch (e) {
    return NextResponse.json(
      { error: "实时对话失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  if (!result.audioPcm.length) {
    return NextResponse.json({ error: "未收到语音回复" }, { status: 502 });
  }

  const wav = pcmToWav(result.audioPcm, 16000, 1, 16);
  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "X-Reply": encodeURIComponent(result.text || ""),
      "X-First-Audio-Ms": String(result.firstAudioMs),
      "X-Total-Ms": String(result.totalMs),
    },
  });
}
