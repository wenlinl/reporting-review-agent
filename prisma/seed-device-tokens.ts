import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * 为已有设备生成/重置设备 Token（bcrypt 哈希入库，明文只打印一次）。
 * 用法：pnpm db:devices          # 每台设备随机 Token
 *      DEVICE_TOKEN=xxx pnpm db:devices   # 指定统一 Token（固件烧录用）
 */
async function main() {
  const fixed = process.env.DEVICE_TOKEN?.trim();
  const devices = await prisma.device.findMany({ orderBy: { createdAt: "asc" } });
  if (!devices.length) {
    console.log("没有设备记录：先让固件上报一次，或手动插入 Device 后再执行。");
    return;
  }
  for (const d of devices) {
    const token = fixed || crypto.randomBytes(16).toString("hex");
    await prisma.device.update({
      where: { id: d.id },
      data: { tokenHash: await bcrypt.hash(token, 10) },
    });
    console.log(`${d.deviceId}  ->  XZD_DEVICE_TOKEN=${token}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
