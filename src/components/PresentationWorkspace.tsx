"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Recorder from "./Recorder";
import TtsButton from "./TtsButton";

type ReviewItem = {
  dimension: string;
  score?: number;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
};
type Review = {
  id: string;
  content: string;
  sourcePptName: string | null;
  createdAt: string;
};
type Recording = {
  id: string;
  fileName: string;
  durationSec: number | null;
  transcript: string | null;
  transcriptStatus: string;
  asrError: string | null;
  createdAt: string;
};
type Feedback = {
  id: string;
  content: string;
  createdAt: string;
};
type Presentation = {
  id: string;
  title: string;
  goal: string | null;
  status: string;
  pptName: string | null;
  pptText: string | null;
  createdAt: string;
  updatedAt: string;
  user: { name: string; email: string };
  reviews: Review[];
  recordings: Recording[];
  feedback: Feedback | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  reviewed: "已评审",
  finalized: "已定稿",
  presented: "已汇报",
};

const TRANS_STATUS: Record<string, string> = {
  pending: "等待转写",
  transcribing: "转写中…",
  done: "已完成",
  failed: "失败（可手动编辑）",
  manual: "手动填写",
};

function parseReview(content: string): {
  overall: string;
  overallScore: number | null;
  items: ReviewItem[];
} {
  try {
    const j = JSON.parse(content) as {
      overall?: string;
      overallScore?: number | null;
      items?: ReviewItem[];
    };
    return {
      overall: j.overall || "",
      overallScore: typeof j.overallScore === "number" ? j.overallScore : null,
      items: Array.isArray(j.items) ? j.items : [],
    };
  } catch {
    return { overall: "", overallScore: null, items: [] };
  }
}

function parseFeedback(content: string): {
  overall: string;
  overallScore: number | null;
  highlights: string[];
  improvements: string[];
  history: string;
} {
  try {
    const j = JSON.parse(content) as {
      overall?: string;
      overallScore?: number | null;
      highlights?: string[];
      improvements?: string[];
      history?: string;
    };
    return {
      overall: j.overall || "",
      overallScore: typeof j.overallScore === "number" ? j.overallScore : null,
      highlights: Array.isArray(j.highlights) ? j.highlights : [],
      improvements: Array.isArray(j.improvements) ? j.improvements : [],
      history: j.history || "",
    };
  } catch {
    return { overall: "", overallScore: null, highlights: [], improvements: [], history: "" };
  }
}

const priorityStyle: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};
const priorityLabel: Record<string, string> = {
  high: "必须修改",
  medium: "建议修改",
  low: "可选优化",
};

function TranscriptView({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="max-h-56 space-y-1.5 overflow-auto">
      {lines.map((line, i) => {
        const m = line.match(/^\[(\d{2}:\d{2})\]\s*(演讲者(?:\s*\d+)?)：\s*(.*)$/);
        if (!m) {
          return (
            <p key={i} className="text-sm leading-relaxed text-slate-700">
              {line}
            </p>
          );
        }
        const [, time, speaker, content] = m;
        return (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200/70 bg-slate-100/70 px-3 py-2">
            <span className="shrink-0 font-mono text-xs font-semibold text-cyan-600">{time}</span>
            <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-600">
              {speaker}
            </span>
            <span className="text-sm leading-relaxed text-slate-700">{content}</span>
          </div>
        );
      })}
    </div>
  );
}

function scoreTier(score: number) {
  if (score >= 85) return { bar: "from-emerald-400 to-teal-500", text: "text-emerald-600", label: "优秀" };
  if (score >= 70) return { bar: "from-cyan-400 to-indigo-500", text: "text-cyan-600", label: "良好" };
  if (score >= 55) return { bar: "from-amber-400 to-orange-500", text: "text-amber-600", label: "待改进" };
  return { bar: "from-rose-400 to-red-500", text: "text-rose-600", label: "风险项" };
}

function ScoreChart({ items }: { items: ReviewItem[] }) {
  const scored = items.filter((i) => typeof i.score === "number");
  if (scored.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-100/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">
          Ray 评审团 · 维度评分（满分 100）
        </span>
        <span className="font-mono text-[10px] text-slate-500">按得分排序</span>
      </div>
      <div className="space-y-2.5">
        {[...scored]
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .map((it, i) => {
            const score = it.score || 0;
            const tier = scoreTier(score);
            return (
              <div key={`${it.dimension}-${i}`}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">{it.dimension}</span>
                  <span className={`font-mono font-semibold ${tier.text}`}>
                    {score} <span className="font-normal text-slate-500">/ 100</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${tier.bar} transition-all duration-700`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function RadarChart({ items }: { items: ReviewItem[] }) {
  const scored = items.filter((i) => typeof i.score === "number");
  if (scored.length < 3) return null;
  const n = scored.length;
  const cx = 170;
  const cy = 140;
  const R = 90;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pt = (i: number, r: number): [number, number] => [
    Math.round((cx + r * Math.cos(angle(i))) * 10) / 10,
    Math.round((cy + r * Math.sin(angle(i))) * 10) / 10,
  ];
  const ring = (r: number) =>
    Array.from({ length: n }, (_, i) => pt(i, r).join(",")).join(" ");
  const dataPts = scored.map((it, i) =>
    pt(i, (Math.min(100, Math.max(0, it.score || 0)) / 100) * R),
  );
  const dataPoly = dataPts.map((p) => p.join(",")).join(" ");

  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-100/60 p-4">
      <div className="mb-1 text-xs font-semibold text-slate-500">
        Ray 评审团 · 维度对比雷达图
      </div>
      <div className="flex justify-center">
        <svg viewBox="0 0 340 310" className="w-full max-w-md">
          {[25, 50, 75, 100].map((r) => (
            <polygon
              key={r}
              points={ring((r / 100) * R)}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          ))}
          {scored.map((_, i) => {
            const [x, y] = pt(i, R);
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="#cbd5e1"
                strokeWidth={1}
              />
            );
          })}
          <polygon
            points={dataPoly}
            fill="rgba(34,211,238,0.22)"
            stroke="#0891b2"
            strokeWidth={2}
            style={{ filter: "drop-shadow(0 2px 6px rgba(8,145,178,0.35))" }}
          />
          {dataPts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill="#4f46e5" />
          ))}
          {scored.map((it, i) => {
            const [x, y] = pt(i, R + 24);
            return (
              <text
                key={i}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#475569"
              >
                {it.dimension}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function RayAvatar({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 font-bold text-white shadow-[0_0_16px_rgba(34,211,238,0.5)] ${
        size === "lg" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"
      }`}
    >
      Ray
    </span>
  );
}

export default function PresentationWorkspace({
  presentationId,
  isAdmin,
}: {
  presentationId: string;
  isAdmin: boolean;
}) {
  const [data, setData] = useState<Presentation | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [showText, setShowText] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const pollingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/presentations/${presentationId}`);
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "加载失败");
        return;
      }
      setData(json.presentation);
    } catch {
      setLoadError("加载失败，请刷新页面重试");
    }
  }, [presentationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 转写进行中时轮询
  useEffect(() => {
    if (!data) return;
    const hasActive = data.recordings.some(
      (r) => r.transcriptStatus === "pending" || r.transcriptStatus === "transcribing",
    );
    if (!hasActive || pollingRef.current) return;
    pollingRef.current = true;
    const t = setInterval(async () => {
      await refresh();
      const latest = await fetch(`/api/presentations/${presentationId}`).then((r) =>
        r.json(),
      );
      const active = latest.presentation.recordings.some(
        (r: Recording) =>
          r.transcriptStatus === "pending" || r.transcriptStatus === "transcribing",
      );
      if (!active) {
        clearInterval(t);
        pollingRef.current = false;
      }
    }, 5000);
    return () => {
      clearInterval(t);
      pollingRef.current = false;
    };
  }, [data, presentationId, refresh]);

  async function runAction(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function uploadPpt(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    await runAction("ppt", async () => {
      const res = await fetch(`/api/presentations/${presentationId}/ppt`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "上传失败");
    });
  }

  async function generateReview() {
    await runAction("review", async () => {
      const res = await fetch(`/api/presentations/${presentationId}/review`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "生成失败");
    });
  }

  async function generateFeedback() {
    await runAction("feedback", async () => {
      const res = await fetch(`/api/presentations/${presentationId}/feedback`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "生成失败");
    });
  }

  async function saveTranscript(recordingId: string) {
    await runAction(`transcript-${recordingId}`, async () => {
      const res = await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "保存失败");
      setEditingTranscript(null);
    });
  }

  async function deleteRecording(r: Recording) {
    if (!window.confirm(`确定删除录音「${r.fileName}」及其转写记录吗？此操作不可恢复。`)) {
      return;
    }
    await runAction(`delete-${r.id}`, async () => {
      const res = await fetch(`/api/recordings/${r.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "删除失败");
      if (editingTranscript === r.id) setEditingTranscript(null);
    });
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-5xl rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-300">
        {loadError}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-slate-200 bg-white/80 p-8">
        加载中…
      </div>
    );
  }

  const latestReview = data.reviews[0] ? parseReview(data.reviews[0].content) : null;
  const feedback = data.feedback ? parseFeedback(data.feedback.content) : null;
  const overallText = feedback?.overall || "";
  const detailText = feedback
    ? [
        ...(feedback.highlights || []).map((h) => `亮点：${h}`),
        ...(feedback.improvements || []).map((h) => `改进建议：${h}`),
        feedback.history ? `历史对比：${feedback.history}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{data.title}</h1>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              data.status === "presented"
                ? "bg-emerald-50 text-emerald-700"
                : data.status === "reviewed"
                  ? "bg-sky-50 text-sky-700"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {STATUS_LABEL[data.status] || data.status}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          汇报人：{data.user.name}（{data.user.email}）
          {data.goal && <> · 目标：{data.goal}</>}
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          {notice}
        </div>
      )}

      {/* 步骤 1：上传 PPT */}
      <section className="card-glass p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="step-chip">1</span>
          上传 PPT
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          支持 .pptx / .pdf，系统自动提取文字内容供 AI 评审
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300/70 bg-slate-50 px-4 py-8 text-center transition hover:border-cyan-500/70 hover:bg-cyan-500/5">
          <span className="mb-2 text-3xl">📤</span>
          <span className="text-sm font-medium text-slate-700">
            {busy === "ppt" ? "上传中…" : "点击选择文件"}
          </span>
          <span className="mt-1 text-xs text-slate-400">
            {data.pptName ? `当前：${data.pptName}` : "尚未上传"}
          </span>
          <input
            type="file"
            accept=".pptx,.pdf"
            className="hidden"
            disabled={busy === "ppt"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPpt(f);
              e.target.value = "";
            }}
          />
        </label>
        {data.pptText && (
          <div className="mt-3">
            <button
              onClick={() => setShowText((v) => !v)}
              className="text-xs font-medium text-cyan-600 hover:underline"
            >
              {showText ? "收起" : "查看"}已提取内容（{data.pptText.length} 字）
            </button>
            {showText && (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100/80 p-4 text-xs text-slate-600">
                {data.pptText}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* 步骤 2：AI 修改意见 */}
      <section className="card-glass p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="step-chip">2</span>
            <RayAvatar />
            Ray 评审团 · AI 修改意见
          </h2>
          <button
            onClick={generateReview}
            disabled={busy === "review" || !data.pptText}
            className="btn-primary-glow"
          >
            {busy === "review" ? "生成中…（约 30 秒）" : data.reviews.length > 0 ? "重新生成" : "生成修改意见"}
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          由 Ray 评审团按 7 个维度逐项量化打分，并给出具体修改建议
        </p>
        {!data.pptText && (
          <p className="rounded-lg bg-slate-100/70 px-4 py-3 text-sm text-slate-500">
            请先上传 PPT，才能生成修改意见
          </p>
        )}
        {data.pptText && data.reviews.length === 0 && (
          <p className="rounded-lg bg-slate-100/70 px-4 py-3 text-sm text-slate-500">
            上传 PPT 后点击「生成修改意见」，AI 会按维度给出逐项建议
          </p>
        )}
        {latestReview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/70 bg-slate-100/70 p-4 text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-cyan-600">Ray 评审团总评：</span>
              {latestReview.overall}
            </div>
            <RadarChart items={latestReview.items} />
            <ScoreChart items={latestReview.items} />
            <div className="space-y-2">
              {latestReview.items.map((item, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <RayAvatar />
                      {item.dimension}
                    </span>
                    <span className="flex items-center gap-2">
                      {typeof item.score === "number" && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs ${
                            scoreTier(item.score).text
                          }`}
                        >
                          {item.score} 分
                          <span className="font-normal opacity-70">
                            {scoreTier(item.score).label}
                          </span>
                        </span>
                      )}
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                          priorityStyle[item.priority] || priorityStyle.low
                        }`}
                      >
                        {priorityLabel[item.priority] || item.priority}
                      </span>
                    </span>
                  </div>
                  <p className="mb-1.5 text-sm text-slate-600">
                    <span className="font-medium text-red-600">问题：</span>
                    {item.issue}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-emerald-700">建议：</span>
                    {item.suggestion}
                  </p>
                </div>
              ))}
            </div>
            {data.reviews.length > 1 && (
              <p className="text-xs text-slate-400">
                历史评审 {data.reviews.length - 1} 次（保存于每次生成时）
              </p>
            )}
          </div>
        )}
      </section>

      {/* 步骤 3：演讲录音与转写 */}
      <section className="card-glass p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="step-chip">3</span>
          演讲录音与转写
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          汇报当天上台时点击录音，结束后自动上传并转写为文字（约需 1-2 分钟）
        </p>
        <Recorder presentationId={presentationId} onUploaded={() => void refresh()} />

        {data.recordings.length > 0 && (
          <div className="mt-5 space-y-3">
            {data.recordings.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{r.fileName}</span>
                  {r.durationSec && <span>时长 {r.durationSec} 秒</span>}
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                      r.transcriptStatus === "done"
                        ? "bg-emerald-50 text-emerald-700"
                        : r.transcriptStatus === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {TRANS_STATUS[r.transcriptStatus] || r.transcriptStatus}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                {r.asrError && (
                  <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    转写失败：{r.asrError}
                  </p>
                )}
                {editingTranscript === r.id ? (
                  <div>
                    <textarea
                      value={transcriptDraft}
                      onChange={(e) => setTranscriptDraft(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500"
                      placeholder="粘贴或修改转写文本…"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void saveTranscript(r.id)}
                        disabled={busy === `transcript-${r.id}`}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {busy === `transcript-${r.id}` ? "保存中…" : "保存"}
                      </button>
                      <button
                        onClick={() => setEditingTranscript(null)}
                        className="rounded-lg border border-slate-300/80 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {r.transcript ? (
                      <TranscriptView text={r.transcript} />
                    ) : (
                      <p className="text-sm text-slate-500">暂无转写文本</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingTranscript(r.id);
                          setTranscriptDraft(r.transcript || "");
                        }}
                        className="text-xs font-medium text-cyan-600 hover:underline"
                      >
                        {r.transcript ? "编辑" : "手动填写转写"}
                      </button>
                      <span className="text-slate-600">·</span>
                      <button
                        onClick={() => void deleteRecording(r)}
                        disabled={busy === `delete-${r.id}`}
                        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
                      >
                        {busy === `delete-${r.id}` ? "删除中…" : "删除"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 步骤 4：AI 反馈 */}
      <section className="card-glass p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="step-chip">4</span>
            <RayAvatar />
            Ray 评审团 · AI 评论与反馈
          </h2>
          <button
            onClick={generateFeedback}
            disabled={
              busy === "feedback" ||
              (!data.pptText && !data.recordings.some((r) => r.transcript))
            }
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50"
          >
            {busy === "feedback"
              ? "生成中…（约 30 秒）"
              : data.feedback
                ? "重新生成"
                : "生成汇报反馈"}
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Ray 评审团结合最终版 PPT、演讲转写与你的历史汇报记录，现场给出综合分与改进建议
        </p>
        {!data.pptText && !data.recordings.some((r) => r.transcript) && (
          <p className="rounded-lg bg-slate-100/70 px-4 py-3 text-sm text-slate-500">
            至少完成 PPT 上传或录音转写后，才能生成反馈
          </p>
        )}
        {feedback && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-slate-500">
                综合点评控制在 200 字以内，末句为改进建议
              </span>
              <TtsButton
                text={overallText}
                cacheKey={`feedback-${data.feedback?.id}-overall`}
                label="播放综合点评"
              />
              <TtsButton
                text={detailText}
                cacheKey={`feedback-${data.feedback?.id}-detail`}
                label="播放亮点建议"
              />
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-emerald-600">综合点评：</span>
              {feedback.overall}
            </div>
            {feedback.highlights.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-emerald-600">✨ 亮点</h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {feedback.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {feedback.improvements.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-amber-600">💡 改进建议</h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
                  {feedback.improvements.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            {feedback.history && (
              <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4 text-sm text-slate-700">
                <span className="font-semibold text-cyan-600">📈 历史对比：</span>
                {feedback.history}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
