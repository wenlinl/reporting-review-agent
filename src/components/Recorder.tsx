"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  presentationId: string;
  onUploaded: () => void;
};

type LiveSegment = {
  timeSec: number;
  speaker: number | null;
  text: string;
  definite: boolean;
};

type LiveEvent =
  | { type: "segment"; text?: string; utterances?: LiveSegment[] }
  | { type: "done" }
  | { type: "error"; error?: string };

const MIME_OPTIONS = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/mp4", ext: "mp4" },
];

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function speakerLabel(speaker: number | null) {
  return typeof speaker === "number" ? `演讲者 ${speaker + 1}` : "演讲者";
}

function formatLiveTranscript(segments: LiveSegment[], interim: string): string {
  const lines = segments.map(
    (s) => `[${fmt(s.timeSec)}] ${speakerLabel(s.speaker)}：${s.text}`,
  );
  if (interim.trim()) {
    const last = segments[segments.length - 1];
    lines.push(`[${fmt(last ? last.timeSec : 0)}] ${speakerLabel(last?.speaker ?? null)}：${interim.trim()}`);
  }
  return lines.join("\n");
}

type WebSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): WebSpeechRecognition | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor =
    (w.SpeechRecognition as new () => WebSpeechRecognition) ||
    (w.webkitSpeechRecognition as new () => WebSpeechRecognition);
  return Ctor ? new Ctor() : null;
}

export default function Recorder({ presentationId, onUploaded }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [liveMode, setLiveMode] = useState<"volc" | "web" | "off">("off");
  const [liveNotice, setLiveNotice] = useState("");
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [showLive, setShowLive] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extRef = useRef("webm");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const pcmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamCtrlRef = useRef<ReadableStreamDefaultController<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveSegmentsRef = useRef<LiveSegment[]>([]);
  const liveInterimRef = useRef("");
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);
  const volcReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const switchedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      abortRef.current?.abort();
      void audioCtxRef.current?.close();
      recognitionRef.current?.abort();
    };
  }, []);

  function pickMime(): string {
    for (const opt of MIME_OPTIONS) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(opt.mime)) {
        extRef.current = opt.ext;
        return opt.mime;
      }
    }
    extRef.current = "webm";
    return "";
  }

  const pushSegment = useCallback((seg: LiveSegment) => {
    liveSegmentsRef.current = [...liveSegmentsRef.current, seg];
    setSegments(liveSegmentsRef.current);
  }, []);

  const setInterimText = useCallback((text: string) => {
    liveInterimRef.current = text;
    setInterim(text);
  }, []);

  /** 字节流式：AudioWorklet 采集 PCM → fetch 流式上传 → SSE 接收结果 */
  async function startVolcStream(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      await ctx.audioWorklet.addModule("/pcm-worklet.js");
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      node.port.onmessage = (e) => {
        if (streamCtrlRef.current) {
          streamCtrlRef.current.enqueue(new Uint8Array(e.data as ArrayBuffer));
        }
      };
      source.connect(node);
      pcmSourceRef.current = source;
      workletNodeRef.current = node;

      const abort = new AbortController();
      abortRef.current = abort;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamCtrlRef.current = controller;
        },
      });

      const res = await fetch(`/api/presentations/${presentationId}/live-transcribe`, {
        method: "POST",
        body,
        duplex: "half",
        signal: abort.signal,
      } as RequestInit & { duplex: "half" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `实时转写不可用 (${res.status})`);
      }

      const reader = res.body.getReader();
      volcReaderRef.current = reader;
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as LiveEvent;
              handleLiveEvent(ev);
            } catch {
              // 忽略坏包
            }
          }
        }
      }
    } catch (e) {
      if (abortRef.current?.signal.aborted) return;
      handleVolcFailure(e instanceof Error ? e.message : "实时转写连接失败");
    }
  }

  function handleLiveEvent(ev: LiveEvent) {
    if (ev.type === "segment") {
      const utts = ev.utterances || [];
      const definite = utts.filter((u) => u.definite && u.text);
      const partial = utts.filter((u) => !u.definite && u.text);
      if (definite.length > 0) {
        // 全量模式下按 start_time 去重追加
        const existing = new Set(liveSegmentsRef.current.map((s) => s.timeSec));
        const fresh = definite.filter((u) => !existing.has(u.timeSec));
        if (fresh.length > 0) {
          liveSegmentsRef.current = [...liveSegmentsRef.current, ...fresh];
          setSegments(liveSegmentsRef.current);
        }
      }
      setInterimText(partial.map((p) => p.text).join(""));
      setLiveNotice("实时转写中（字节语音识别 · 含断句与说话人）");
      return;
    }
    if (ev.type === "error") {
      handleVolcFailure(ev.error || "实时转写出错");
      return;
    }
    if (ev.type === "done") {
      setInterimText("");
      setLiveNotice("实时转写已结束");
    }
  }

  function handleVolcFailure(message: string) {
    if (switchedRef.current) return;
    // 尚未产出任何结果时，自动切换浏览器本地语音识别兜底
    if (liveSegmentsRef.current.length === 0) {
      const rec = getSpeechRecognition();
      if (rec) {
        switchedRef.current = true;
        startWebRecognition(rec);
        setLiveMode("web");
        setLiveNotice(`字节实时转写连接失败，已切换浏览器本地识别（${message}）`);
        return;
      }
    }
    setLiveMode("off");
    setLiveNotice(message || "实时转写不可用，录音仍会正常上传并离线转写");
  }

  function startWebRecognition(rec: WebSpeechRecognition) {
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const event = ev as {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      };
      const timeSec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript || "";
        if (!text.trim()) continue;
        if (res.isFinal) {
          pushSegment({ timeSec, speaker: null, text: text.trim(), definite: true });
        } else {
          interimText += text;
        }
      }
      setInterimText(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setLiveNotice("浏览器未授权麦克风，实时转写不可用");
        setLiveMode("off");
      }
    };
    rec.onend = () => {
      // 停止或意外结束时清空临时文本
      setInterimText("");
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setLiveNotice("实时转写中（浏览器本地识别 · 无断句与说话人）");
    } catch {
      setLiveNotice("浏览器实时识别启动失败，录音仍会离线转写");
    }
  }

  async function chooseLiveMode(): Promise<"volc" | "web" | "off"> {
    try {
      const res = await fetch(`/api/presentations/${presentationId}/live-transcribe`);
      const info = (await res.json()) as { volcConfigured?: boolean };
      if (info.volcConfigured) {
        setLiveMode("volc");
        setLiveNotice("正在连接字节实时转写…");
        return "volc";
      } else if (getSpeechRecognition()) {
        setLiveMode("web");
        setLiveNotice("正在启动浏览器本地实时转写…");
        return "web";
      } else {
        setLiveMode("off");
        setLiveNotice("");
        return "off";
      }
    } catch {
      if (getSpeechRecognition()) {
        setLiveMode("web");
        setLiveNotice("正在启动浏览器本地实时转写…");
        return "web";
      } else {
        setLiveMode("off");
        return "off";
      }
    }
  }

  async function start() {
    setError("");
    setSegments([]);
    setInterim("");
    liveSegmentsRef.current = [];
    liveInterimRef.current = "";
    switchedRef.current = false;
    setShowLive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void upload();
      };
      recorder.start(1000);
      startTimeRef.current = Date.now();
      setState("recording");
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

      void chooseLiveMode().then((mode) => {
        if (mode === "volc") {
          void startVolcStream(stream);
        } else if (mode === "web") {
          const rec = getSpeechRecognition();
          if (rec) startWebRecognition(rec);
        }
      });
    } catch {
      setError("无法访问麦克风，请检查浏览器权限设置");
    }
  }

  function stopLiveStreams() {
    abortRef.current?.abort();
    try {
      streamCtrlRef.current?.close();
    } catch {
      // ignore
    }
    streamCtrlRef.current = null;
    try {
      workletNodeRef.current?.port.close();
    } catch {
      // ignore
    }
    workletNodeRef.current = null;
    try {
      pcmSourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    pcmSourceRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }

  function stop() {
    stopLiveStreams();
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("idle");
  }

  function togglePause() {
    if (!recorderRef.current) return;
    if (state === "recording") {
      recorderRef.current.pause();
      setState("paused");
    } else if (state === "paused") {
      recorderRef.current.resume();
      setState("recording");
    }
  }

  async function upload() {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType || "audio/webm",
    });
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `presentation-${Date.now()}.${extRef.current}`, {
          type: blob.type,
        }),
      );
      fd.append("duration", String(Math.floor((Date.now() - startTimeRef.current) / 1000)));
      const liveText = formatLiveTranscript(liveSegmentsRef.current, liveInterimRef.current);
      if (liveText.trim()) {
        fd.append("liveTranscript", liveText);
      }
      const res = await fetch(`/api/presentations/${presentationId}/recordings`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "录音上传失败");
      } else {
        onUploaded();
      }
    } catch {
      setError("录音上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  function renderLivePanel() {
    if (!showLive) return null;
    const lines = segments.map((s, i) => (
      <div key={i} className="flex gap-2 rounded-lg border border-slate-200/70 bg-slate-100/70 px-3 py-2">
        <span className="shrink-0 font-mono text-xs font-semibold text-cyan-600">[{fmt(s.timeSec)}]</span>
        <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-600">
          {speakerLabel(s.speaker)}
        </span>
        <span className="text-sm leading-relaxed text-slate-700">{s.text}</span>
      </div>
    ));
    const interimLine = interim.trim() ? (
      <div className="flex gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
        <span className="shrink-0 font-mono text-xs font-semibold text-cyan-600">
          [{fmt(segments.length > 0 ? segments[segments.length - 1].timeSec : elapsed)}]
        </span>
        <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
          {speakerLabel(segments.length > 0 ? segments[segments.length - 1].speaker : null)}
        </span>
        <span className="text-sm leading-relaxed text-slate-700">{interim.trim()}</span>
      </div>
    ) : null;

    return (
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
          <span className="relative flex h-2 w-2">
            {state !== "idle" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                state !== "idle" ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
          </span>
          实时转写
          <span className="font-mono">{fmt(elapsed)}</span>
          {liveNotice && <span className="text-slate-500">· {liveNotice}</span>}
        </div>
        <div className="max-h-64 space-y-1.5 overflow-auto rounded-xl border border-slate-200/70 bg-slate-100/60 p-3">
          {lines.length === 0 && !interimLine && (
            <p className="py-4 text-center text-xs text-slate-500">
              {state === "idle" ? "本次未产生实时转写" : "开始讲话后，内容会实时显示在这里…"}
            </p>
          )}
          {lines}
          {interimLine}
        </div>
      </div>
    );
  }

  if (state === "idle") {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <button
            onClick={start}
            disabled={uploading}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:from-rose-400 hover:to-red-400 disabled:opacity-60"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            {uploading ? "上传中…" : "开始录音（含实时转写）"}
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          录音过程中自动实时转写：时间点 + 演讲者 + 断句。结束后自动上传，可离线回放。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.05] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-rose-600">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
          </span>
          {state === "recording" ? "录音中" : "已暂停"}
        </span>
        <span className="font-mono text-xl text-slate-800">{fmt(elapsed)}</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={togglePause}
            className="rounded-lg border border-slate-300/80 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {state === "recording" ? "暂停" : "继续"}
          </button>
          <button
            onClick={stop}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-500"
          >
            结束并上传
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {renderLivePanel()}
    </div>
  );
}
