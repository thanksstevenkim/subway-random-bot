import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createBot, mention, text } from "@fedify/botkit";
import { SqliteKvStore, SqliteMessageQueue } from "@fedify/sqlite";
import { MentionLimiter } from "./mention-limit.ts";
import { generateRecommendation } from "./recommend.ts";

// 서명 키와 전송 대기열을 보존합니다. 공개 운영 시 영구 볼륨에 연결하세요.
const dataDir = resolve(process.env.BOT_DATA_DIR ?? ".bot-data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

// KV·메시지 큐는 독립된 SQLite 파일을 사용합니다.
const kv = new SqliteKvStore(new DatabaseSync(resolve(dataDir, "federation.sqlite")));
const queue = new SqliteMessageQueue(new DatabaseSync(resolve(dataDir, "queue.sqlite")));
// Separate persistent file: preserve existing federation/queue databases.
const limiter = new MentionLimiter(resolve(dataDir, "rate-limit.sqlite"));

const bot = createBot<void>({
  username: "subway",
  name: "써브웨이 랜덤 추천봇",
  icon: new URL("https://pick.mustard.blog/avatar.png"),
  image: new URL("https://pick.mustard.blog/header.png"),
  summary: text`🥪 써브웨이 랜덤 추천봇

오늘 뭐 먹을지 고민된다면 이 계정을 멘션해 보세요. 샌드위치·빵·치즈·야채·소스를 무작위로 추천해 드립니다.

🎲 새 조합을 원하면 15초 후 다시 불러주세요. 계정당 하루 최대 100회 이용할 수 있습니다. 전체 호출량이 많을 때는 응답이 제한될 수 있어요.

🔕 공개 멘션에는 공개 타임라인에 표시되지 않는 비표시 답글로 응답합니다.

※ 한국 써브웨이 기준의 비공식 팬 봇입니다. 실제 판매 메뉴·재료·옵션은 매장마다 다를 수 있습니다.`,
  kv,
  queue,
  // 신뢰할 수 있는 리버스 프록시 뒤에서만 true로 설정합니다.
  behindProxy: process.env.BEHIND_PROXY === "true",
});

bot.onMention = async (session, message) => {
  const actorId = message.actor.id?.href;
  if (!actorId || actorId === session.actorId.href) return;

  const messageId = message.id.href;
  const decision = limiter.claim(messageId, actorId);
  // Denied calls are silent, preventing rate-limit notices from becoming spam.
  if (decision !== "accepted") return;

  try {
    // Unlisted keeps public calls off public timelines. Never expose private calls.
    const visibility =
      message.visibility === "public" || message.visibility === "unlisted"
        ? "unlisted"
        : "direct";
    await message.reply(text`${mention(message.actor)}\n\n${generateRecommendation()}`, { visibility });
  } catch (error) {
    // Keep this claim: a failed request might already have delivered its reply.
    limiter.finish(messageId, "failed");
    console.error("Subway bot reply failed for", messageId, error);
    return;
  }
  limiter.finish(messageId, "sent");
};

export default bot;
