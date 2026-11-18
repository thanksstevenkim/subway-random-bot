import { chmodSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Limits balance normal random-combination retries with protection from abuse.
const COOLDOWN_MS = 15 * 1_000;
const DAILY_LIMIT = 100;
const HOURLY_GLOBAL_LIMIT = 600;
const MINUTELY_GLOBAL_LIMIT = 60;
const HOUR_MS = 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const RETENTION_MS = 30 * DAY_MS;

export type MentionDecision = "accepted" | "duplicate" | "cooldown" | "daily" | "global" | "invalid";
export type ReplyResult = "sent" | "failed";

/** Stores accepted mentions in a separate, persistent SQLite file. */
export class MentionLimiter {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    const fresh = !existsSync(path);
    this.db = new DatabaseSync(path, { timeout: 2_000 });
    if (fresh) chmodSync(path, 0o600);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accepted_mentions (
        message_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        claimed_at INTEGER NOT NULL,
        result TEXT NOT NULL CHECK (result IN ('reserved', 'sent', 'failed'))
      );
      CREATE INDEX IF NOT EXISTS accepted_mentions_actor_time
        ON accepted_mentions (actor_id, claimed_at);
      CREATE INDEX IF NOT EXISTS accepted_mentions_time
        ON accepted_mentions (claimed_at);
    `);
  }

  /** Atomically reserve capacity *before* making an asynchronous reply. */
  claim(messageId: string, actorId: string, now = Date.now()): MentionDecision {
    if (!messageId || !actorId || messageId.length > 4_096 || actorId.length > 2_048 ||
        !Number.isSafeInteger(now) || now < 0) {
      return "invalid";
    }

    const dayStart = Math.floor((now + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM accepted_mentions WHERE claimed_at < ?").run(now - RETENTION_MS);
      let decision: MentionDecision = "accepted";
      if (this.db.prepare("SELECT 1 FROM accepted_mentions WHERE message_id = ?").get(messageId)) {
        decision = "duplicate";
      } else {
        const last = this.db.prepare(
          "SELECT MAX(claimed_at) AS t FROM accepted_mentions WHERE actor_id = ?",
        ).get(actorId) as { t: number | null };
        if (last.t !== null && now - last.t < COOLDOWN_MS) {
          decision = "cooldown";
        } else {
          const daily = this.db.prepare(
            "SELECT COUNT(*) AS n FROM accepted_mentions WHERE actor_id = ? AND claimed_at >= ?",
          ).get(actorId, dayStart) as { n: number };
          if (daily.n >= DAILY_LIMIT) {
            decision = "daily";
          } else {
            const hourly = this.db.prepare(
              "SELECT COUNT(*) AS n FROM accepted_mentions WHERE claimed_at > ?",
            ).get(now - HOUR_MS) as { n: number };
            if (hourly.n >= HOURLY_GLOBAL_LIMIT) {
              decision = "global";
            } else {
              const minute = this.db.prepare(
                "SELECT COUNT(*) AS n FROM accepted_mentions WHERE claimed_at > ?",
              ).get(now - MINUTE_MS) as { n: number };
              if (minute.n >= MINUTELY_GLOBAL_LIMIT) decision = "global";
            }
          }
        }
      }

      if (decision === "accepted") {
        this.db.prepare(
          "INSERT INTO accepted_mentions(message_id, actor_id, claimed_at, result) VALUES (?, ?, ?, 'reserved')",
        ).run(messageId, actorId, now);
      }
      this.db.exec("COMMIT");
      return decision;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  finish(messageId: string, result: ReplyResult): void {
    this.db.prepare(
      "UPDATE accepted_mentions SET result = ? WHERE message_id = ? AND result = 'reserved'",
    ).run(result, messageId);
  }

  close(): void {
    this.db.close();
  }
}
