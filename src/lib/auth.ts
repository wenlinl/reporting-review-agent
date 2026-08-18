import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const secret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me-before-production",
  );

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.sub!,
      name: (payload.name as string) || "",
      email: (payload.email as string) || "",
      role: (payload.role as string) || "user",
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get("session")?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser() {
  const user = await getSession();
  if (!user) redirect("/shike-h5.html");
  return user;
}
