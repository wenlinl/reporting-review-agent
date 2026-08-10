"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useState } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export default function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const steps = [
    { href: "/dashboard", label: "我的汇报 · Ray", mobileLabel: "汇报 · Ray", icon: "◉" },
    { href: "/assistant", label: "我的助手 · 茵姐", mobileLabel: "助手 · 茵姐", icon: "❀" },
  ];
  const adminLinks = [
    { href: "/admin/progress", label: "进度看板" },
    { href: "/admin/users", label: "用户管理" },
    { href: "/admin/settings", label: "评审配置" },
  ];

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 shadow-[0_2px_16px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6">
          <Link href="/dashboard" className="hidden shrink-0 items-center gap-2 sm:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 text-base text-white shadow-[0_0_16px_rgba(34,211,238,0.5)]">
              ◉
            </span>
            <span className="hidden lg:block">
              <span className="block text-sm font-bold">
                <span className="text-gradient">Mid-year Workshop</span>
              </span>
              <span className="block text-[10px] text-slate-500">2026 · 湘湖与西湖畔</span>
            </span>
          </Link>

          {/* 进度轴式主导航：我的汇报 · Ray → 我的助手 · 茵姐 */}
          <nav className="flex flex-1 items-center justify-center gap-1 sm:gap-2">
            {steps.map((item, i) => {
              const active = pathname.startsWith(item.href);
              return (
                <Fragment key={item.href}>
                  {i > 0 && (
                    <span className="mx-0.5 h-0.5 w-3 rounded-full bg-gradient-to-r from-cyan-500/60 to-indigo-500/60 sm:w-8" />
                  )}
                  <Link
                    href={item.href}
                    className={`group relative flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-all duration-200 sm:gap-2 sm:px-4 ${
                      active
                        ? "border-transparent bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-[0_4px_20px_rgba(34,211,238,0.45),0_2px_10px_rgba(79,70,229,0.35)]"
                        : "border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:-translate-y-px hover:border-cyan-500/50 hover:text-cyan-700 hover:shadow-md"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:h-6 sm:w-6 sm:text-[11px] ${
                        active
                          ? "bg-white/25 text-white ring-1 ring-white/40"
                          : "bg-gradient-to-br from-cyan-500/15 to-indigo-500/15 text-indigo-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="whitespace-nowrap text-[11px] font-semibold sm:text-[13px]">
                      <span className="sm:hidden">{item.mobileLabel}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </span>
                    {active && (
                      <span className="absolute -bottom-[8px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
                    )}
                  </Link>
                </Fragment>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user.role === "admin" && (
              <div className="mr-1 hidden items-center gap-1 xl:flex">
                {adminLinks.map((l) => {
                  const active = pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        active
                          ? "bg-indigo-500/10 text-indigo-600"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 text-xs font-bold text-indigo-600 ring-1 ring-indigo-400/40 sm:h-9 sm:w-9 sm:text-sm">
              {user.name.slice(0, 1)}
            </div>
            <div className="hidden min-w-0 lg:block">
              <div className="truncate text-sm font-semibold text-slate-700">
                {user.name}
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {user.role === "admin" ? "管理员" : "汇报人"}
              </div>
            </div>
              <button
              onClick={logout}
              disabled={loggingOut}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60 sm:px-3 sm:text-xs"
            >
              {loggingOut ? "退出中…" : "退出"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
