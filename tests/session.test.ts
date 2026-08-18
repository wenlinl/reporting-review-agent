import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode("test-secret");

test("会话 JWT：签发后可验证并取回用户信息", async () => {
  const token = await new SignJWT({ name: "小明", email: "x@shike.test", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("u_1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  const { payload } = await jwtVerify(token, secret);
  assert.equal(payload.sub, "u_1");
  assert.equal(payload.name, "小明");
  assert.equal(payload.role, "user");
});

test("会话 JWT：篡改后校验失败", async () => {
  const token = await new SignJWT({ name: "x", email: "x@shike.test", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("u_1")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  const forged = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
  await assert.rejects(() => jwtVerify(forged, secret));
});
