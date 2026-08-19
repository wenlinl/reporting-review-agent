import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai";
import { xzdJson, xzdOptions } from "@/lib/http";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** AI 今日推荐：结合当前库存 + 家庭成员口味偏好推荐菜谱（AI 失败时规则兜底）。 */
export async function POST(req: NextRequest) {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(6, Math.max(1, Number(body.limit) || 3));

  const [items, recipes, members] = await Promise.all([
    prisma.foodItem.findMany({
      where: { familyId: fam.ctx.familyId },
      select: { name: true, quantity: true },
    }),
    prisma.recipe.findMany({}),
    prisma.member.findMany({ select: { preferences: true } }),
  ]);
  if (!recipes.length) {
    return xzdJson({ code: 0, recipes: [], summary: "菜谱库还没有数据" });
  }

  const has = new Set(items.map((i) => i.name));
  const prefs = Array.from(
    new Set(
      members.flatMap((m) =>
        m.preferences ? (JSON.parse(m.preferences) as string[]) : [],
      ),
    ),
  );
  const list = recipes.map((r) => {
    const ingredients = JSON.parse(r.ingredients || "[]") as Array<{
      name: string;
      qty?: string;
    }>;
    return {
      id: r.id,
      name: r.name,
      emoji: r.emoji || "🍽️",
      ingredients: ingredients.map((x) => x.name),
    };
  });

  // 规则兜底：按「库存可做食材数」排序
  const scored = list
    .map((r) => ({ r, have: r.ingredients.filter((x) => has.has(x)).length }))
    .sort((a, b) => b.have - a.have);
  const fallback = scored.slice(0, limit).map(({ r, have }) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    reason:
      have > 0
        ? `库存可直接做（${have}/${r.ingredients.length} 种食材齐全）`
        : "按库存匹配的推荐",
  }));

  try {
    const system =
      "你是「食刻」的家庭饮食推荐助手。结合冰箱库存和家庭成员口味偏好，从给定菜谱中挑选最合适的几道，给出简短理由。只输出 JSON，不要输出其它文字。";
    const user = JSON.stringify({
      inventory: items.map((i) => `${i.name}×${i.quantity}`),
      preferences: prefs,
      recipes: list.map((r) => ({ id: r.id, name: r.name, ingredients: r.ingredients })),
    });
    const data = await chatJson<{
      summary: string;
      picks: Array<{ id: string; reason: string }>;
    }>(
      system,
      `请推荐 ${limit} 道菜：优先利用库存现有食材、贴合口味偏好、避免浪费。\n输入数据：${user}\n输出格式：{"summary":"一句话总结","picks":[{"id":"菜谱id","reason":"推荐理由"}]}`,
      { temperature: 0.6, maxTokens: 1500 },
    );
    const idMap = new Map(list.map((r) => [r.id, r]));
    const picks = (data.picks || [])
      .slice(0, limit)
      .map((p) => {
        const r = idMap.get(p.id);
        return r
          ? { id: r.id, name: r.name, emoji: r.emoji, reason: String(p.reason || "").slice(0, 120) }
          : null;
      })
      .filter(Boolean);
    if (picks.length) {
      return xzdJson({
        code: 0,
        recipes: picks,
        summary: String(data.summary || "").slice(0, 200),
        ai: true,
      });
    }
  } catch {
    // AI 不可用（未配 Key / 接口异常）→ 规则兜底
  }
  return xzdJson({ code: 0, recipes: fallback, summary: "根据库存匹配的推荐", ai: false });
}

export { xzdOptions as OPTIONS };
