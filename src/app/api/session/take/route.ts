import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { parseMultipart } from "@/lib/multipart";
import { verifyDevice } from "@/lib/deviceAuth";
import { ensureDir, uploadsRoot } from "@/lib/files";
import { rateLimit } from "@/lib/rateLimit";
import { xzdJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 长录 take 的**分片批量**上传（2026-10-15）
 *
 * 背景：内模组固件（SESSION_LONG_SD=1 + SESSION_LONG_UPLOAD=1）录完一次长录后，
 * 把 take 目录里的 JPEG 帧按批 POST 上来 —— 一批最多 20 帧 / ≤1MB，
 * 字段：deviceId / take / first + N 个 frame 文件。
 * 为什么不是一帧一请求：2 分钟 = 1200 帧 = 1200 个 HTTPS 请求，传输时间不可接受。
 *
 * 断点续传由**设备端**负责（take 目录里的 up.json 记 sent，断网断电后接着传），
 * 所以本端点只需**幂等**：按文件名里的帧号落盘，重复收到同一帧就覆盖。
 *
 * 返回：{"code":0,"take":"shike/long01","received":20,"next":20,"total":101}
 */
export async function POST(req: NextRequest) {
  let parsed: Awaited<ReturnType<typeof parseMultipart>>;
  try {
    parsed = await parseMultipart(req, { maxFileSizeMB: 4 });
  } catch {
    return xzdJson({ code: 1, msg: "multipart 解析失败" }, 400);
  }

  const f = parsed.fields;
  const deviceId = (f.deviceId || "").slice(0, 64);
  const rawTake = (f.take || "").trim();
  const first = Math.max(0, Number.parseInt(f.first || "0", 10) || 0);
  if (!rawTake) return xzdJson({ code: 1, msg: "缺少 take" }, 400);

  const auth = await verifyDevice(req, deviceId);
  if (!auth.ok) return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);

  const rl = rateLimit(`sess:${deviceId}`, 240, 60_000);
  if (!rl.ok) {
    return xzdJson({ code: 429, msg: `请求过于频繁，请 ${rl.retryAfter}s 后重试` }, 429);
  }

  // 只留安全字符，防目录穿越（设备给的是 /shike/long01）
  const take = rawTake
    .replace(/[^A-Za-z0-9_\-\/]/g, "")
    .replace(/\.+/g, "")
    .replace(/^\/+/, "");
  if (!take) return xzdJson({ code: 1, msg: "take 非法" }, 400);

  const frames = parsed.files
    .filter((x) => x.field === "frame")
    .sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
  if (frames.length === 0) return xzdJson({ code: 1, msg: "缺少 frame" }, 400);

  const dir = path.join(uploadsRoot(), "takes", take);
  ensureDir(dir);

  let saved = 0;
  let last = first - 1;
  for (const fr of frames) {
    const m = /(\d+)\.(jpe?g)$/i.exec(fr.filename || "");
    const idx = m ? Number.parseInt(m[1], 10) : first + saved;
    fs.writeFileSync(path.join(dir, `f${String(idx).padStart(6, "0")}.jpg`), fr.buffer);
    saved += 1;
    if (idx > last) last = idx;
  }

  // index.json：服务端侧对账用（收到多少帧 / 覆盖到第几帧），不参与设备端断点
  const indexPath = path.join(dir, "index.json");
  let prev: { received?: number; last?: number } = {};
  try {
    prev = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch {
    /* 第一次收到这个 take */
  }
  const meta = {
    deviceId,
    take,
    received: Number(prev.received || 0) + saved,
    last: Math.max(Number(prev.last ?? -1), last),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(indexPath, JSON.stringify(meta, null, 2));

  return xzdJson({
    code: 0,
    take,
    received: saved,
    next: last + 1,
    total: meta.received,
  });
}

/** 体检用：GET /api/session/take?take=/shike/long01&deviceId=… 看服务端收到多少帧 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  const deviceId = q.get("deviceId") || "";
  const auth = await verifyDevice(req, deviceId);
  if (!auth.ok) return xzdJson({ code: 401, msg: "设备鉴权失败" }, 401);
  const take = (q.get("take") || "")
    .replace(/[^A-Za-z0-9_\-\/]/g, "")
    .replace(/\.+/g, "")
    .replace(/^\/+/, "");
  const dir = path.join(uploadsRoot(), "takes", take);
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((x) => /^f\d{6}\.jpg$/.test(x))
      .sort();
  } catch {
    /* 没有这个 take */
  }
  return xzdJson({
    code: 0,
    take,
    frames: files.length,
    first: files[0] || "",
    last: files[files.length - 1] || "",
  });
}
