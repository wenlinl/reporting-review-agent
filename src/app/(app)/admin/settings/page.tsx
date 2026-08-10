import { requireAdmin } from "@/lib/auth";
import RubricEditor from "@/components/RubricEditor";

export default async function AdminSettingsPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">评审配置</h1>
        <p className="mt-1 text-sm text-slate-500">
          AI 评审 PPT 时使用的固定评审维度
        </p>
      </div>
      <RubricEditor />
    </div>
  );
}
