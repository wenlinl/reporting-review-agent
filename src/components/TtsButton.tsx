"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  cacheKey?: string;
  label?: string;
};

function pickZhVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const zh = voices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
  if (zh.length === 0) return null;
  return (
    zh.find((v) => /xiaoxiao|yaoyao|tingting|ting-ting|meijia|mei-jia|huihui/i.test(v.name)) ||
    zh.find((v) => v.localService) ||
    zh[0]
  );
}

export default function TtsButton({ text, cacheKey, label = "播放反馈语音" }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [mode, setMode] = useState<"volc" | "browser" | "off">("volc");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
    return () => {
      audioRef.current?.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  async function playWithVolc(): Promise<boolean> {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, key: cacheKey }),
      });
      if (!res.ok) return false;
      const blob = await res.blob();
      if (blob.size === 0) return false;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      setMode("volc");
      setState("playing");
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  async function playWithBrowser(): Promise<boolean> {
    if (!("speechSynthesis" in window)) return false;
    const voice = pickZhVoice();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    if (voice) utterance.voice = voice;
    utteranceRef.current = utterance;
    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    setMode("browser");
    setState("playing");
    window.speechSynthesis.speak(utterance);
    return true;
  }

  async function onClick() {
    if (state === "playing") {
      stopAll();
      return;
    }
    setState("loading");
    let ok = false;
    try {
      ok = await playWithVolc();
    } catch {
      ok = false;
    }
    if (!ok) {
      ok = await playWithBrowser();
    }
    if (!ok) {
      setMode("off");
      setState("idle");
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={state === "loading"}
      title={mode === "browser" ? "当前使用浏览器本地语音" : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:border-cyan-500/70 hover:bg-cyan-500/15 disabled:opacity-60"
    >
      {state === "loading" ? (
        <span className="h-3 w-3 animate-spin rounded-full border border-cyan-600/40 border-t-cyan-600" />
      ) : state === "playing" ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <rect x="1" y="1" width="4" height="10" rx="1" />
          <rect x="7" y="1" width="4" height="10" rx="1" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M1.5 2.5a1 1 0 0 1 1.53-.85l7 4.5a1 1 0 0 1 0 1.7l-7 4.5a1 1 0 0 1-1.53-.85v-9z" />
        </svg>
      )}
      {state === "playing" ? "停止播放" : state === "loading" ? "生成中…" : label}
    </button>
  );
}
