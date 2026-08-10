import { requireAdmin } from "@/lib/auth";
import UsersManager from "@/components/UsersManager";

export default async function AdminUsersPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">用户管理</h1>
        <p className="mt-1 text-sm text-slate-500">
          创建同事账号，每人获得「姓名 + 邮箱 + 初始密码」
        </p>
      </div>
      <UsersManager />
    </div>
  );
}
