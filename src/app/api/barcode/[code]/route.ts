import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { xzdJson, xzdOptions } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EAN_RE = /^(\d{8}|\d{12,14})$/;
const GS1_URL = "https://v1.apizero.cn/api/barcode-gs1";
const LOOKUP_URL = "https://v1.apizero.cn/api/barcode-lookup";

type BarcodeRow = {
  barcode: string;
  name: string;
  brand: string;
  spec: string;
  unit: string;
  price: string;
  supplier: string;
  made_in: string;
  category: string;
  source: string;
};

type RemoteHit = {
  row: BarcodeRow;
  netContent?: string | null;
  saleDate?: string | null;
  registered?: boolean;
};

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const file = process.env.BARCODE_DB_PATH || "/app/data/barcode/products.db";
  try {
    mkdirSync(path.dirname(file), { recursive: true });
  } catch {
    // 只读环境时忽略，由 new Database 报错并走远端
  }
  _db = new Database(file);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS product_barcode (
      barcode  TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      brand    TEXT NOT NULL DEFAULT '',
      spec     TEXT NOT NULL DEFAULT '',
      unit     TEXT NOT NULL DEFAULT '',
      price    TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      made_in  TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      source   TEXT NOT NULL DEFAULT 'remote'
    )
  `);
  return _db;
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

function findLocal(code: string): BarcodeRow | null {
  try {
    const row = getDb()
      .prepare("SELECT * FROM product_barcode WHERE barcode = ?")
      .get(code) as BarcodeRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

function cacheRow(row: BarcodeRow): void {
  try {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO product_barcode
          (barcode, name, brand, spec, unit, price, supplier, made_in, category, source)
         VALUES (@barcode, @name, @brand, @spec, @unit, @price,
                 @supplier, @made_in, @category, @source)`,
      )
      .run(row);
  } catch {
    // 缓存失败不影响本次查询结果
  }
}

function remoteHeaders(): Record<string, string> | null {
  const key = clean(process.env.APIZERO_API_KEY);
  if (key) return { Authorization: `Bearer ${key}` };
  // 匿名通道仅用于本地开发/验证（每天约 2 次），生产必须配 Key
  if (process.env.BARCODE_ALLOW_ANON === "1") return {};
  return null;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Shike/1.0", ...headers },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 第一远端源：中国物品编码中心官方 GS1 登记（apizero barcode-gs1）。 */
async function queryGs1(code: string): Promise<RemoteHit | null> {
  const headers = remoteHeaders();
  if (!headers) return null;
  const data = await fetchJson(`${GS1_URL}?code=${encodeURIComponent(code)}`, headers);
  const d = (data?.data ?? {}) as Record<string, unknown>;
  if (!d.found || !d.name) return null;
  const row: BarcodeRow = {
    barcode: clean(d.barcode) || code,
    name: clean(d.name),
    brand: clean(d.brand),
    spec: clean(d.specification) || clean(d.net_content) || "",
    unit: "",
    price: "",
    supplier: clean(d.manufacturer),
    made_in: "",
    category: clean(d.category) || clean(d.general_name),
    source: "gs1-official",
  };
  return {
    row,
    netContent: clean(d.net_content) || null,
    saleDate: clean(d.sale_date) || null,
    registered: Boolean(d.registered),
  };
}

/** 第二远端源：电商聚合条码库（apizero barcode-lookup，覆盖电商在售 SKU）。 */
async function queryLookup(code: string): Promise<RemoteHit | null> {
  const headers = remoteHeaders();
  if (!headers) return null;
  const data = await fetchJson(
    `${LOOKUP_URL}?barcode=${encodeURIComponent(code)}`,
    headers,
  );
  const d = (data?.data ?? {}) as Record<string, unknown>;
  if (!d.found || !d.name) return null;
  const row: BarcodeRow = {
    barcode: clean(d.barcode) || code,
    name: clean(d.name),
    brand: clean(d.brand),
    spec: clean(d.spec),
    unit: "",
    price: String(d.price ?? ""),
    supplier: clean(d.manufacturer),
    made_in: "",
    category: clean(d.category),
    source: "barcode-lookup",
  };
  return { row };
}

function toProduct(row: BarcodeRow, extra?: RemoteHit) {
  return {
    barcode: row.barcode,
    name: row.name,
    brand: row.brand || null,
    spec: row.spec || null,
    unit: row.unit || null,
    price: row.price || null,
    manufacturer: row.supplier || null,
    madeIn: row.made_in || null,
    category: row.category || null,
    source: row.source,
    netContent: extra?.netContent ?? null,
    saleDate: extra?.saleDate ?? null,
    registered: extra?.registered ?? null,
  };
}

/** 扫码查商品：本地离线库 → GS1 官方 → 电商聚合 → 命中即回填本地缓存。
 *
 * GET /api/barcode/{code}
 *  code=0 命中；code=2 各通道均未收录（上层走建档流程）；code=3 未配置远端通道。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const rawCode = (await ctx.params).code || "";
  const code = rawCode.replace(/\D/g, "");
  if (!EAN_RE.test(code)) {
    return xzdJson({ code: 1, msg: "条码格式不正确", product: null }, 400);
  }

  const local = findLocal(code);
  if (local) {
    return xzdJson({ code: 0, product: toProduct(local) });
  }

  if (!remoteHeaders()) {
    return xzdJson({
      code: 3,
      msg: "本地未收录且未配置远端条码查询 Key",
      product: null,
      barcode: code,
    });
  }

  const gs1 = await queryGs1(code);
  if (gs1) {
    cacheRow(gs1.row);
    return xzdJson({ code: 0, product: toProduct(gs1.row, gs1) });
  }

  const lookup = await queryLookup(code);
  if (lookup) {
    cacheRow(lookup.row);
    return xzdJson({ code: 0, product: toProduct(lookup.row) });
  }

  return xzdJson({
    code: 2,
    msg: "本地库与远端通道均未收录",
    product: null,
    barcode: code,
  });
}

export { xzdOptions as OPTIONS };
