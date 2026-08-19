import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** 数据接口统一入口：要求登录且已加入家庭，返回 familyId / memberId。 */
export async function requireFamilyCtx() {
  const session = await getSession();
  if (!session) {
    return { error: "请先登录", status: 401 as const, ctx: null as null };
  }
  const member = await prisma.member.findUnique({
    where: { userId: session.id },
  });
  if (!member || !member.familyId) {
    return {
      error: "请先创建或加入家庭",
      status: 403 as const,
      ctx: null as null,
    };
  }
  return {
    error: null,
    status: 200 as const,
    ctx: { familyId: member.familyId, memberId: member.id },
  };
}
