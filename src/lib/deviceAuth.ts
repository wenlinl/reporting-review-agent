import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

/**
 * 设备级鉴权：固件携带 X-Device-Token 请求头，
 * 与 Device.tokenHash（bcrypt）比对，通过后刷新 lastSeenAt。
 */
export async function verifyDevice(
  req: NextRequest,
  deviceId: string,
): Promise<{
  ok: boolean;
  device?: {
    id: string;
    deviceId: string;
    memberId: string | null;
    familyId: string | null;
  };
}> {
  const token = req.headers.get("x-device-token") || "";
  if (!token || !deviceId) return { ok: false };
  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device?.tokenHash) return { ok: false };
  const ok = await bcrypt.compare(token, device.tokenHash);
  if (!ok) return { ok: false };
  await prisma.device
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});
  return {
    ok: true,
    device: {
      id: device.id,
      deviceId: device.deviceId,
      memberId: device.memberId,
      familyId: device.familyId,
    },
  };
}
