import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(len = 6): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return `SHK-${s}`;
}

/** 当前用户的家庭档案；老账号没档案时自动补建（家庭显示名默认=账户名）。 */
export async function getMyMember(session: SessionUser) {
  let me = await prisma.member.findUnique({ where: { userId: session.id } });
  if (!me) {
    me = await prisma.member.create({
      data: {
        userId: session.id,
        name: session.name,
        avatar: "👤",
        preferences: "[]",
      },
    });
  }
  return me;
}

export function memberPublic(m: {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  responsibleCategory: string | null;
  preferences: string | null;
  userId: string | null;
  familyId: string | null;
}) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    avatar: m.avatar || "👤",
    responsibleCategory: m.responsibleCategory,
    preferences: m.preferences ? JSON.parse(m.preferences) : [],
    userId: m.userId,
    familyId: m.familyId,
  };
}
