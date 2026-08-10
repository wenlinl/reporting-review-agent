import "server-only";
import crypto from "crypto";

/**
 * 字节火山引擎 · 豆包大模型流式语音识别（WebSocket V3）
 * 协议文档：https://docs.volcengine.com/docs/6561/1354869
 * 浏览器无法携带鉴权头，因此由服务端代理连接。
 */

const WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";

// 2.0 资源支持说话人分离（需 enable_nonstream + ssd_version=200）
const RESOURCE_ASR2 = "volc.seedasr.sauc.duration";
// 1.0 资源兜底
const RESOURCE_ASR1 = "volc.bigasr.sauc.duration";

export type StreamAsrOptions = {
  withSpeaker: boolean;
  resourceId?: string;
  url?: string;
};

export type AsrUtterance = {
  text: string;
  startTime: number; // ms
  endTime: number; // ms
  definite: boolean;
  speaker: number | null;
};

export type AsrMessage = {
  type: "segment" | "error" | "close";
  text?: string;
  utterances?: AsrUtterance[];
  error?: string;
};

function buildHeaders(resourceId: string) {
  const apiKey = process.env.VOLC_SPEECH_API_KEY || "";
  const appId = process.env.VOLC_SPEECH_APP_ID || "";
  const headers: Record<string, string> = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": crypto.randomUUID(),
    "X-Api-Sequence": "-1",
    "X-Api-Connect-Id": crypto.randomUUID(),
  };
  if (appId) {
    headers["X-Api-App-Key"] = appId;
    headers["X-Api-Access-Key"] = apiKey;
  } else {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

/** 二进制帧：4 字节 header + [sequence] + 4 字节大端长度 + payload */
function buildFrame(messageType: number, flags: number, payload: Buffer): Buffer {
  const header = Buffer.from([
    0x11, // version=1, header size=4
    (messageType << 4) | flags,
    0x10, // JSON 序列化，不压缩
    0x00,
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length);
  return Buffer.concat([header, size, payload]);
}

function fullClientRequest(opts: StreamAsrOptions): Buffer {
  const request: Record<string, unknown> = {
    model_name: "bigmodel",
    enable_itn: true,
    enable_punc: true,
    show_utterances: true,
  };
  if (opts.withSpeaker) {
    // 说话人聚类分离：仅在 ASR 2.0 的双向流式优化版上支持
    request.enable_nonstream = true;
    request.enable_speaker_info = true;
    request.ssd_version = "200";
  }
  const payload = {
    user: { uid: "midyear-workshop" },
    audio: { format: "pcm", rate: 16000, bits: 16, channel: 1 },
    request,
  };
  return buildFrame(0b0001, 0b0000, Buffer.from(JSON.stringify(payload)));
}

function parseServerMessages(buf: Buffer): { messages: { type: string; flags: number; payload: Buffer }[]; rest: Buffer } {
  const messages: { type: string; flags: number; payload: Buffer }[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const b1 = buf[offset + 1];
    const msgType = b1 >> 4;
    const flags = b1 & 0x0f;
    let cursor = offset + 4;
    if (flags & 0b0001) {
      if (cursor + 4 > buf.length) break;
      cursor += 4; // sequence number
    }
    if (cursor + 4 > buf.length) break;
    const size = buf.readUInt32BE(cursor);
    cursor += 4;
    if (cursor + size > buf.length) break;
    messages.push({
      type: msgType === 0b1111 ? "error" : msgType === 0b1011 ? "audio" : "json",
      flags,
      payload: buf.subarray(cursor, cursor + size),
    });
    offset = cursor + size;
  }
  return { messages, rest: buf.subarray(offset) };
}

export function resolveAsrConfig(opts?: StreamAsrOptions): {
  url: string;
  resourceId: string;
  withSpeaker: boolean;
} {
  const withSpeaker = opts?.withSpeaker !== false;
  const configured = process.env.VOLC_STREAM_ASR_RESOURCE_ID;
  const resourceId = configured || (withSpeaker ? RESOURCE_ASR2 : RESOURCE_ASR1);
  const url = opts?.url || process.env.VOLC_STREAM_ASR_URL || WS_URL;
  return { url, resourceId, withSpeaker };
}

export class VolcStreamAsr {
  private ws: WebSocket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private closedByUs = false;

  onMessage: ((msg: AsrMessage) => void) | null = null;
  onOpen: (() => void) | null = null;

  connect(opts?: StreamAsrOptions): Promise<void> {
    const { url, resourceId, withSpeaker } = resolveAsrConfig(opts);
    const apiKey = process.env.VOLC_SPEECH_API_KEY;
    if (!apiKey) return Promise.reject(new Error("未配置 VOLC_SPEECH_API_KEY"));
    if (typeof WebSocket === "undefined") {
      return Promise.reject(new Error("当前运行环境不支持 WebSocket 客户端"));
    }

    return new Promise((resolve, reject) => {
      const headers = buildHeaders(resourceId);
      let ws: WebSocket;
      try {
        // Node ≥ 22 的全局 WebSocket（undici）支持在握手时携带自定义请求头
        const NodeWebSocket = WebSocket as unknown as new (
          url: string,
          options?: { headers?: Record<string, string> },
        ) => WebSocket;
        ws = new NodeWebSocket(url, { headers });
      } catch (e) {
        reject(e instanceof Error ? e : new Error("WebSocket 创建失败"));
        return;
      }
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      const onOpen = () => {
        try {
          ws.send(fullClientRequest({ withSpeaker, resourceId }));
          this.onOpen?.();
          resolve();
        } catch (e) {
          reject(e instanceof Error ? e : new Error("发送初始化请求失败"));
        }
      };
      ws.addEventListener("open", onOpen);

      ws.addEventListener("message", (ev) => {
        const data = ev.data as unknown;
        if (typeof data === "string") {
          this.handleErrorPayload(data);
          return;
        }
        let chunk: Buffer;
        if (data instanceof ArrayBuffer) {
          chunk = Buffer.from(data);
        } else if (data && typeof (data as Blob).arrayBuffer === "function") {
          void (data as Blob).arrayBuffer().then((ab) => {
            this.feed(Buffer.from(ab));
          });
          return;
        } else {
          return;
        }
        this.feed(chunk);
      });

      ws.addEventListener("error", () => {
        if (!this.closedByUs) {
          this.onMessage?.({
            type: "error",
            error: "流式语音识别连接失败，请检查 VOLC_SPEECH_API_KEY 与语音服务开通状态",
          });
        }
      });

      ws.addEventListener("close", () => {
        if (!this.closedByUs) {
          this.onMessage?.({ type: "close" });
        }
      });
    });
  }

  private feed(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { messages, rest } = parseServerMessages(this.buffer);
    this.buffer = rest;
    for (const m of messages) {
      if (m.type === "error") {
        const text = m.payload.toString("utf8");
        this.handleErrorPayload(text);
        continue;
      }
      if (m.type !== "json") continue;
      this.handleJsonPayload(m.payload.toString("utf8"));
    }
  }

  private handleErrorPayload(text: string) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string; code?: number | string };
      msg = j.message || `错误码 ${j.code ?? ""}`.trim();
    } catch {
      // 原文
    }
    this.onMessage?.({ type: "error", error: `流式识别错误：${msg}` });
  }

  private handleJsonPayload(text: string) {
    let json: {
      result?: { text?: string; utterances?: unknown[] };
      code?: number;
      message?: string;
    };
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }
    if (json.code && json.code !== 0) {
      this.onMessage?.({ type: "error", error: `流式识别错误：${json.message || json.code}` });
      return;
    }
    const result = json.result;
    if (!result) return;
    const utterances: AsrUtterance[] = [];
    if (Array.isArray(result.utterances)) {
      for (const u of result.utterances as Record<string, unknown>[]) {
        if (typeof u.text !== "string" || !u.text) continue;
        const speakerVal = u.speaker ?? u.speaker_id ?? null;
        utterances.push({
          text: u.text,
          startTime: Number(u.start_time) || 0,
          endTime: Number(u.end_time) || 0,
          definite: Boolean(u.definite),
          speaker: typeof speakerVal === "number" ? speakerVal : null,
        });
      }
    }
    this.onMessage?.({
      type: "segment",
      text: typeof result.text === "string" ? result.text : "",
      utterances,
    });
  }

  sendAudio(chunk: Buffer) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(buildFrame(0b0010, 0b0000, chunk));
    return true;
  }

  /** 发送最后一包（负包），通知服务端音频结束 */
  end() {
    if (!this.ws) return;
    if (this.ws.readyState === 1) {
      this.ws.send(buildFrame(0b0010, 0b0010, Buffer.alloc(0)));
    }
  }

  close() {
    this.closedByUs = true;
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}

export function asrSupportInfo() {
  return {
    volcConfigured: Boolean(process.env.VOLC_SPEECH_API_KEY),
  };
}
