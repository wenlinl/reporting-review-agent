import { NextResponse } from "next/server";

/** 食刻统一 JSON 响应（同源访问，不再放开 CORS）。 */
export function xzdJson(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function xzdOptions() {
  return new NextResponse(null, { status: 204 });
}
