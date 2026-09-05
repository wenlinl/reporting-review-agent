import "server-only";
import { randomUUID } from "crypto";
import { gunzipSync } from "zlib";
import WebSocket from "ws";

/**
 * 火山引擎「豆包端到端实时语音」转发模块。
 *
 * 与 arkVoice.ts 的 ASR/TTS 分离不同，这里用一条 WSS 同时完成
 * 识别 -> 大模型对话 -> 合成，首包音频延迟更低（实测约 1.3s）。
 *
 * 协议参考：https://www.volcengine.com/docs/6561/1594356
 */

const WS_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const RESOURCE_ID = "volc.speech.dialog";

// 消息类型
const FULL_CLIENT_REQUEST = 0b0001;
const AUDIO_ONLY_REQUEST = 0b0010;
const ERROR = 0b1111;
const FLAG_EVENT = 0b0100;
const SERIAL_JSON = 0b0001;
const SERIAL_RAW = 0b0000;

// 客户端事件
const START_CONNECTION = 1;
const START_SESSION = 100;
const FINISH_SESSION = 102;
const TASK_REQUEST = 200;
const END_ASR = 400;

// 服务端事件
const CONNECTION_STARTED = 50;
const SESSION_STARTED = 150;
const ASR_RESPONSE = 451;
const ASR_ENDED = 459;
const TTS_RESPONSE = 352;
const TTS_ENDED = 359;
const CHAT_RESPONSE = 550;

function buildHeader(msgType: number, flags: number, serial: number, comp = 0): Buffer {
  return Buffer.from([0x11, (msgType << 4) | (flags & 0x0f), (serial << 4) | (comp & 0x0f), 0x00]);
}

function buildEvent(eventId: number, payload: object = {}, sessionId?: string): Buffer {
  const parts: Buffer[] = [buildHeader(FULL_CLIENT_REQUEST, FLAG_EVENT, SERIAL_JSON)];
  const ev = Buffer.alloc(4);
  ev.writeUInt32BE(eventId);
  parts.push(ev);
  if (sessionId && eventId >= 100) {
    const sid = Buffer.from(sessionId, "utf8");
    const l = Buffer.alloc(4);
    l.writeUInt32BE(sid.length);
    parts.push(l, sid);
  }
  const p = Buffer.from(JSON.stringify(payload), "utf8");
  const pl = Buffer.alloc(4);
  pl.writeUInt32BE(p.length);
  parts.push(pl, p);
  return Buffer.concat(parts);
}

function buildAudio(audio: Buffer, sessionId: string): Buffer {
  const parts: Buffer[] = [buildHeader(AUDIO_ONLY_REQUEST, FLAG_EVENT, SERIAL_RAW)];
  const ev = Buffer.alloc(4);
  ev.writeUInt32BE(TASK_REQUEST);
  parts.push(ev);
  const sid = Buffer.from(sessionId, "utf8");
  const sl = Buffer.alloc(4);
  sl.writeUInt32BE(sid.length);
  parts.push(sl, sid);
  const al = Buffer.alloc(4);
  al.writeUInt32BE(audio.length);
  parts.push(al, audio);
  return Buffer.concat(parts);
}

type ParsedFrame = {
  msgType: number;
  eventId: number | null;
  sessionId: string | null;
  errorCode: number | null;
  payload: Buffer;
  dict: Record<string, any> | null;
};

function parseFrame(data: Buffer): ParsedFrame {
  const msgType = (data[1] >> 4) & 0x0f;
  const flags = data[1] & 0x0f;
  const serial = (data[2] >> 4) & 0x0f;
  const comp = data[2] & 0x0f;
  let pos = 4;

  let errorCode: number | null = null;
  if (msgType === ERROR && pos + 4 <= data.length) {
    errorCode = data.readUInt32BE(pos);
    pos += 4;
  }

  const seqMode = flags & 0b0011;
  if ((seqMode === 0b0001 || seqMode === 0b0011) && pos + 4 <= data.length) {
    pos += 4;
  }

  let eventId: number | null = null;
  let sessionId: string | null = null;
  if (flags & FLAG_EVENT && pos + 4 <= data.length) {
    eventId = data.readUInt32BE(pos);
    pos += 4;
    if (eventId >= 100 && pos + 4 <= data.length) {
      const sl = data.readUInt32BE(pos);
      pos += 4;
      if (sl > 0 && pos + sl <= data.length) {
        sessionId = data.subarray(pos, pos + sl).toString("utf8");
        pos += sl;
      }
    }
  }

  let payload: Buffer = Buffer.alloc(0);
  if (pos + 4 <= data.length) {
    const ps = data.readUInt32BE(pos);
    pos += 4;
    if (ps > 0 && pos + ps <= data.length) {
      payload = data.subarray(pos, pos + ps);
      if (comp === 1 && payload.length) {
        payload = gunzipSync(payload);
      }
    }
  }

  let dict: Record<string, any> | null = null;
  if (serial === SERIAL_JSON && payload.length) {
    try {
      dict = JSON.parse(payload.toString("utf8"));
    } catch {
      dict = null;
    }
  }

  return { msgType, eventId, sessionId, errorCode, payload, dict };
}

export type RealtimeResult = {
  text: string;
  audioPcm: Buffer;
  firstAudioMs: number;
  totalMs: number;
};

export async function realtimeChat(
  pcm: Buffer,
  opts: { systemPrompt?: string; speaker?: string; model?: string; timeoutMs?: number } = {},
): Promise<RealtimeResult> {
  const key = process.env.VOLC_SPEECH_API_KEY;
  if (!key) throw new Error("未配置 VOLC_SPEECH_API_KEY");

  const model = opts.model ?? "1.2.1.1";
  const speaker = opts.speaker ?? "saturn_zh_female_keainvsheng_tob";
  const systemPrompt =
    opts.systemPrompt ??
    "你是食刻冰箱语音助手小刻，用一句话简短回答，不要超过20个字，不要加动作描写。";

  return await new Promise<RealtimeResult>((resolve, reject) => {
    const connectId = randomUUID();
    const ws = new WebSocket(WS_URL, {
      headers: {
        "X-Api-Key": key,
        "X-Api-Resource-Id": RESOURCE_ID,
        "X-Api-Connect-Id": connectId,
      },
    });
    ws.binaryType = "arraybuffer";

    let sessionId: string | null = null;
    let sessionActive = false;
    let settled = false;
    let text = "";
    let replyText = "";
    const audioChunks: Buffer[] = [];
    const t0 = Date.now();
    let firstAudioMs = 0;
    let totalMs = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        if (sessionActive && sessionId) {
          ws.send(buildEvent(FINISH_SESSION, {}, sessionId));
        }
        ws.close();
      } catch {
        /* ignore */
      }
      fn();
    };

    const timeoutMs = opts.timeoutMs ?? 15_000;
    const timeout = setTimeout(() => finish(() => reject(new Error("实时对话超时"))), timeoutMs);

    ws.on("open", () => {
      ws.send(buildEvent(START_CONNECTION, {}));
    });

    ws.on("message", (raw: ArrayBuffer | Buffer) => {
      const f = parseFrame(Buffer.from(raw as ArrayBuffer));
      const eid = f.eventId;

      if (f.msgType === ERROR || eid === 599) {
        clearTimeout(timeout);
        finish(() => reject(new Error(`实时对话错误: ${JSON.stringify(f.dict ?? f.errorCode)}`)));
        return;
      }

      if (eid === CONNECTION_STARTED) {
        sessionId = randomUUID();
        const cfg = {
          tts: {
            speaker,
            audio_config: { channel: 1, format: "pcm_s16le", sample_rate: 16000 },
          },
          dialog: {
            extra: { model, input_mod: "push_to_talk" },
            system_role: systemPrompt,
          },
        };
        ws.send(buildEvent(START_SESSION, cfg, sessionId));
        return;
      }

      if (eid === SESSION_STARTED) {
        sessionActive = true;
        const step = 3200;
        for (let i = 0; i < pcm.length; i += step) {
          ws.send(buildAudio(pcm.subarray(i, i + step), sessionId!));
        }
        ws.send(buildEvent(END_ASR, {}, sessionId!));
        return;
      }

      if (eid === ASR_RESPONSE) {
        const results = f.dict?.results ?? [];
        for (const r of results) {
          if (r?.text && !r?.is_interim) text = String(r.text);
        }
        return;
      }

      if (eid === CHAT_RESPONSE) {
        if (f.dict?.content) replyText += String(f.dict.content);
        return;
      }

      if (eid === TTS_RESPONSE) {
        if (!firstAudioMs) firstAudioMs = Date.now() - t0;
        if (f.payload.length) audioChunks.push(f.payload);
        return;
      }

      if (eid === TTS_ENDED) {
        totalMs = Date.now() - t0;
        clearTimeout(timeout);
        finish(() => resolve({ text: replyText || text, audioPcm: Buffer.concat(audioChunks), firstAudioMs, totalMs }));
        return;
      }
    });

    ws.on("error", (e: Error) => {
      clearTimeout(timeout);
      finish(() => reject(e));
    });
    ws.on("close", () => {
      if (!settled) {
        clearTimeout(timeout);
        finish(() => {
          if (audioChunks.length) {
            totalMs = totalMs || Date.now() - t0;
            resolve({ text: replyText || text, audioPcm: Buffer.concat(audioChunks), firstAudioMs, totalMs });
          } else {
            reject(new Error("实时对话连接提前关闭"));
          }
        });
      }
    });
  });
}

/** 流式版本：返回一个会持续吐出 16k PCM 分片的 ReadableStream（用于板端边收边播）。 */
export function realtimeChatStream(
  pcm: Buffer,
  opts: { systemPrompt?: string; speaker?: string; model?: string; timeoutMs?: number } = {},
): ReadableStream<Uint8Array> {
  const key = process.env.VOLC_SPEECH_API_KEY;
  if (!key) throw new Error("未配置 VOLC_SPEECH_API_KEY");

  const model = opts.model ?? "1.2.1.1";
  const speaker = opts.speaker ?? "saturn_zh_female_keainvsheng_tob";
  const systemPrompt =
    opts.systemPrompt ??
    "你是食刻冰箱语音助手小刻，用一句话简短回答，不要超过20个字，不要加动作描写。";
  const timeoutMs = opts.timeoutMs ?? 15_000;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const connectId = randomUUID();
      const ws = new WebSocket(WS_URL, {
        headers: {
          "X-Api-Key": key,
          "X-Api-Resource-Id": RESOURCE_ID,
          "X-Api-Connect-Id": connectId,
        },
      });
      ws.binaryType = "arraybuffer";

      let sessionId: string | null = null;
      let sessionActive = false;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        try {
          if (sessionActive && sessionId) ws.send(buildEvent(FINISH_SESSION, {}, sessionId));
          ws.close();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      const timer = setTimeout(() => {
        try {
          controller.error(new Error("实时对话超时"));
        } catch {
          /* ignore */
        }
        close();
      }, timeoutMs);

      ws.on("open", () => {
        ws.send(buildEvent(START_CONNECTION, {}));
      });

      ws.on("message", (raw: ArrayBuffer | Buffer) => {
        const f = parseFrame(Buffer.from(raw as ArrayBuffer));
        const eid = f.eventId;

        if (f.msgType === ERROR || eid === 599) {
          try {
            controller.error(new Error(JSON.stringify(f.dict ?? f.errorCode)));
          } catch {
            /* ignore */
          }
          close();
          return;
        }

        if (eid === CONNECTION_STARTED) {
          sessionId = randomUUID();
          const cfg = {
            tts: {
              speaker,
              audio_config: { channel: 1, format: "pcm_s16le", sample_rate: 16000 },
            },
            dialog: {
              extra: { model, input_mod: "push_to_talk" },
              system_role: systemPrompt,
            },
          };
          ws.send(buildEvent(START_SESSION, cfg, sessionId));
          return;
        }

        if (eid === SESSION_STARTED) {
          sessionActive = true;
          const step = 3200;
          for (let i = 0; i < pcm.length; i += step) {
            ws.send(buildAudio(pcm.subarray(i, i + step), sessionId!));
          }
          ws.send(buildEvent(END_ASR, {}, sessionId!));
          return;
        }

        if (eid === TTS_RESPONSE) {
          if (f.payload.length) controller.enqueue(new Uint8Array(f.payload));
          return;
        }

        if (eid === TTS_ENDED) {
          close();
          return;
        }
      });

      ws.on("error", (e: Error) => {
        try {
          controller.error(e);
        } catch {
          /* ignore */
        }
        close();
      });
      ws.on("close", () => {
        if (!closed) close();
      });
    },
  });
}
