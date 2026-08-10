"use client";

import { useCallback, useEffect, useState } from "react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  _count: { presentations: number };
};

export default function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const json = await res.json();
    if (res.ok) setUsers(json.users);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "创建失败");
        return;
      }
      setOk(`已创建账号：${json.user.email}`);
      setName("");
      setEmail("");
      setPassword("");
      await refresh();
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(user: UserRow) {
    const pwd = window.prompt(`为「${user.name}」设置新密码（至少 6 位）：`);
    if (!pwd) return;
    setError("");
    setOk("");
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "重置失败");
    } else {
      setOk(`已重置「${user.name}」的密码`);
    }
  }

  async function toggleActive(user: UserRow) {
    setError("");
    setOk("");
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) {
      setOk(user.active ? `已停用「${user.name}」` : `已启用「${user.name}」`);
      await refresh();
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm"
      >
        <h2 className="mb-3 text-sm font-bold text-slate-800">新建账号</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="姓名"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="邮箱"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="初始密码"
              className="w-full rounded-lg border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "创建中…" : "创建"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {ok}
          </div>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">邮箱</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">汇报数</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">
                  {u.role === "admin" ? "管理员" : "汇报人"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {u.active ? "启用" : "停用"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{u._count.presentations}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 text-xs">
                    {u.role !== "admin" && (
                      <>
                        <button
                          onClick={() => void resetPassword(u)}
                          className="font-medium text-cyan-600 hover:underline"
                        >
                          重置密码
                        </button>
                        <button
                          onClick={() => void toggleActive(u)}
                          className={`font-medium hover:underline ${
                            u.active ? "text-red-500" : "text-emerald-600"
                          }`}
                        >
                          {u.active ? "停用" : "启用"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
