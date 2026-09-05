import { NextRequest, NextResponse } from "next/server";
import { realtimeChat } from "@/lib/arkRealtime";
import { transcribeSpeech, synthesizeSpeech, chatText } from "@/lib/arkVoice";
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

  const SYSTEM = "你是食刻冰箱语音助手小刻，用一句话简短回答，不要超过20个字，不要加动作描写。";

  let result: { text: string; audioPcm: Buffer; firstAudioMs: number; totalMs: number };
  try {
    result = await realtimeChat(pcm, { timeoutMs: 12_000 });
  } catch (e) {
    // 端到端实时语音偶发超时，回退到 ASR + LLM + TTS 管线，保证仍能回话
    try {
      const text = await transcribeSpeech(pcm);
      let reply = "";
      try {
        reply = await chatText(SYSTEM, text.trim() || "（用户没有说话）");
      } catch {
        reply = "";
      }
      if (!reply) reply = "我在听，请再说一遍。";
      const ttsPcm = await synthesizeSpeech(reply, { format: "pcm", sampleRate: 16000 });
      result = { text: reply, audioPcm: ttsPcm, firstAudioMs: 0, totalMs: 0 };
    } catch (e2) {
      return NextResponse.json(
        { error: "语音对话失败: " + (e2 instanceof Error ? e2.message : String(e2)) },
        { status: 502 },
      );
    }
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
