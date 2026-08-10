"use client";

import { useCallback, useEffect, useState } from "react";

type RubricItem = { key: string; name: string; description: string };

export default function RubricEditor() {
  const [items, setItems] = useState<RubricItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const json = await res.json();
    if (res.ok) {
      setItems(json.rubric);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function update(i: number, patch: Partial<RubricItem>) {
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function save() {
    setError("");
    setOk("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubric: items }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "保存失败");
        return;
      }
      setItems(json.rubric);
      setOk("评审维度已保存，下次生成评审意见时生效");
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="rounded-2xl border border-slate-200 bg-white/80 p-8">加载中…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        {items.map((item, i) => (
          <div key={item.key || i} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                维度名称
              </label>
              <input
                value={item.name}
                onChange={(e) => update(i, { name: e.target.value })}
                className="w-full rounded-lg border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  说明（AI 评审依据）
                </label>
                <input
                  value={item.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300/70 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500"
                />
              </div>
              <button
                onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))}
                disabled={items.length <= 1}
                className="mt-5 self-start rounded-lg border border-red-200 px-2.5 py-2 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                title="删除该维度"
              >
                删除
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() =>
            setItems((list) => [
              ...list,
              { key: `dim-${Date.now()}`, name: "", description: "" },
            ])
          }
          className="text-sm font-medium text-cyan-600 hover:underline"
        >
          + 添加维度
        </button>
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存配置"}
          </button>
          {error && <span className="text-sm text-red-400">{error}</span>}
          {ok && <span className="text-sm text-emerald-400">{ok}</span>}
        </div>
      </div>
    </div>
  );
}
