import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const list = await prisma.notification.findMany({
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
  const n = await prisma.notification.create({
    data: {
      type: "system",
      title: "测试通知",
      desc: "通知通道正常 ✓",
      view: "notif",
    },
  });
  return xzdJson({ code: 0, notification: n }, 201);
}

export { xzdOptions as OPTIONS };
