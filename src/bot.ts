import {
  createBot,
  InProcessMessageQueue,
  MemoryKvStore,
  mention,
  text,
} from "@fedify/botkit";
import { generateRecommendation } from "./recommend.ts";

// 개발용 예시: 메모리 저장소/큐는 공개 운영에 사용하지 않습니다.
const bot = createBot<void>({
  username: "subway",
  name: "써브웨이 랜덤 추천봇",
  summary: text`한국 써브웨이 조합을 랜덤으로 제안하는 비공식 팬 봇입니다.`,
  kv: new MemoryKvStore(),
  queue: new InProcessMessageQueue(),
  // 신뢰할 수 있는 리버스 프록시 뒤에서만 true로 설정합니다.
  behindProxy: process.env.BEHIND_PROXY === "true",
});

bot.onMention = async (_session, message) => {
  await message.reply(
    text`${mention(message.actor)}\n${generateRecommendation()}`,
  );
};

export default bot;
