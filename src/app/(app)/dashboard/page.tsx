import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import CreatePresentationForm from "@/components/CreatePresentationForm";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  reviewed: "已评审",
  finalized: "已定稿",
  presented: "已汇报",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const presentations = await prisma.presentation.findMany({
    where: user.role === "admin" ? {} : { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { name: true } },
      _count: { select: { reviews: true, recordings: true } },
      feedback: { select: { id: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {user.role === "admin" ? "全部汇报" : "我的汇报"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.role === "admin"
              ? "湖山相映，汇报争辉 —— 查看大家的准备进度"
              : "上传 PPT 获得 Ray 评审团意见，汇报后获得反馈 · 湖山入卷，皆是高光"}
          </p>
        </div>
        <CreatePresentationForm />
      </div>

      {presentations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center">
          <div className="mb-3 text-4xl">📄</div>
          <p className="text-sm text-slate-500">
            还没有汇报，点击右上角「新建汇报」开始
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">汇报</th>
                <th className="px-4 py-3 font-medium">汇报人</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">PPT / 评审 / 录音</th>
                <th className="px-4 py-3 font-medium">反馈</th>
                <th className="px-4 py-3 font-medium">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {presentations.map((p) => (
                <tr key={p.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/presentations/${p.id}`}
                      className="font-semibold text-cyan-600 hover:underline"
                    >
                      {p.title}
                    </Link>
                    {p.goal && (
                      <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-slate-400">
                        {p.goal}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.user.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.status === "presented"
                          ? "bg-emerald-50 text-emerald-700"
                          : p.status === "reviewed"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.pptName ? "✓ PPT" : "— PPT"} · {p._count.reviews} 次评审 ·{" "}
                    {p._count.recordings} 段录音
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.feedback ? "✓ 已生成" : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {p.updatedAt.toLocaleString("zh-CN", { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
