import { NextRequest, NextResponse } from "next/server";
import { transcribeSpeech, synthesizeSpeech } from "@/lib/arkVoice";
import { parseWav, pcmToWav } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 最小语音回环（打通 K230 ↔ 云端音频链路）：
 *   K230 上传 16k/16bit/单声道 WAV → ASR 转文字 → TTS 合成回读 → 返回 16k WAV。
 *
 * 请求：POST /api/voice/echo，body 为原始 WAV 字节（Content-Type: audio/wav 或 application/octet-stream）。
 * 响应：audio/wav（16k/mono/16bit）。
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

  let text = "";
  try {
    text = await transcribeSpeech(pcm);
  } catch (e) {
    return NextResponse.json(
      { error: "ASR 失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  const reply = text.trim()
    ? `我听到你说：${text.trim()}`
    : "我没有听清，请再说一遍。";

  let ttsPcm: Buffer;
  try {
    ttsPcm = await synthesizeSpeech(reply, { format: "pcm", sampleRate: 16000 });
  } catch (e) {
    return NextResponse.json(
      { error: "TTS 失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  const wav = pcmToWav(ttsPcm, 16000, 1, 16);
  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "X-Asr-Text": encodeURIComponent(text.trim()),
    },
  });
}
