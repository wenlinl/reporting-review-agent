import "server-only";
import crypto from "crypto";

/**
 * 字节火山引擎 · 豆包语音合成大模型（HTTP Chunked 单向流式-V3）
 * 端点：https://openspeech.bytedance.com/api/v3/tts/unidirectional
 */

const TTS_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

function ttsHeaders(): Record<string, string> {
  const apiKey = process.env.VOLC_TTS_API_KEY || process.env.VOLC_SPEECH_API_KEY || "";
  const appId = process.env.VOLC_SPEECH_APP_ID || "";
  const resourceId = process.env.VOLC_TTS_RESOURCE_ID || "seed-tts-2.0";
  const headers: Record<string, string> = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": crypto.randomUUID(),
    "X-Api-Sequence": "-1",
    "X-Api-Connect-Id": crypto.randomUUID(),
    "Content-Type": "application/json",
  };
  if (appId) {
    headers["X-Api-App-Key"] = appId;
    headers["X-Api-Access-Key"] = apiKey;
  } else {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

export function ttsConfigured(): boolean {
  return Boolean(process.env.VOLC_TTS_API_KEY || process.env.VOLC_SPEECH_API_KEY);
}

/** 从可能拼接了多个 JSON 对象的文本中逐个提取并解析（尊重字符串内的括号/引号） */
function extractJsonObjects(text: string): Record<string, unknown>[] {
  const objs: Record<string, unknown>[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] !== "{") {
      i++;
      continue;
    }
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    try {
      objs.push(JSON.parse(text.slice(start, i)) as Record<string, unknown>);
    } catch {
      // 忽略无法解析的片段
    }
  }
  return objs;
}

export async function synthesizeText(text: string): Promise<{ audio: Buffer; mime: string }> {
  if (!ttsConfigured()) {
    throw new Error("未配置 TTS API Key");
  }

  const voice = process.env.VOLC_TTS_VOICE || "zh_female_vv_uranus_bigtts";
  const format = (process.env.VOLC_TTS_FORMAT || "mp3") as "mp3" | "ogg_opus" | "pcm";
  const payload = {
    user: { uid: "midyear-workshop" },
    req_params: {
      text,
      speaker: voice,
      audio_params: {
        format,
        sample_rate: 24000,
        ...(format !== "pcm" ? { bit_rate: 64000 } : {}),
      },
      additions: JSON.stringify({
        disable_markdown_filter: true,
        disable_emoji_filter: true,
      }),
    },
  };

  const body = JSON.stringify(payload);
  const res = await fetch(process.env.VOLC_TTS_BASE_URL || TTS_URL, {
    method: "POST",
    headers: ttsHeaders(),
    body,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`TTS 接口调用失败 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const audio = await collectFrames(res.body);
  if (!audio || audio.length === 0) {
    throw new Error("TTS 未返回音频数据");
  }
  const mime = format === "ogg_opus" ? "audio/ogg" : format === "pcm" ? "audio/pcm" : "audio/mpeg";
  return { audio, mime };
}

async function collectFrames(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const parts: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(Buffer.from(value));
  }
  const acc = Buffer.concat(parts);
  if (acc.length === 0) return acc;

  // 1) 非二进制帧协议：HTTP 接口返回一个或多个 { code, data(base64 音频片段) } JSON 对象
  if ((acc[0] >> 4) !== 0b0001) {
    const pieces: Buffer[] = [];
    for (const j of extractJsonObjects(acc.toString("utf8"))) {
      const code = j.code as number | undefined;
      if (code && code !== 3000 && code !== 0 && code !== 20000000) {
        throw new Error(`TTS 业务错误 ${code}: ${(j.message as string) || "未知"}`);
      }
      if (typeof j.data === "string" && j.data) {
        pieces.push(Buffer.from(j.data, "base64"));
      }
    }
    return Buffer.concat(pieces);
  }

  // 2) 二进制帧协议（WebSocket 风格帧）
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= acc.length) {
    const b1 = acc[offset + 1];
    const msgType = b1 >> 4;
    const flags = b1 & 0x0f;
    let cursor = offset + 4;
    if (flags & 0b0001) {
      if (cursor + 4 > acc.length) break;
      cursor += 4;
    }
    if (cursor + 4 > acc.length) break;
    const size = acc.readUInt32BE(cursor);
    cursor += 4;
    if (cursor + size > acc.length) break;
    const frame = acc.subarray(cursor, cursor + size);
    if (msgType === 0b1111) {
      const text = frame.toString("utf8");
      let msg = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { message?: string; code?: number | string };
        msg = j.message || `错误码 ${j.code ?? ""}`;
      } catch {
        // 原文
      }
      throw new Error(`TTS 服务错误：${msg}`);
    }
    if (msgType === 0b1011) {
      chunks.push(Buffer.from(frame));
    } else if (msgType === 0b1001) {
      const text = frame.toString("utf8");
      try {
        const j = JSON.parse(text) as { code?: number; message?: string; data?: string };
        if (j.code && j.code !== 3000 && j.code !== 0 && j.code !== 20000000) {
          throw new Error(`TTS 业务错误 ${j.code}: ${j.message || "未知"}`);
        }
        if (typeof j.data === "string" && j.data) {
          chunks.push(Buffer.from(j.data, "base64"));
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("TTS")) throw e;
      }
    }
    offset = cursor + size;
  }
  return Buffer.concat(chunks);
}
