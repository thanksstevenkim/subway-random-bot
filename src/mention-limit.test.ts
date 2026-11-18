import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MentionLimiter } from "./mention-limit.ts";

function withLimiter(fn: (limiter: MentionLimiter, file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "subway-mention-limit-"));
  const file = join(dir, "rate-limit.sqlite");
  const limiter = new MentionLimiter(file);
  try { fn(limiter, file); } finally {
    limiter.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const base = Date.parse("2026-11-18T00:00:00Z");
const minute = 60_000;

test("duplicate message IDs and same-actor cooldown are rejected", () => withLimiter((limiter) => {
  assert.equal(limiter.claim("msg-1", "actor-1", base), "accepted");
  assert.equal(limiter.claim("msg-1", "actor-1", base + 5 * minute), "duplicate");
  assert.equal(limiter.claim("msg-2", "actor-1", base + 4 * minute), "cooldown");
  assert.equal(limiter.claim("msg-2", "actor-1", base + 5 * minute), "accepted");
}));

test("daily limit resets at midnight KST/JST", () => withLimiter((limiter) => {
  for (let i = 0; i < 20; i++) {
    assert.equal(limiter.claim(`msg-${i}`, "actor", base + i * 5 * minute), "accepted");
  }
  assert.equal(limiter.claim("msg-20", "actor", base + 20 * 5 * minute), "daily");
  const nextDay = Date.parse("2026-11-18T15:00:00Z");
  assert.equal(limiter.claim("msg-new-day", "actor", nextDay), "accepted");
}));

test("global burst limit permits ten accepted claims per sliding minute", () => withLimiter((limiter) => {
  for (let i = 0; i < 10; i++) {
    assert.equal(limiter.claim(`burst-${i}`, `actor-${i}`, base), "accepted");
  }
  assert.equal(limiter.claim("burst-10", "actor-10", base), "global");
  assert.equal(limiter.claim("burst-11", "actor-11", base + minute), "accepted");
}));

test("global limit permits at most 60 claims in a sliding hour", () => withLimiter((limiter) => {
  for (let i = 0; i < 60; i++) {
    assert.equal(limiter.claim(`msg-${i}`, `actor-${i}`, base + Math.floor(i / 10) * minute), "accepted");
  }
  assert.equal(limiter.claim("msg-60", "actor-60", base + 6 * minute), "global");
  assert.equal(limiter.claim("msg-61", "actor-61", base + 60 * minute), "accepted");
}));

test("record survives restart; failed replies remain deduplicated", () => withLimiter((limiter, file) => {
  assert.equal(limiter.claim("msg-1", "actor", base), "accepted");
  limiter.finish("msg-1", "failed");
  const reopened = new MentionLimiter(file);
  try {
    assert.equal(reopened.claim("msg-1", "actor", base + 5 * minute), "duplicate");
    assert.equal(reopened.claim("msg-2", "actor", base + minute), "cooldown");
  } finally { reopened.close(); }
}));

test("invalid IDs do not consume capacity", () => withLimiter((limiter) => {
  assert.equal(limiter.claim("", "actor", base), "invalid");
  assert.equal(limiter.claim("msg", "", base), "invalid");
  assert.equal(limiter.claim("msg", "actor", base), "accepted");
}));
