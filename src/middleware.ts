import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// 无需登录即可访问的路径（设备接口由路由内做设备 Token 校验）
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/register",
  "/api/health",
  "/api/scan",
  "/api/device",
];

const secret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me-before-production",
  );

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("session")?.value;
  if (!token) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
