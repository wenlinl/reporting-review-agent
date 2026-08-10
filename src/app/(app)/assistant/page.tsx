"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_QUESTIONS = [
  { label: "我是谁？我能为你做什么？", q: "我是谁？我能为你做什么？" },
  { label: "会议议程信息", q: "会议议程是什么？" },
  { label: "餐食与活动选择信息", q: "餐食和活动怎么安排？" },
];

const WELCOME =
  "你好呀，我是「茵姐」，这场 2026 Mid-Year Communication Workshop 的专属会务小助手~\n日程、地点、天气、住宿、交通、餐食与活动，湘湖与西湖畔的一切会议事宜，都可以问我，信息都会直接完整给到你。你可以从下方的快捷问题开始~";

function renderRich(text: string) {
  return text.split("\n").map((line, i) => {
    const isBullet = /^[-*]\s+/.test(line);
    const content = isBullet ? line.replace(/^[-*]\s+/, "") : line;
    const parts = content.split(/\*\*(.+?)\*\*/g);
    const nodes = parts.map((p, j) =>
      j % 2 === 1 ? (
        <strong key={j} className="font-semibold text-slate-900">
          {p}
        </strong>
      ) : (
        <span key={j}>{p}</span>
      ),
    );
    return (
      <div key={i} className={`${i > 0 ? "mt-1.5" : ""} ${isBullet ? "flex gap-1.5" : ""}`}>
        {isBullet && <span className="shrink-0 text-cyan-400">•</span>}
        <span>{nodes}</span>
      </div>
    );
  });
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 进入页面时加载该用户的聊天记忆
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/assistant/chat");
        const j = (await res.json()) as { messages?: Msg[] };
        if (cancelled) return;
        if (Array.isArray(j.messages) && j.messages.length > 0) {
          setMessages(j.messages);
        } else {
          setMessages([{ role: "assistant", content: WELCOME }]);
        }
      } catch {
        if (!cancelled) setMessages([{ role: "assistant", content: WELCOME }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    setMessages((ms) => [...ms, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: q }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `请求失败 (${res.status})`);
      }
      const reader = res.body.getReader();
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
              const ev = JSON.parse(line.slice(6)) as {
                delta?: string;
                done?: boolean;
              };
              if (ev.done) continue;
              if (typeof ev.delta === "string" && ev.delta) {
                setMessages((ms) => {
                  const copy = [...ms];
                  const last = copy[copy.length - 1];
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + ev.delta,
                  };
                  return copy;
                });
              }
            } catch {
              // 忽略坏包
            }
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : "网络错误，请稍后重试");
        setMessages((ms) => ms.filter((m) => m.content !== "" || m.role === "user"));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function clearChat() {
    if (!window.confirm("确定清空与茵姐的聊天记录吗？此操作不可恢复。")) {
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/assistant/chat", { method: "DELETE" });
      setMessages([{ role: "assistant", content: WELCOME }]);
    } catch {
      setError("清空失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 text-xl text-white shadow-[0_0_24px_rgba(34,211,238,0.5)]">
          🌊
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          <span className="text-gradient">茵姐 · 会议万能小助手</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          湘湖与西湖畔 · 2026 Mid-Year Communication Workshop 专属会务小助手
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        {QUICK_QUESTIONS.map((item) => (
          <button
            key={item.label}
            onClick={() => void send(item.q)}
            disabled={busy}
            className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-medium text-cyan-700 transition hover:border-cyan-500/70 hover:bg-cyan-500/15 disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card-glass flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-2.5">
          <span className="text-xs font-medium text-slate-500">聊天记录</span>
          <button
            onClick={() => void clearChat()}
            disabled={busy}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
          >
            清空
          </button>
        </div>
        <div
          ref={scrollRef}
          className="flex h-[460px] flex-col gap-3 overflow-y-auto p-4 sm:p-5"
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 px-4 py-2.5 text-sm leading-relaxed text-slate-800 ring-1 ring-cyan-500/30">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 text-sm text-white shadow-[0_0_12px_rgba(34,211,238,0.45)]">
                  🌊
                </span>
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-200/70 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm">
                  {m.content ? (
                    renderRich(m.content)
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-slate-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                      思考中…
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200/40 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问问日程、天气、餐食或活动…"
              className="w-full rounded-xl border border-slate-300/80 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(79,70,229,0.4)] transition hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50"
            >
              发送
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-slate-500">
              茵姐只回答会议相关问题，暂未同步的信息会如实告知，涉及他人隐私会礼貌婉拒
          </p>
        </div>
      </div>
    </div>
  );
}
