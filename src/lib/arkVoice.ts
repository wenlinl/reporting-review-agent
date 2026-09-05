import "server-only";
import { gzipSync, gunzipSync } from "zlib";
import { chatJson } from "@/lib/ai";

/**
 * 食刻 · 云端语音能力封装：TTS / ASR / 语音意图解析。
 *
 * 服务与 key 分开：
 *   - LLM（NLU）：火山方舟 Ark，用 ARK_API_KEY（模型 ARK_CHAT_MODEL）
 *   - TTS：火山语音 openspeech v3，用 VOLC_SPEECH_API_KEY（资源 seed-tts-2.0）
 *   - ASR：火山语音 openspeech v3 SAUC 流式，用 VOLC_SPEECH_API_KEY（资源 volc.seedasr.sauc.duration）
 *
 * ASR 走 WebSocket，需要安装 ws：
 *   pnpm add ws && pnpm add -D @types/ws
 */

const SPEECH_BASE = "https://openspeech.bytedance.com/api/v3";
const ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
const ASR_RESOURCE_ID = "volc.seedasr.sauc.duration";
const TTS_RESOURCE_ID = "seed-tts-2.0";

function requireSpeechKey(): string {
  const key = process.env.VOLC_SPEECH_API_KEY;
  if (!key) {
    throw new Error("未配置 VOLC_SPEECH_API_KEY，请在 .env 中填写火山语音 API Key");
  }
  return key;
}

// ---------------- TTS ----------------

export type SynthesizeOptions = {
  voice?: string;
  format?: "mp3" | "wav" | "pcm" | "ogg_opus";
  sampleRate?: number;
};

export async function synthesizeSpeech(
  text: string,
  opts: SynthesizeOptions = {},
): Promise<Buffer> {
  const key = requireSpeechKey();
  const voice =
    opts.voice ||
    process.env.TTS_VOICE ||
    "zh_female_shuangkuaisisi_uranus_bigtts";

  const audioParams: Record<string, unknown> = { format: opts.format ?? "mp3" };
  if (opts.sampleRate) audioParams.sample_rate = opts.sampleRate;

  const res = await fetch(`${SPEECH_BASE}/tts/unidirectional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Resource-Id": TTS_RESOURCE_ID,
      "X-Api-Key": key,
    },
    body: JSON.stringify({
      user: { uid: `shike-${Date.now()}` },
      req_params: { text, speaker: voice, audio_params: audioParams },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`TTS 接口调用失败 (${res.status}): ${err.slice(0, 500)}`);
  }

  const raw = await res.text();
  const chunks: Buffer[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let p: any;
    try {
      p = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (p?.code === 0 && p?.data) {
      chunks.push(Buffer.from(p.data, "base64"));
    } else if (p?.code !== undefined && p?.code !== 0 && p?.code !== 20000000) {
      throw new Error(`TTS 流错误: ${JSON.stringify(p)}`);
    }
  }

  const audio = Buffer.concat(chunks);
  if (!audio.length) throw new Error("TTS 返回空音频");
  return audio;
}

// ---------------- ASR ----------------

function buildAsrFullRequest(seq: number, payload: object): Buffer {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload)));
  const header = Buffer.from([0x11, 0x11, 0x11, 0x00]);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(seq);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(compressed.length);
  return Buffer.concat([header, seqBuf, lenBuf, compressed]);
}

function buildAsrAudioFrame(seq: number, audio: Buffer, last = false): Buffer {
  const compressed = gzipSync(audio);
  const header = Buffer.from([0x11, last ? 0x23 : 0x21, 0x01, 0x00]);
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(last ? -seq : seq);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(compressed.length);
  return Buffer.concat([header, seqBuf, lenBuf, compressed]);
}

export async function transcribeSpeech(pcm: Buffer): Promise<string> {
  const key = requireSpeechKey();
  let WsImpl: any;
  try {
    WsImpl = (await import("ws")).default;
  } catch {
    WsImpl = (globalThis as any).WebSocket;
  }
  if (!WsImpl) throw new Error("缺少 WebSocket 依赖（请安装 ws）");

  return await new Promise<string>((resolve, reject) => {
    const headers: Record<string, string> = {
      "X-Api-Resource-Id": ASR_RESOURCE_ID,
      "X-Api-Request-Id": crypto.randomUUID(),
      "X-Api-Sequence": "-1",
      "X-Api-Connect-Id": crypto.randomUUID(),
      "X-Api-Key": key,
    };
    const ws = new WsImpl(ASR_WS_URL, { headers });
    ws.binaryType = "arraybuffer";
    let finalText = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    ws.on("open", () => {
      const payload = {
        user: { uid: "shike" },
        audio: { format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1 },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true,
          show_utterances: true,
          result_type: "full",
          enable_nonstream: true,
          end_window_size: 800,
          force_to_speech_time: 1000,
        },
      };
      ws.send(buildAsrFullRequest(1, payload), { binary: true });
      let seq = 1;
      const step = 3200;
      for (let i = 0; i < pcm.length; i += step) {
        seq += 1;
        ws.send(buildAsrAudioFrame(seq, pcm.subarray(i, i + step)), { binary: true });
      }
      ws.send(buildAsrAudioFrame(seq + 1, Buffer.alloc(0), true), { binary: true });
    });

    ws.on("message", (raw: ArrayBuffer | Buffer) => {
      const frame = Buffer.from(raw as ArrayBuffer);
      if (frame.length < 4) return;
      const hs = frame[0] & 0x0f;
      const msgType = frame[1] >> 4;
      const flags = frame[1] & 0x0f;
      const serial = frame[2] >> 4;
      const comp = frame[2] & 0x0f;
      let off = hs * 4;
      if (flags & 0x01) off += 4;

      if (msgType === 0b1111) {
        const code = frame.readInt32BE(off);
        off += 4;
        const size = frame.readUInt32BE(off);
        off += 4;
        finish(() => reject(new Error(`ASR 服务端错误 code=${code}`)));
        return;
      }
      if (msgType !== 0b1001) return;
      const size = frame.readUInt32BE(off);
      off += 4;
      let data = frame.subarray(off, off + size);
      if (comp === 0b0001 && data.length) data = gunzipSync(data);
      const payload = serial === 0b0001 ? JSON.parse(data.toString("utf-8")) : {};
      if (flags & 0x02) {
        finalText = payload?.result?.text || "";
        finish(() => resolve(finalText));
      }
    });

    ws.on("error", (e: Error) => finish(() => reject(e)));
    setTimeout(() => finish(() => reject(new Error("ASR 等待最终结果超时"))), 30_000);
  });
}

// ---------------- NLU ----------------

export type VoiceIntent = {
  action: "IN" | "OUT";
  product: string;
  quantity: number | null;
  unit: "个" | "盒" | "袋";
};

const INTENT_SYSTEM = `你是“食刻”冰箱库存语音助手。从用户口述中抽取结构化信息，只输出 JSON：
{"action":"IN|OUT","product":"标准商品名","quantity":数字或null,"unit":"个|盒|袋"}
规则：动作缺省为 IN；单位缺省为 个；只提到“一个/两个/几个”等明确数字时才填 quantity；用户只说“一袋苹果”“一盒牛奶”而没给袋/盒内数量时 quantity 为 null，unit 填“袋/盒”。`;

export async function parseVoiceIntent(
  userText: string,
  context: { defaultAction?: "IN" | "OUT" } = {},
): Promise<VoiceIntent> {
  const raw = await chatJson<Partial<VoiceIntent>>(INTENT_SYSTEM, userText, {
    temperature: 0.1,
    maxTokens: 300,
  });
  return {
    action: raw.action === "OUT" ? "OUT" : raw.action === "IN" ? "IN" : (context.defaultAction ?? "IN"),
    product: String(raw.product ?? "").trim(),
    quantity:
      raw.quantity == null || raw.quantity === undefined
        ? null
        : Math.max(1, Math.round(Number(raw.quantity))),
    unit: raw.unit === "盒" || raw.unit === "袋" ? raw.unit : "个",
  };
}

/** 火山方舟纯文本对话（用于实时语音聊天，不要求 JSON）。 */
export async function chatText(
  system: string,
  user: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const base = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("未配置 ARK_API_KEY");
  const model = process.env.ARK_CHAT_MODEL || "deepseek-v4-flash-ga-260731";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens ?? 200,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`AI 对话失败 (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}
