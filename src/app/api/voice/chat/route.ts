import { NextRequest, NextResponse } from "next/server";
import { transcribeSpeech, synthesizeSpeech, chatText } from "@/lib/arkVoice";
import { parseWav, pcmToWav } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = "你是食刻冰箱的语音助手，叫小刻。用简短、自然的中文口语回答，通常一到两句话，不要使用 markdown，不要输出列表。";

/**
 * 实时语音对话（单轮）：K230 上传 16k WAV -> ASR -> LLM 闲聊 -> TTS -> 返回 16k WAV。
 * 通过响应头返回各阶段耗时：X-Asr-Ms / X-Llm-Ms / X-Tts-Ms / X-Total-Ms / X-Reply。
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

  const t0 = Date.now();
  let text = "";
  try {
    text = await transcribeSpeech(pcm);
  } catch (e) {
    return NextResponse.json(
      { error: "ASR 失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
  const asrMs = Date.now() - t0;

  const t1 = Date.now();
  let reply = "";
  try {
    reply = await chatText(SYSTEM, text.trim() || "（用户没有说话）");
  } catch {
    reply = "";
  }
  const llmMs = Date.now() - t1;
  if (!reply) reply = "我在听，请再说一遍。";

  const t2 = Date.now();
  let ttsPcm: Buffer;
  try {
    ttsPcm = await synthesizeSpeech(reply, { format: "pcm", sampleRate: 16000 });
  } catch (e) {
    return NextResponse.json(
      { error: "TTS 失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
  const ttsMs = Date.now() - t2;
  const totalMs = Date.now() - t0;

  const wav = pcmToWav(ttsPcm, 16000, 1, 16);
  return new NextResponse(wav, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      "X-Asr-Ms": String(asrMs),
      "X-Llm-Ms": String(llmMs),
      "X-Tts-Ms": String(ttsMs),
      "X-Total-Ms": String(totalMs),
      "X-Reply": encodeURIComponent(reply),
    },
  });
}
