import { NextRequest } from "next/server";
import { parseMultipart } from "@/lib/multipart";
import { saveUpload } from "@/lib/files";
import { prisma } from "@/lib/db";
import { parseFoodPhoto } from "@/lib/xzdVision";
import { xzdJson, xzdOptions } from "@/lib/http";
import { verifyDevice } from "@/lib/deviceAuth";
import { settleWindows } from "@/lib/windowSettle";
import { rateLimit } from "@/lib/rateLimit";
import { getSession } from "@/lib/auth";
import { requireFamilyCtx } from "@/lib/familyCtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTAINERS = ["冰箱", "零食柜", "药盒", "调料柜", "主食柜"];
const STORAGE_MAP: Record<string, string> = {
  冰箱: "保鲜中",
  零食柜: "常温",
  药盒: "常温",
  调料柜: "常温",
  主食柜: "常温",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtUtc(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseExpiry(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 硬件上传入口（T5-E1 固件调用）。契约：multipart，字段 image/deviceId/action/container/timestamp/requestId；
 * 返回扁平 JSON：code/name/scannedAt/expiryDate/daysLeft/suggestedContainer/confidence/note/keepDays/stockTotal。
 * 鉴权：X-Device-Token 请求头（与 Device.tokenHash 比对）；限流 + requestId 幂等。
 * H5 手机扫描走登录会话：preview=1 仅识别不入库；确认录入时前端回传 name/category/confidence/expiryDate/suggestedContainer/note 直接记账，不再重复调视觉 AI。
 */
export async function POST(req: NextRequest) {
  let parsed: Awaited<ReturnType<typeof parseMultipart>>;
  try {
    parsed = await parseMultipart(req, { maxFileSizeMB: 10 });
  } catch {
    return xzdJson({ code: 1, msg: "multipart 解析失败" });
  }

  const image = parsed.files.find((f) => f.field === "image");
  if (!image || image.buffer.length < 128) {
    return xzdJson({ code: 1, msg: "缺少图片" });
  }

  const f = parsed.fields;
  const action = f.action === "out" ? "out" : "in";
  const container = CONTAINERS.includes(f.container ?? "") ? f.container! : "冰箱";
  const deviceId = (f.deviceId || "xzd-t5e1-001").slice(0, 64);
  const requestId = (f.requestId || "").slice(0, 80);
  const preview = f.preview === "1" || f.preview === "true";
  const clientName = (f.name || "").trim().slice(0, 20);

  // 鉴权：固件走 X-Device-Token，H5 手机扫描走登录会话
  const session = await getSession();
  const devAuth = await verifyDevice(req, deviceId);
  const fam = await requireFamilyCtx();
  if (!devAuth.ok && !fam.ctx) {
    return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  }
  // 限流：每台设备每分钟最多 30 次
  const rl = rateLimit(`scan:${deviceId}`, 30, 60_000);
  if (!rl.ok) {
    return xzdJson({ code: 429, msg: `请求过于频繁，请 ${rl.retryAfter}s 后重试` }, 429);
  }

  // 幂等：固件网络重试时按 requestId 去重，直接返回上一次结果
  if (requestId && !preview) {
    const dup = await prisma.scanLog.findUnique({ where: { requestId } });
    if (dup) {
      // 关门结算：窗口已闭合则自动生成待确认批次（不阻塞扫码响应）
  await settleWindows(deviceId);

  const stockTotal = await prisma.foodItem.count({ where: { deviceId } });
      return xzdJson({
        code: 0,
        name: dup.name === "未识别" ? "" : dup.name,
        scannedAt: fmtUtc(dup.scannedAt),
        expiryDate: dup.expiryDate ? fmtDate(dup.expiryDate) : "",
        daysLeft: dup.daysLeft,
        suggestedContainer: dup.container,
        confidence: dup.confidence,
        keepDays: dup.keepDays,
        stockTotal,
        note: dup.note,
        duplicated: true,
      });
    }
  }

  let scannedAt = new Date();
  if (f.timestamp && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(f.timestamp)) {
    const d = new Date(f.timestamp.replace(" ", "T") + "Z");
    if (!isNaN(d.getTime())) scannedAt = d;
  }

  let item;
  if (!preview && clientName) {
    // H5 确认录入：直接采用预览识别结果记账，避免重复调用视觉 AI 导致结果不一致
    item = {
      name: clientName,
      category: (f.category || "其他").slice(0, 16),
      expiryDate: (f.expiryDate || "").trim() || null,
      suggestedContainer: CONTAINERS.includes(f.suggestedContainer ?? "")
        ? f.suggestedContainer!
        : container,
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0)),
      note: (f.note || "").slice(0, 96),
    };
  } else {
    try {
      item = await parseFoodPhoto(image.buffer.toString("base64"));
    } catch (e) {
      return xzdJson({ code: 2, msg: e instanceof Error ? e.message : "AI 调用失败" });
    }
  }

  const name = item.name;
  const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
  const recognized = confidence >= 0.5 && name.length > 0;
  const expiryDate = parseExpiry(item.expiryDate);
  const daysLeft = expiryDate
    ? Math.round(
        (startOfDay(expiryDate).getTime() - startOfDay(scannedAt).getTime()) / 86400000,
      )
    : -1;
  const category = (item.category || "其他").slice(0, 16);
  const suggestedContainer = CONTAINERS.includes(item.suggestedContainer)
    ? item.suggestedContainer
    : container;
  const note = item.note.slice(0, 96);

  // H5 预览识别：只返回识别结果，不写库存/流水/文件；确认录入时前端再提交一次
  if (preview) {
    return xzdJson({
      code: 0,
      name: recognized ? name : "",
      scannedAt: fmtUtc(scannedAt),
      expiryDate: expiryDate ? fmtDate(expiryDate) : "",
      daysLeft,
      category,
      suggestedContainer,
      confidence: Number(confidence.toFixed(2)),
      keepDays: recognized && daysLeft >= 0 ? daysLeft : null,
      note,
      preview: true,
    });
  }

  const imagePath = saveUpload("xzd", image.filename || "scan.jpg", image.buffer);

  // 设备（固件路径 verifyDevice 已刷新 lastSeenAt；H5 路径按需补建）
  let device = devAuth.ok ? devAuth.device! : null;
  if (!device) {
    device = await prisma.device.upsert({
      where: { deviceId },
      update: { lastSeenAt: new Date() },
      create: { deviceId, name: deviceId, lastSeenAt: new Date() },
    });
  }
  const familyId = devAuth.ok
    ? device.familyId
    : fam.ctx!.familyId;
  const memberId = devAuth.ok
    ? device.memberId || null
    : fam.ctx!.memberId;
  await prisma.deviceLog.create({
    data: { deviceId, event: recognized ? "SCAN_OK" : "LOW_CONF", msg: name.slice(0, 100) || note.slice(0, 100) },
  });

  // 识别知识库沉淀（自动分类一致性）
  let catalog = null;
  if (recognized) {
    catalog = await prisma.foodCatalog.upsert({
      where: { name },
      update: { category, suggestedContainer },
      create: {
        name,
        category,
        suggestedContainer,
        source: "ai",
        keepDays: daysLeft >= 0 ? daysLeft : null,
        defaultExpiryDays: daysLeft >= 0 ? daysLeft : null,
      },
    });
  }
  const keepDays = recognized ? (catalog?.keepDays ?? (daysLeft >= 0 ? daysLeft : null)) : null;
  const emoji = recognized ? catalog?.emoji || null : null;
  const storage = STORAGE_MAP[suggestedContainer] || null;

  // 库存变更（当前库存表）：低置信不建库存，交给固件走重扫
  if (recognized) {
    const key = { name, container: suggestedContainer, deviceId };
    const exist = await prisma.foodItem.findUnique({
      where: { name_container_deviceId: key },
    });
    if (action === "in") {
      if (exist) {
        await prisma.foodItem.update({
          where: { id: exist.id },
          data: {
            quantity: exist.quantity + 1,
            category,
            emoji,
            expiryDate,
            daysLeft,
            confidence,
            keepDays,
            storage,
            note,
            imagePath,
            scannedAt,
            memberId: memberId || exist.memberId,
            familyId: familyId || exist.familyId,
          },
        });
      } else {
        await prisma.foodItem.create({
          data: {
            deviceId,
            familyId,
            memberId,
            name,
            category,
            emoji,
            container: suggestedContainer,
            quantity: 1,
            recordMethod: "camera",
            keepDays,
            storage,
            scannedAt,
            expiryDate,
            daysLeft,
            confidence,
            note,
            imagePath,
          },
        });
      }
    } else if (exist) {
      if (exist.quantity > 1) {
        await prisma.foodItem.update({
          where: { id: exist.id },
          data: { quantity: exist.quantity - 1 },
        });
      } else {
        await prisma.foodItem.delete({ where: { id: exist.id } });
      }
    }
  }

  await prisma.scanLog.create({
    data: {
      requestId: requestId || undefined,
      deviceId,
      familyId,
      memberId,
      action,
      name: recognized ? name : "未识别",
      category,
      emoji,
      container: suggestedContainer,
      recordMethod: "camera",
      keepDays,
      scannedAt,
      expiryDate,
      daysLeft,
      confidence,
      note,
      imagePath,
    },
  });

  const stockTotal = await prisma.foodItem.count({ where: { deviceId } });
  return xzdJson({
    code: 0,
    name: recognized ? name : "",
    scannedAt: fmtUtc(scannedAt),
    expiryDate: expiryDate ? fmtDate(expiryDate) : "",
    daysLeft,
    suggestedContainer,
    confidence: Number(confidence.toFixed(2)),
    keepDays,
    stockTotal,
    note,
  });
}

export { xzdOptions as OPTIONS };
