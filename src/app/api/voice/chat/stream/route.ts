import { NextRequest, NextResponse } from "next/server";
import { realtimeChatStream } from "@/lib/arkRealtime";
import { transcribeSpeech, synthesizeSpeech, chatText } from "@/lib/arkVoice";
import { parseWav } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 流式实时语音：上传 16k WAV，响应以 chunked 流式返回 16k PCM。
 *
 * 对齐小智的管线：豆包端到端实时语音的 TTS 分片生成即下发（实测首包 ~1.3s），
 * 不再等整段音频合成完；若 3.5s 内拿不到首个音频分片，回退到
 * ASR -> LLM -> TTS 串行管线整段分块下发，保证仍能回话。
 */
export async function POST(req: NextRequest) {
  // 支持两种上行：整段 WAV（RIFF 头），或板端 chunked 流式上传的裸 16k PCM。
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length < 1000) {
    return NextResponse.json({ error: "音频数据过短" }, { status: 400 });
  }
  const isWav =
    body.length >= 12 && body.subarray(0, 4).toString("latin1") === "RIFF";
  const pcm = isWav ? parseWav(body).pcm : Buffer.from(body);
  if (pcm.length < 1000) {
    return NextResponse.json({ error: "无法解析音频" }, { status: 400 });
  }

  const SYSTEM = "你是食刻冰箱语音助手小刻，用一句话简短回答，不要超过20个字，不要加动作描写。";

  const tStart = Date.now();
  // 先探测首个音频分片：流式管线首包约 1.3s，等 6s 拿不到再走回退。
  const upstream = realtimeChatStream(pcm, { systemPrompt: SYSTEM, timeoutMs: 15_000 });
  const reader = upstream.getReader();

  let first: ReadableStreamReadResult<Uint8Array> | null = null;
  try {
    first = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
  } catch {
    first = null;
  }

  const firstChunk = first && !first.done ? first.value : null;
  if (firstChunk) {
    console.log("[chat/stream] realtime 首包 %d ms", Date.now() - tStart);
    // 流式路径：首包已就绪，后续分片持续转发（边合成边下发）
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(firstChunk);
          for (;;) {
            const r = await reader.read();
            if (r.done) break;
            controller.enqueue(r.value);
          }
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/pcm",
        "Cache-Control": "no-store",
        "X-Path": "realtime",
        "X-First-Ms": String(Date.now() - tStart),
      },
    });
  }

  // 回退：串行 ASR -> LLM -> TTS，整段分块下发
  try {
    console.log("[chat/stream] realtime 超时/失败，走回退管线");
    reader.cancel().catch(() => {});
    const text = await transcribeSpeech(pcm);
    let reply = "";
    try {
      reply = await chatText(SYSTEM, text.trim() || "（用户没有说话）");
    } catch {
      reply = "";
    }
    if (!reply) reply = "我在听，请再说一遍。";
    const audioPcm = await synthesizeSpeech(reply, { format: "pcm", sampleRate: 16000 });
    console.log("[chat/stream] 回退管线完成 %d ms, reply=%s",
      Date.now() - tStart, reply.slice(0, 40));

    const step = 3200;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        try {
          for (let i = 0; i < audioPcm.length; i += step) {
            controller.enqueue(new Uint8Array(audioPcm.subarray(i, i + step)));
          }
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/pcm",
        "Cache-Control": "no-store",
        "X-Path": "fallback",
        "X-First-Ms": String(Date.now() - tStart),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "语音对话失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
}
