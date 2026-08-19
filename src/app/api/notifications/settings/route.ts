import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "notify";
const DEFAULTS = {
  expiryEnabled: true,
  expiryDays: 3,
  recipeEnabled: true,
  memberEnabled: true,
  quietStart: "22:00",
  quietEnd: "08:00",
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const row = await prisma.reminderSetting.findUnique({ where: { key: KEY } });
  const stored = row?.value ? JSON.parse(row.value) : {};
  return NextResponse.json({ settings: { ...DEFAULTS, ...stored } });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...DEFAULTS, ...body };
  // 白名单校验
  for (const k of ["expiryEnabled", "recipeEnabled", "memberEnabled"]) {
    next[k] = Boolean(body[k]);
  }
  next.expiryDays = Math.min(14, Math.max(1, Number(body.expiryDays) || 3));
  next.quietStart = /^\d{2}:\d{2}$/.test(String(body.quietStart || "")) ? body.quietStart : DEFAULTS.quietStart;
  next.quietEnd = /^\d{2}:\d{2}$/.test(String(body.quietEnd || "")) ? body.quietEnd : DEFAULTS.quietEnd;
  await prisma.reminderSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(next) },
    create: { key: KEY, value: JSON.stringify(next) },
  });
  return NextResponse.json({ settings: next });
}
