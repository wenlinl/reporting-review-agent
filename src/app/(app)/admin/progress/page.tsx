import { requireAdmin } from "@/lib/auth";
import ProgressBoard from "@/components/ProgressBoard";

export default async function AdminProgressPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">进度看板</h1>
        <p className="mt-1 text-sm text-slate-500">
          汇报前：PPT 上传与 AI 评审进度；汇报当天：录音与反馈进度
        </p>
      </div>
      <ProgressBoard />
    </div>
  );
}
