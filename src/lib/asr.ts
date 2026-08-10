import "server-only";
import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "./db";

const execFileAsync = promisify(execFile);

const FLASH_URL =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const QUERY_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function convertToWav(input: string): Promise<string> {
  const out = `${input}.wav`;
  await execFileAsync(
    "ffmpeg",
    ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-f", "wav", out],
    { timeout: 300_000 },
  );
  return out;
}

function buildHeaders(resourceId: string) {
  const apiKey = process.env.VOLC_SPEECH_API_KEY || "";
  const appId = process.env.VOLC_SPEECH_APP_ID || "";
  const headers: Record<string, string> = {
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": crypto.randomUUID(),
    "X-Api-Sequence": "-1",
  };
  if (appId) {
    headers["X-Api-App-Key"] = appId;
    headers["X-Api-Access-Key"] = apiKey;
  } else {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

function extractText(result: Record<string, unknown>): string {
  const parts: string[] = [];
  const res = result.result as
    | { text?: string; utterances?: { text?: string }[] }
    | { text?: string; utterances?: { text?: string }[] }[]
    | undefined;

  if (Array.isArray(res)) {
    for (const item of res) {
      if (item && typeof item.text === "string") parts.push(item.text);
    }
  } else if (res && typeof res === "object") {
    if (typeof res.text === "string") parts.push(res.text);
    else if (Array.isArray(res.utterances)) {
      for (const utt of res.utterances) {
        if (utt && typeof utt.text === "string") parts.push(utt.text);
      }
    }
  }

  const utterances = result.utterances as { text?: string }[] | undefined;
  if (parts.length === 0 && Array.isArray(utterances)) {
    for (const utt of utterances) {
      if (utt && typeof utt.text === "string") parts.push(utt.text);
    }
  }

  return parts.join("");
}

async function transcribeFlash(b64: string): Promise<string> {
  const headers = buildHeaders(process.env.VOLC_ASR_RESOURCE_ID || "volc.bigasr.auc_turbo");
  const body = {
    user: { uid: "workshop-app" },
    audio: { data: b64 },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      show_utterances: true,
    },
  };

  const res = await fetch(FLASH_URL, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const code = res.headers.get("X-Api-Status-Code") || "";
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (code !== "20000000") {
    throw new Error(
      `ASR 极速版失败: code=${code}, msg=${res.headers.get("X-Api-Message") || ""}, body=${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  const text = extractText(json);
  if (!text) throw new Error("ASR 未返回文本");
  return text;
}

async function transcribeStandard(b64: string): Promise<string> {
  const resource = process.env.VOLC_ASR_RESOURCE_ID || "volc.bigasr.auc";
  const submitHeaders = buildHeaders(resource);
  const taskId = submitHeaders["X-Api-Request-Id"];
  const body = {
    user: { uid: "workshop-app" },
    audio: { data: b64 },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      show_utterances: true,
    },
  };

  const submitRes = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { ...submitHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const submitCode = submitRes.headers.get("X-Api-Status-Code") || "";
  const logid = submitRes.headers.get("X-Tt-Logid") || "";
  if (submitCode !== "20000000") {
    throw new Error(
      `ASR 标准版提交失败: code=${submitCode}, msg=${submitRes.headers.get("X-Api-Message") || ""}`,
    );
  }

  // 轮询查询结果（最长 30 分钟）
  const start = Date.now();
  for (;;) {
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > 1800) throw new Error("ASR 标准版轮询超时");

    const queryHeaders = buildHeaders(resource);
    queryHeaders["X-Api-Request-Id"] = taskId;
    if (logid) queryHeaders["X-Tt-Logid"] = logid;
    const queryRes = await fetch(QUERY_URL, {
      method: "POST",
      headers: { ...queryHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30_000),
    });
    const code = queryRes.headers.get("X-Api-Status-Code") || "";
    const json = (await queryRes.json().catch(() => ({}))) as Record<string, unknown>;

    if (code === "20000000" || code === "20000003") {
      const text = extractText(json);
      return text;
    }
    if (code === "20000001" || code === "20000002") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    throw new Error(
      `ASR 标准版查询失败: code=${code}, msg=${queryRes.headers.get("X-Api-Message") || ""}`,
    );
  }
}

export async function transcribeFile(filePath: string): Promise<string> {
  if (!process.env.VOLC_SPEECH_API_KEY) {
    throw new Error("未配置 VOLC_SPEECH_API_KEY");
  }
  if (!fs.existsSync(filePath)) throw new Error("音频文件不存在");

  let input = filePath;
  if (await hasFfmpeg()) {
    try {
      input = await convertToWav(filePath);
    } catch {
      // 转换失败则使用原始文件
    }
  }

  const b64 = fs.readFileSync(input).toString("base64");
  const mode = process.env.VOLC_ASR_MODE || "flash";
  try {
    return mode === "standard"
      ? await transcribeStandard(b64)
      : await transcribeFlash(b64);
  } finally {
    if (input !== filePath) {
      try {
        fs.unlinkSync(input);
      } catch {
        // ignore
      }
    }
  }
}

export async function transcribeRecording(recordingId: string): Promise<void> {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) return;

  await prisma.recording.update({
    where: { id: recordingId },
    data: { transcriptStatus: "transcribing", asrError: null },
  });

  try {
    const text = await transcribeFile(recording.filePath);
    await prisma.recording.update({
      where: { id: recordingId },
      data: { transcript: text, transcriptStatus: "done" },
    });
  } catch (e) {
    await prisma.recording.update({
      where: { id: recordingId },
      data: {
        transcriptStatus: "failed",
        asrError: e instanceof Error ? e.message.slice(0, 500) : String(e),
      },
    });
  }
}
