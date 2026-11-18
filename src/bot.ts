import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createBot, mention, text } from "@fedify/botkit";
import { SqliteKvStore, SqliteMessageQueue } from "@fedify/sqlite";
import { generateRecommendation } from "./recommend.ts";

// 서명 키와 전송 대기열을 보존합니다. 공개 운영 시 영구 볼륨에 연결하세요.
const dataDir = resolve(process.env.BOT_DATA_DIR ?? ".bot-data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

// KV·메시지 큐는 독립된 SQLite 파일을 사용합니다.
const kv = new SqliteKvStore(new DatabaseSync(resolve(dataDir, "federation.sqlite")));
const queue = new SqliteMessageQueue(new DatabaseSync(resolve(dataDir, "queue.sqlite")));

const bot = createBot<void>({
  username: "subway",
  name: "써브웨이 랜덤 추천봇",
  summary: text`한국 써브웨이 조합을 랜덤으로 제안하는 비공식 팬 봇입니다.`,
  kv,
  queue,
  // 신뢰할 수 있는 리버스 프록시 뒤에서만 true로 설정합니다.
  behindProxy: process.env.BEHIND_PROXY === "true",
});

bot.onMention = async (_session, message) => {
  await message.reply(
    text`${mention(message.actor)}\n${generateRecommendation()}`,
  );
};

export default bot;
