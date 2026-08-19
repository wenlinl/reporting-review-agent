import { prisma } from "@/lib/db";

const KEY = "notify";

/**
 * 每日通知生成（幂等，按家庭隔离）：临期/过期食材提醒 + 今日菜谱推荐。
 * 由 src/instrumentation.ts 每 15 分钟调用一次，当天只生成一次。
 */
export async function generateNotifications(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let created = 0;
  const day = today.toISOString().slice(0, 10);
  const families = await prisma.family.findMany({ select: { id: true } });

  for (const f of families) {
    const done = await prisma.reminderRecord.findUnique({
      where: {
        type_scheduledFor: {
          type: `notify-daily:${f.id}`,
          scheduledFor: today,
        },
      },
    });
    if (done) continue;

    const row = await prisma.reminderSetting.findUnique({
      where: { familyId_key: { familyId: f.id, key: KEY } },
    });
    const cfg = row?.value
      ? (JSON.parse(row.value) as Record<string, unknown>)
      : {};
    const expiryEnabled = cfg.expiryEnabled !== false;
    const recipeEnabled = cfg.recipeEnabled !== false;
    const days = Math.max(1, Math.min(14, Number(cfg.expiryDays) || 3));

    if (expiryEnabled) {
      const items = await prisma.foodItem.findMany({
        where: { familyId: f.id },
      });
      const targets = items.filter(
        (i) => i.daysLeft >= 0 && i.daysLeft <= days,
      );
      const expired = items.filter((i) => i.daysLeft < 0);
      for (const it of [...targets, ...expired]) {
        const type = `expiry:${f.id}:${it.id}:${day}`;
        const rec = await prisma.reminderRecord.findUnique({
          where: { type_scheduledFor: { type, scheduledFor: today } },
        });
        if (rec) continue;
        await prisma.notification.create({
          data: {
            familyId: f.id,
            type: "expiry",
            title: it.daysLeft < 0 ? `${it.name} 已过期` : `${it.name} 即将到期`,
            desc:
              it.daysLeft < 0
                ? `${it.container} · 建议尽快清理`
                : `${it.container} · 剩余 ${it.daysLeft} 天，建议尽快食用`,
            view: "remind",
          },
        });
        await prisma.reminderRecord.create({
          data: { type, scheduledFor: today },
        });
        created++;
      }
    }

    if (recipeEnabled) {
      const recipe = await prisma.recipe.findFirst({});
      if (recipe) {
        const type = `recipe:${f.id}:${day}`;
        const rec = await prisma.reminderRecord.findUnique({
          where: { type_scheduledFor: { type, scheduledFor: today } },
        });
        if (!rec) {
          await prisma.notification.create({
            data: {
              familyId: f.id,
              type: "recipe",
              title: `今日推荐 · ${recipe.name}`,
              desc: "使用库存食材即可完成，去看看做法",
              view: "recipe:0",
            },
          });
          await prisma.reminderRecord.create({
            data: { type, scheduledFor: today },
          });
          created++;
        }
      }
    }

    await prisma.reminderRecord.create({
      data: { type: `notify-daily:${f.id}`, scheduledFor: today },
    });
  }
  return created;
}
