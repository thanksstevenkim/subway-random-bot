# 써브웨이 랜덤 추천봇 (개발용 시작 프로젝트)

BotKit by Fedify로 만드는 독립 ActivityPub 봇의 **로컬 MVP**입니다.

> 주의: `data/menu.json`은 임시 예시 데이터입니다. 한국 매장 기준 최신 판매 여부나 제품별 선택 가능 옵션은 아직 검증되지 않았으므로 그대로 공개 배포하지 마세요.

## 준비 및 실행

Node.js와 npm이 설치된 컴퓨터에서 프로젝트 폴더로 이동한 뒤:

```bash
npm install @fedify/botkit srvx
npm install -D tsx typescript @types/node
npm run demo
```

`npm run demo`는 실제 연합우주에 게시하지 않고 랜덤 추천 1건을 터미널에 출력합니다.

BotKit을 로컬 웹 서버로 실행하려면:

```bash
npm run dev
```

기본 개발용 주소는 `http://localhost:8000/`입니다. 로컬 웹 서버만으로는 외부 Mastodon 서버의 멘션을 받을 수 없습니다. 공개 테스트를 위해서는 신뢰할 수 있는 HTTPS 터널 또는 서버 배포가 필요합니다.

## 파일

- `data/menu.json`: 개발용 메뉴 목록. 실제 판매 여부와 호환성 검증 필요
- `src/recommend.ts`: 중복 없는 소스 선택, 야채 선택, 사이드/음료 확률 처리
- `src/demo.ts`: 터미널에서 추천 출력
- `src/bot.ts`: BotKit 멘션 이벤트 처리

## 다음 단계

1. 한국 써브웨이 공식 메뉴/재료를 확인하여 JSON을 교체하고 제품별 주문 가능 옵션 반영
2. 추천 조합 제한 규칙, 출력 문구 검토
3. 영구 키-값 저장소 및 메시지 큐를 구성한 뒤 테스트 도메인에서 연합 테스트
4. 중복 응답/속도 제한 및 정기 메뉴 갱신 GitHub Actions 추가

참고: https://botkit.fedify.dev/start
