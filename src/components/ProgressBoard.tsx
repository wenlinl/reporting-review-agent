"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = {
  user: { id: string; name: string; email: string };
  presentation: {
    id: string;
    title: string;
    status: string;
    pptUploaded: boolean;
    reviewed: boolean;
    recorded: boolean;
    transcribed: boolean;
    feedback: boolean;
  } | null;
};

type Counts = {
  total: number;
  pptUploaded: number;
  reviewed: number;
  recorded: number;
  transcribed: number;
  feedback: number;
};

type Pres = NonNullable<Row["presentation"]>;

const STEPS: { key: keyof Omit<Pres, "id" | "title" | "status">; label: string }[] = [
  { key: "pptUploaded", label: "上传 PPT" },
  { key: "reviewed", label: "AI 评审" },
  { key: "recorded", label: "录音" },
  { key: "transcribed", label: "转写" },
  { key: "feedback", label: "反馈" },
];

export default function ProgressBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/progress");
    const json = await res.json();
    if (res.ok) {
      setRows(json.rows);
      setCounts(json.counts);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const doneCount = rows.filter((r) => r.presentation?.feedback).length;

  return (
    <div className="space-y-6">
      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "总人数", value: counts.total },
            { label: "已上传 PPT", value: counts.pptUploaded },
            { label: "已完成评审", value: counts.reviewed },
            { label: "已录音", value: counts.recorded },
            { label: "已完成转写", value: counts.transcribed },
            { label: "已获反馈", value: counts.feedback },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="text-2xl font-bold text-cyan-600">{c.value}</div>
              <div className="mt-0.5 text-xs text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {counts && counts.total > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-800">整体完成度</span>
            <span className="text-slate-500">{doneCount}/{counts.total} 人已获得反馈</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(doneCount / counts.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">汇报人</th>
              <th className="px-4 py-3 font-medium">汇报主题</th>
              {STEPS.map((s) => (
                <th key={s.key} className="px-4 py-3 text-center font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{r.user.name}</div>
                  <div className="text-xs text-slate-400">{r.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  {r.presentation ? (
                    <Link
                      href={`/presentations/${r.presentation.id}`}
                      className="font-medium text-cyan-600 hover:underline"
                    >
                      {r.presentation.title}
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">未创建汇报</span>
                  )}
                </td>
                {STEPS.map((s) => (
                  <td key={s.key} className="px-4 py-3 text-center">
                    {r.presentation?.[s.key] ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-sm text-emerald-600">
                        ✓
                      </span>
                    ) : (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
