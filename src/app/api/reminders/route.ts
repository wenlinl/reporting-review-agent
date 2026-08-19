import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai";
import { xzdJson, xzdOptions } from "@/lib/http";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function fallbackSuggestion(daysLeft: number): string {
  if (daysLeft < 0) return "已过期，建议清理并记录";
  if (daysLeft === 0) return "今天到期，建议今天食用或做成菜";
  if (daysLeft === 1) return "建议明天内吃完";
  return "建议尽快食用，注意冷藏";
}

/** AI 生成临期/过期处理建议（失败时规则兜底，逐条覆盖）。 */
async function aiSuggestions(
  items: Array<{ name: string; daysLeft: number }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!items.length) return map;
  try {
    const data = await chatJson<{
      suggestions: Array<{ name: string; suggestion: string }>;
    }>(
      "你是「食刻」的家庭食材管理助手。针对即将过期/已过期的食材给出简短、可执行的处理建议。只输出 JSON：{\"suggestions\":[{\"name\":\"食材名\",\"suggestion\":\"建议\"}]}",
      `食材清单：${JSON.stringify(items)}`,
      { temperature: 0.5, maxTokens: 1200 },
    );
    for (const s of data.suggestions || []) {
      if (s?.name && s?.suggestion) map.set(s.name, String(s.suggestion).slice(0, 120));
    }
  } catch {
    // AI 不可用 → 规则兜底
  }
  return map;
}

/** 临期 / 过期提醒列表（含 AI 处理建议）。 */
export async function GET() {
  const fam = await requireFamilyCtx();
  if (!fam.ctx) return xzdJson({ code: 1, msg: fam.error }, fam.status);
  const rows = await prisma.foodItem.findMany({
    where: { familyId: fam.ctx.familyId },
  });
  const today = startOfDay(new Date());
  const soon: Array<Record<string, unknown>> = [];
  const expired: Array<Record<string, unknown>> = [];

  for (const it of rows) {
    const daysLeft = it.expiryDate
      ? Math.round(
          (startOfDay(it.expiryDate).getTime() - today.getTime()) / 86400000,
        )
      : it.daysLeft;
    if (daysLeft === -1) continue; // 未知到期不提醒
    const base = {
      id: it.id,
      name: it.name,
      container: it.container,
      quantity: it.quantity,
      expiryDate: it.expiryDate ? it.expiryDate.toISOString().slice(0, 10) : null,
      daysLeft,
      suggestion: fallbackSuggestion(daysLeft),
    };
    if (daysLeft < 0) expired.push(base);
    else if (daysLeft <= 3) soon.push(base);
  }

  soon.sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));
  expired.sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));

  // AI 批量生成建议（仅当有临期/过期食材）
  const aiMap = await aiSuggestions(
    [...soon, ...expired].map((i) => ({
      name: i.name as string,
      daysLeft: i.daysLeft as number,
    })),
  );
  if (aiMap.size) {
    for (const it of [...soon, ...expired]) {
      const s = aiMap.get(it.name as string);
      if (s) it.suggestion = s;
    }
  }

  return xzdJson({ code: 0, soon, expired });
}

export { xzdOptions as OPTIONS };
