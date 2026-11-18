# 써브웨이 랜덤 추천봇

BotKit by Fedify 기반의 독립 ActivityPub 봇입니다. 기존에 멘션·자동 답글 연합 테스트를 성공했으며, 현재 `@subway@pick.mustard.blog`에서 독립 운영 중입니다.

> 주의: `data/menu.json`은 `partially-verified` 데이터입니다. 전국 매장 판매 여부와 제품별 커스터마이징 제한은 아직 완전히 검증되지 않았습니다. 써브웨이와 무관한 비공식 팬 프로젝트입니다.

## 로컬 개발

Node.js가 설치된 환경에서:

```bash
npm install
npm run check
npm run test:limits
npm run demo
```

`npm run demo`는 랜덤 메뉴만 터미널에 출력하며, ActivityPub 계정을 생성하거나 외부에 게시하지 않습니다.

## BotKit 영구 저장소

`src/bot.ts`는 `@fedify/sqlite`의 `SqliteKvStore`와 `SqliteMessageQueue`를 사용합니다. BotKit의 기본 `KvRepository`가 KV 저장소에 게시물과 팔로우 정보를 함께 보관합니다.

- `.bot-data/federation.sqlite`: 봇의 서명 키, 연합 정보, 게시물 및 팔로우 데이터
- `.bot-data/queue.sqlite`: 영구 메시지 큐
- `.bot-data/rate-limit.sqlite`: 멘션 중복·호출 제한 기록 (독립 SQLite 파일)
- `BOT_DATA_DIR`: 두 파일을 저장할 디렉터리 (기본값 `./.bot-data`)
- `.bot-data/`는 `.gitignore`에 포함되며, **데이터베이스 파일을 GitHub에 올리지 마세요.**

로컬 BotKit 서버 실행 명령은 `npm run dev`입니다. 임시 HTTPS 터널이나 다른 연합 계정을 만들지 마세요. 운영 중인 고정 계정과 별개로 로컬 서버만 실행해도 새 연합 계정이 인터넷에 생성되는 것은 아닙니다.

**운영 시 주의사항:** 동일한 봇 계정을 유지하려면 고정 도메인·username·`federation.sqlite`를 보존해야 합니다. 컨테이너에 배포할 때는 `BOT_DATA_DIR`을 영구 볼륨으로 마운트하고 데이터베이스 파일을 백업하세요. SQLite는 단일 인스턴스 운영용이며, 여러 프로세스가 동시에 같은 큐를 소비하는 구조로 배포하지 않습니다.

이번 코드 수정은 이전 임시 터널 계정의 키를 복구하거나 이전하지 않습니다.

## 파일

- `data/menu.json`: 한국 메뉴 1차 정비 데이터
- `src/recommend.ts`: 랜덤 메뉴 추천
- `src/demo.ts`: 게시하지 않는 로컬 실행
- `src/bot.ts`: BotKit 멘션 답글 + SQLite 영구 저장

## 멘션 남용 방지

- 사용자별 호출 간격: **5분에 1번**
- 사용자별 일일 상한: **20회** (한국·일본 시간 00:00 초기화)
- 전체 처리 상한: **슬라이딩 1분 10회**, **슬라이딩 1시간 60회**
- 게시물 URI 중복 호출 및 봇 자신의 멘션 무시
- 제한에 걸린 멘션은 자동 답글을 남기지 않음 (알림 스팸 방지)
- 허용된 호출은 `rate-limit.sqlite`에 기록하며 재시작 후에도 중복 응답 차단. 보관 기간 30일
- 답글 전송 오류가 나도 중복 발송을 피하도록 기록 유지. 실패는 로그로 점검

이 제한은 봇의 **답글 생성량**을 통제합니다. HTTP 요청 폭주나 인프라 수준의 DDoS 방어를 대체하지 않습니다.

## 다음 단계

1. 고정 봇 계정에서 멘션·답글 및 제한 동작 확인
2. 사용방법을 프로필 또는 안내 글로 게시
3. 메뉴 변경 감지 및 업데이트 자동화

공식 문서: https://botkit.fedify.dev/deploy/store-mq
