import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateInviteCode, getMyMember, memberPublic } from "@/lib/family";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 我的家庭：无家庭时 family 为 null（H5 显示创建/加入入口）。 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const me = await getMyMember(session);
  if (!me.familyId) {
    return NextResponse.json({ code: 0, family: null, me: memberPublic(me) });
  }
  const family = await prisma.family.findUnique({
    where: { id: me.familyId },
    include: { members: true },
  });
  if (!family) {
    return NextResponse.json({ code: 0, family: null, me: memberPublic(me) });
  }
  return NextResponse.json({
    code: 0,
    family: { id: family.id, name: family.name, inviteCode: family.inviteCode },
    me: memberPublic(me),
    members: family.members
      .sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1))
      .map(memberPublic),
  });
}

/** 创建家庭（创建者自动成为管理员）。 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { name } = await req.json().catch(() => ({}));
  const familyName = String(name || "").trim().slice(0, 30);
  if (!familyName) {
    return NextResponse.json({ error: "请输入家庭名称" }, { status: 400 });
  }
  const me = await getMyMember(session);
  if (me.familyId) {
    return NextResponse.json({ error: "你已经在家庭中" }, { status: 400 });
  }
  const family = await prisma.$transaction(async (tx) => {
    const f = await tx.family.create({
      data: { name: familyName, inviteCode: generateInviteCode() },
    });
    await tx.member.update({
      where: { id: me.id },
      data: { familyId: f.id, role: "admin" },
    });
    // 新家庭欢迎通知 + 今日推荐（让新用户第一眼看到价值）
    await tx.notification.create({
      data: {
        familyId: f.id,
        type: "system",
        title: `欢迎来到「${familyName}」🏠`,
        desc: "去添加食材吧：一键添加常用食材，或试试扫描录入",
        view: "inv",
      },
    });
    const recipe = await tx.recipe.findFirst({});
    if (recipe) {
      await tx.notification.create({
        data: {
          familyId: f.id,
          type: "recipe",
          title: `今日推荐 · ${recipe.name}`,
          desc: "使用库存食材即可完成，去看看做法",
          view: "recipe:0",
        },
      });
    }
    return f;
  });
  return NextResponse.json({
    code: 0,
    family: { id: family.id, name: family.name, inviteCode: family.inviteCode },
  });
}
