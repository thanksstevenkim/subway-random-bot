import { readFileSync } from "node:fs";

type Menu = {
  status: string;
  sandwiches: string[];
  breads: string[];
  cheeses: string[];
  vegetables: string[];
  sauces: string[];
  extras: string[];
  sides: string[];
  drinks: string[];
};

const menu = JSON.parse(
  readFileSync(new URL("../data/menu.json", import.meta.url), "utf8"),
) as Menu;

function pick(items: string[]): string {
  if (items.length === 0) throw new Error("메뉴 데이터에 빈 목록이 있습니다.");
  return items[Math.floor(Math.random() * items.length)]!;
}

function uniquePicks(items: string[], count: number): string[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function generateRecommendation(): string {
  const sandwich = pick(menu.sandwiches);
  const bread = pick(menu.breads);
  const cheese = pick(menu.cheeses);
  const toasted = Math.random() < 0.7;
  const chosenVegetables = menu.vegetables.filter(() => Math.random() < 0.65);
  if (chosenVegetables.length === 0) chosenVegetables.push(pick(menu.vegetables));
  const sauces = uniquePicks(menu.sauces, Math.random() < 0.3 ? 2 : 1);
  const extra = menu.extras.length > 0 && Math.random() < 0.15 ? pick(menu.extras) : null;
  const side = menu.sides.length > 0 && Math.random() < 0.25 ? pick(menu.sides) : null;
  const drink = menu.drinks.length > 0 && Math.random() < 0.35 ? pick(menu.drinks) : null;

  return [
    "🥪 오늘의 써브웨이 랜덤 조합!",
    `🥖 샌드위치: ${sandwich} (15cm)`,
    `🍞 빵: ${bread} (${toasted ? "토스팅" : "토스팅 안 함"})`,
    `🧀 치즈: ${cheese}`,
    `🥬 야채: ${chosenVegetables.join(", ")}`,
    `🥫 소스: ${sauces.join(" + ")}`,
    ...(extra ? [`➕ 추가 토핑: ${extra} (추가 요금 가능)`] : []),
    ...(side ? [`🍪 사이드: ${side}`] : []),
    ...(drink ? [`🥤 음료: ${drink}`] : []),
    "🎲 다시 호출하면 새 조합을 추천해요!",
  ].join("\n");
}
