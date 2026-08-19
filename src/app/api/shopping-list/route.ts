import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const items = await prisma.shoppingListItem.findMany({
    where: { familyId: fam.ctx.familyId },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
  });
  return xzdJson({
    code: 0,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      qty: i.qty,
      unit: i.unit,
      done: i.done,
      suggested: i.suggested,
      source: i.source,
      boughtAt: i.boughtAt,
      createdAt: i.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    qty?: number;
    unit?: string;
    suggested?: boolean;
    source?: string;
  } | null;
  const name = (body?.name || "").trim();
  if (!name) return xzdJson({ code: 1, msg: "name 必填" });
  const item = await prisma.shoppingListItem.create({
    data: {
      familyId: fam.ctx.familyId,
      name: name.slice(0, 40),
      qty: Math.max(1, Math.min(999, Number(body?.qty) || 1)),
      unit: body?.unit || "",
      suggested: Boolean(body?.suggested),
      source: body?.source || "manual",
    },
  });
  return xzdJson({ code: 0, item });
}

export { xzdOptions as OPTIONS };
