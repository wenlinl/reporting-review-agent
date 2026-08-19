import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const { id } = await ctx.params;
  try {
    const r = await prisma.notification.updateMany({
      where: { id, familyId: fam.ctx.familyId },
      data: { unread: false },
    });
    if (r.count === 0) return xzdJson({ code: 1, msg: "记录不存在" }, 404);
    const n = await prisma.notification.findUnique({ where: { id } });
    return xzdJson({ code: 0, notification: n });
  } catch {
    return xzdJson({ code: 1, msg: "记录不存在" }, 404);
  }
}

export { xzdOptions as OPTIONS };
