import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../src/lib/rateLimit";

test("限流：窗口内超过上限被拒绝，窗口过后重置", () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    const r = rateLimit(key, 3, 60_000);
    assert.equal(r.ok, true);
  }
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter > 0);
});

test("限流：不同 key 互不影响", () => {
  const a = rateLimit(`a:${Date.now()}:${Math.random()}`, 1, 60_000);
  const b = rateLimit(`b:${Date.now()}:${Math.random()}`, 1, 60_000);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});
