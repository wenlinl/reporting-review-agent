import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { xzdJson, xzdOptions } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTAINERS = ["冰箱", "零食柜", "药盒", "调料柜", "主食柜"];
const DEVICE = "h5-manual";

/** 批量录入（冷启动引导用）：一次添加一组常用食材，重复名称累加数量。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    items?: Array<{
      name?: string;
      category?: string;
      container?: string;
      expiryDays?: number;
    }>;
  };
  const items = (body.items || []).slice(0, 30);
  if (!items.length) {
    return xzdJson({ code: 1, msg: "items 不能为空" }, 400);
  }

  let created = 0;
  let updated = 0;
  const now = new Date();
  for (const raw of items) {
    const name = String(raw.name || "").trim().slice(0, 60);
    if (!name) continue;
    const container = CONTAINERS.includes(raw.container || "") ? raw.container! : "冰箱";
    const expiryDays = Math.max(1, Math.min(365, Number(raw.expiryDays) || 7));
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + expiryDays);
    const key = { name, container, deviceId: DEVICE };
    const exist = await prisma.foodItem.findUnique({
      where: { name_container_deviceId: key },
    });
    if (exist) {
      await prisma.foodItem.update({
        where: { id: exist.id },
        data: { quantity: exist.quantity + 1, expiryDate, daysLeft: expiryDays },
      });
      updated++;
    } else {
      await prisma.foodItem.create({
        data: {
          deviceId: DEVICE,
          name,
          category: String(raw.category || "其他").slice(0, 16),
          container,
          quantity: 1,
          recordMethod: "manual",
          scannedAt: now,
          expiryDate,
          daysLeft: expiryDays,
          confidence: 1,
        },
      });
      created++;
    }
  }
  return xzdJson({ code: 0, created, updated });
}

export { xzdOptions as OPTIONS };
