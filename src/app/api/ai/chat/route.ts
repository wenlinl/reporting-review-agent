import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai";
import { xzdJson, xzdOptions } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 食刻家庭饮食助手：基于真实库存/菜谱/购物清单回答问题（AI 失败时规则兜底）。 */
export async function POST(req: NextRequest) {
  const { message } = await req.json().catch(() => ({}));
  const question = String(message || "").trim().slice(0, 500);
  if (!question) {
    return xzdJson({ code: 1, msg: "请输入问题" }, 400);
  }

  const [items, recipes, shop] = await Promise.all([
    prisma.foodItem.findMany({ orderBy: [{ daysLeft: "asc" }] }),
    prisma.recipe.findMany({ take: 10 }),
    prisma.shoppingListItem.findMany({ where: { done: false }, take: 20 }),
  ]);
  const ctx = {
    inventory: items.map((i) =>
      `${i.name}×${i.quantity}${i.daysLeft >= 0 && i.daysLeft <= 3 ? `（剩${i.daysLeft}天）` : ""}`,
    ),
    recipes: recipes.map((r) => r.name),
    shoppingList: shop.map((s) => `${s.name}${s.qty > 1 ? `×${s.qty}` : ""}`),
  };

  try {
    const data = await chatJson<{ reply: string }>(
      "你是「食刻」的家庭饮食助手，很了解用户冰箱里有什么。回答要简短、口语化、实用，用中文。只输出 JSON：{\"reply\":\"回答\"}",
      `冰箱与家庭数据：${JSON.stringify(ctx)}\n用户问题：${question}`,
      { temperature: 0.7, maxTokens: 900 },
    );
    return xzdJson({ code: 0, reply: String(data.reply || "").slice(0, 800), ai: true });
  } catch {
    // 兜底：规则回答（不依赖 AI Key）
    const soon = items
      .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 2)
      .map((i) => i.name);
    const top = recipes[0]?.name;
    const lines = [
      soon.length
        ? `冰箱里 ${soon.join("、")} 快到期了，建议优先吃掉。`
        : "冰箱里没有特别临期的食材。",
      top ? `今天可以试试做「${top}」。` : "",
      shop.length ? `购物清单还有 ${shop.length} 项待买。` : "",
      "（AI 暂不可用，以上为本地规则回答）",
    ].filter(Boolean);
    return xzdJson({ code: 0, reply: lines.join("\n"), ai: false });
  }
}

export { xzdOptions as OPTIONS };
