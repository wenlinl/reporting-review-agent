import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMyMember } from "@/lib/family";

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
  const me = await getMyMember(session);
  if (!me.familyId) {
    return NextResponse.json({ error: "请先创建或加入家庭" }, { status: 403 });
  }
  const row = await prisma.reminderSetting.findUnique({
    where: { familyId_key: { familyId: me.familyId, key: KEY } },
  });
  const stored = row?.value ? JSON.parse(row.value) : {};
  return NextResponse.json({ settings: { ...DEFAULTS, ...stored } });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const me = await getMyMember(session);
  if (!me.familyId) {
    return NextResponse.json({ error: "请先创建或加入家庭" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...DEFAULTS, ...body };
  // 只覆盖请求中出现的字段，避免部分更新把其它开关关掉
  for (const k of ["expiryEnabled", "recipeEnabled", "memberEnabled"]) {
    if (k in body) next[k] = Boolean(body[k]);
  }
  if ("expiryDays" in body) {
    next.expiryDays = Math.min(14, Math.max(1, Number(body.expiryDays) || 3));
  }
  if ("quietStart" in body && /^\d{2}:\d{2}$/.test(String(body.quietStart || ""))) {
    next.quietStart = body.quietStart;
  }
  if ("quietEnd" in body && /^\d{2}:\d{2}$/.test(String(body.quietEnd || ""))) {
    next.quietEnd = body.quietEnd;
  }
  await prisma.reminderSetting.upsert({
    where: { familyId_key: { familyId: me.familyId, key: KEY } },
    update: { value: JSON.stringify(next) },
    create: { familyId: me.familyId, key: KEY, value: JSON.stringify(next) },
  });
  return NextResponse.json({ settings: next });
}
