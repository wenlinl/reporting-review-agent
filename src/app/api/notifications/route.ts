import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const list = await prisma.notification.findMany({
    where: { familyId: fam.ctx.familyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return xzdJson({
    code: 0,
    notifications: list.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      desc: n.desc,
      unread: n.unread,
      view: n.view,
      createdAt: n.createdAt,
    })),
  });
}

/** 发送一条测试通知（通知设置页「测试」按钮）。 */
export async function POST() {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const n = await prisma.notification.create({
    data: {
      familyId: fam.ctx.familyId,
      type: "system",
      title: "测试通知",
      desc: "通知通道正常 ✓",
      view: "notif",
    },
  });
  return xzdJson({ code: 0, notification: n }, 201);
}

export { xzdOptions as OPTIONS };
