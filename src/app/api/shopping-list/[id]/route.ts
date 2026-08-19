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
  const body = (await req.json().catch(() => null)) as {
    done?: boolean;
    qty?: number;
  } | null;
  try {
    const item = await prisma.shoppingListItem.updateMany({
      where: { id, familyId: fam.ctx.familyId },
      data: {
        done: body?.done !== undefined ? Boolean(body.done) : undefined,
        qty: body?.qty != null ? Math.max(1, Math.min(999, Number(body.qty))) : undefined,
        boughtAt: body?.done ? new Date() : body?.done === false ? null : undefined,
      },
    });
    if (item.count === 0) return xzdJson({ code: 1, msg: "记录不存在" }, 404);
    const fresh = await prisma.shoppingListItem.findUnique({ where: { id } });
    return xzdJson({ code: 0, item: fresh });
  } catch {
    return xzdJson({ code: 1, msg: "记录不存在" }, 404);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const { id } = await ctx.params;
  try {
    const r = await prisma.shoppingListItem.deleteMany({
      where: { id, familyId: fam.ctx.familyId },
    });
    if (r.count === 0) return xzdJson({ code: 1, msg: "记录不存在" }, 404);
    return xzdJson({ code: 0 });
  } catch {
    return xzdJson({ code: 1, msg: "记录不存在" }, 404);
  }
}

export { xzdOptions as OPTIONS };
