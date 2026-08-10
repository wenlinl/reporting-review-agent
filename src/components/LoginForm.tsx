"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败，请重试");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/85 p-8 shadow-[0_0_50px_rgba(34,211,238,0.15),0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 text-2xl text-white shadow-[0_0_24px_rgba(34,211,238,0.55)]">
            ◉
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-gradient">Mid-year Workshop 2026</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            西湖畔 · high impact 汇报季 · 山色空蒙雨亦奇
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              邮箱
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              密码
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-[0_6px_24px_rgba(34,211,238,0.35)] transition hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-60"
          >
            {loading ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          账号由管理员创建，如无法登录请联系管理员
        </p>
      </div>
    </div>
  );
}
