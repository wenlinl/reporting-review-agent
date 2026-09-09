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

  // 两条管线并行赛跑，谁先出声用谁：
  //  A) 豆包端到端实时（短句首包 ~1.5s，偶发慢/无输出）
  //  B) ASR -> LLM -> bigtts 串行回退（稳定但 9~15s）
  // 不再串行"先探测 N 秒再回退"，两条同时跑，取先到者。
  const upstream = realtimeChatStream(pcm, { systemPrompt: SYSTEM, timeoutMs: 15_000 });
  const reader = upstream.getReader();

  const fallbackPromise = (async () => {
    const text = await transcribeSpeech(pcm);
    let reply = "";
    try {
      reply = await chatText(SYSTEM, text.trim() || "（用户没有说话）");
    } catch {
      reply = "";
    }
    if (!reply) reply = "我在听，请再说一遍。";
    const audioPcm = await synthesizeSpeech(reply, { format: "pcm", sampleRate: 16000 });
    console.log("[chat/stream] 回退管线完成 %d ms reply=%s",
      Date.now() - tStart, reply.slice(0, 40));
    return audioPcm;
  })();

  type Race =
    | { kind: "rt"; chunk: Uint8Array }
    | { kind: "rterr"; e: string }
    | { kind: "fb"; audioPcm: Buffer };

  let race: Race;
  try {
    race = await Promise.race<Race>([
      reader.read().then(
        (r) =>
          (r.done
            ? { kind: "rterr", e: "rt_done_no_audio" }
            : { kind: "rt", chunk: r.value }) as Race,
        (e) =>
          ({ kind: "rterr", e: String((e instanceof Error && e.message) || e) }) as Race,
      ),
      fallbackPromise.then((audioPcm) => ({ kind: "fb", audioPcm }) as Race),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: "语音对话失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

  if (race.kind === "rt") {
    const firstChunk = race.chunk;
    fallbackPromise.catch(() => {}); // 实时赢了，丢弃回退结果（避免未处理 rejection）
    console.log("[chat/stream] realtime 首包 %d ms", Date.now() - tStart);
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
        "X-Realtime-Err": "",
      },
    });
  }

  // 回退赢（或实时出错）：用回退整段音频分块下发
  const rtErr = race.kind === "rterr" ? race.e : "rt_slow";
  if (race.kind === "rterr") {
    console.log("[chat/stream] realtime 失败: %s", rtErr);
  }
  reader.cancel().catch(() => {});
  let audioPcm: Buffer;
  try {
    audioPcm = race.kind === "fb" ? race.audioPcm : await fallbackPromise;
  } catch (e) {
    return NextResponse.json(
      { error: "语音对话失败: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }

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
      "X-Realtime-Err": rtErr,
    },
  });
}
