"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatePresentationForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, goal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
        return;
      }
      router.push(`/presentations/${data.presentation.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(34,211,238,0.35)] transition hover:from-cyan-400 hover:to-indigo-500"
      >
        + 新建汇报
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200/50 bg-white/95 p-6 shadow-[0_0_60px_rgba(34,211,238,0.12),0_24px_80px_rgba(2,6,23,0.7)] sm:p-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              <span className="text-gradient">新建汇报</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              创建后可上传 PPT，Ray 评审团会按维度给出量化评分与修改意见
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-200/40 px-2.5 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              汇报标题 <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="例如：XX 项目落地与业务影响"
              className="w-full rounded-lg border border-slate-300/70 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              汇报目标（可选，AI 评审时会参考）
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={4}
              placeholder="例如：重点展示项目带来的业务提升和落地进度，以及遇到的关键问题和解决方案"
              className="w-full resize-none rounded-lg border border-slate-300/70 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-slate-200/40 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300/60 px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(79,70,229,0.4)] transition hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-60"
            >
              {loading ? "创建中…" : "创建汇报"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
