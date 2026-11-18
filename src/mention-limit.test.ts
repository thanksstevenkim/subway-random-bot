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

test("duplicate message IDs and same-actor 15-second cooldown are rejected", () => withLimiter((limiter) => {
  assert.equal(limiter.claim("msg-1", "actor-1", base), "accepted");
  assert.equal(limiter.claim("msg-1", "actor-1", base + 15_000), "duplicate");
  assert.equal(limiter.claim("msg-2", "actor-1", base + 14_000), "cooldown");
  assert.equal(limiter.claim("msg-2", "actor-1", base + 15_000), "accepted");
}));

test("daily limit resets at midnight KST/JST", () => withLimiter((limiter) => {
  for (let i = 0; i < 100; i++) {
    assert.equal(limiter.claim(`msg-${i}`, "actor", base + i * 15_000), "accepted");
  }
  assert.equal(limiter.claim("msg-100", "actor", base + 100 * 15_000), "daily");
  const nextDay = Date.parse("2026-11-18T15:00:00Z");
  assert.equal(limiter.claim("msg-new-day", "actor", nextDay), "accepted");
}));

test("global burst limit permits sixty accepted claims per sliding minute", () => withLimiter((limiter) => {
  for (let i = 0; i < 60; i++) {
    assert.equal(limiter.claim(`burst-${i}`, `actor-${i}`, base), "accepted");
  }
  assert.equal(limiter.claim("burst-60", "actor-60", base), "global");
  assert.equal(limiter.claim("burst-61", "actor-61", base + minute), "accepted");
}));

test("global limit permits at most 600 claims in a sliding hour", () => withLimiter((limiter) => {
  for (let i = 0; i < 600; i++) {
    assert.equal(limiter.claim(`msg-${i}`, `actor-${i}`, base + Math.floor(i / 60) * minute), "accepted");
  }
  assert.equal(limiter.claim("msg-600", "actor-600", base + 10 * minute), "global");
  assert.equal(limiter.claim("msg-601", "actor-601", base + 60 * minute), "accepted");
}));

test("record survives restart; failed replies remain deduplicated", () => withLimiter((limiter, file) => {
  assert.equal(limiter.claim("msg-1", "actor", base), "accepted");
  limiter.finish("msg-1", "failed");
  const reopened = new MentionLimiter(file);
  try {
    assert.equal(reopened.claim("msg-1", "actor", base + 15_000), "duplicate");
    assert.equal(reopened.claim("msg-2", "actor", base + 10_000), "cooldown");
  } finally { reopened.close(); }
}));

test("invalid IDs do not consume capacity", () => withLimiter((limiter) => {
  assert.equal(limiter.claim("", "actor", base), "invalid");
  assert.equal(limiter.claim("msg", "", base), "invalid");
  assert.equal(limiter.claim("msg", "actor", base), "accepted");
}));
