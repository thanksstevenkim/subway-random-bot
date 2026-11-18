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

## 이용 방법

1. 연합우주 계정으로 `@subway@pick.mustard.blog`를 멘션합니다.
2. 봇이 한국 써브웨이 메뉴 데이터에서 샌드위치와 재료 조합을 뽑아 답글로 추천합니다.
3. 다시 뽑고 싶다면 15초 후 다른 멘션을 보내면 됩니다.

일반 공개 멘션에는 **비표시(unlisted)** 답글로 응답하여 공개 타임라인 노출을 줄입니다. 이 공개 범위는 비공개가 아닙니다. 호출량 제한 때문에 답글이 없을 수 있으며, 한 계정당 하루 최대 100회까지 허용합니다.

이 계정은 **써브웨이 공식 계정이 아닌 비공식 팬 봇**입니다. 메뉴가 일부만 검증된 상태이며 매장별 판매·품절·재료·옵션은 다를 수 있습니다.

## 멘션 남용 방지

- 사용자별 호출 간격: **15초에 1번**
- 사용자별 일일 상한: **100회** (한국·일본 시간 00:00 초기화)
- 전체 처리 상한: **슬라이딩 1분 60회**, **슬라이딩 1시간 600회**
- 공개 멘션 답글은 **비표시(unlisted)** 로 발행하여 공개 타임라인에 노출되지 않도록 함. 링크로는 누구나 볼 수 있으므로 비공개가 아님
- 팔로워 한정·다이렉트·공개 범위를 알 수 없는 멘션은 **다이렉트 답글**로 처리하여 원문의 대상 범위를 넓히지 않음
- 게시물 URI 중복 호출 및 봇 자신의 멘션 무시
- 제한에 걸린 멘션은 자동 답글을 남기지 않음 (알림 스팸 방지)
- 허용된 호출은 `rate-limit.sqlite`에 기록하며 재시작 후에도 중복 응답 차단. 보관 기간 30일
- 답글 전송 오류가 나도 중복 발송을 피하도록 기록 유지. 실패는 로그로 점검

이 제한은 봇의 **답글 생성량**을 통제합니다. HTTP 요청 폭주나 인프라 수준의 DDoS 방어를 대체하지 않습니다.

## 공식 재료 메뉴 일일 자동 점검

- GitHub Actions: `.github/workflows/menu-ingredients-daily.yml`
- 일정: 매일 **09:17 KST/JST** (UTC 00:17), 필요하면 `workflow_dispatch`로 수동 실행
- 한국 써브웨이 [공식 재료소개](https://devm.subway.co.kr/more/freshInfo)를 확인하고 `data/menu.json`의 **빵·야채·치즈·소스·추가 토핑**을 비교
- 신규 또는 미노출 항목이 발견되면 `data/menu.json` 수정안과 `reports/menu-ingredient-review.md` 설명을 담은 **검토용 PR** 생성·갱신
- 공식 페이지 오류·대규모 목록 변화·추출 구조 변화가 있으면 **안전 중단**. 오류를 단종으로 취급하지 않음
- PR은 사람이 근거를 확인한 후 병합해야 하며, 이 작업은 **운영 서버 배포를 자동으로 수행하지 않음**

샌드위치·사이드·음료는 아직 **자동 변경 제안 범위 밖**입니다. 공식 [샌드위치](https://www.subway.co.kr/menuList/sandwich) 및 [사이드·음료](https://www.subway.co.kr/menuList/sidedrink) 목록이 외부에서 HTTP 403을 반환하는 사례가 있어, 동일 일일 워크플로에서 **읽기 전용 접근성 점검**만 추가했습니다. 이 점검은 HTTP 상태 및 HTML 헤딩 개수만 남기며, 메뉴 단종·출시를 판단하거나 파일을 수정하지 않습니다. 신뢰할 수 있는 메뉴 추출이 가능해지면 후보 검토 기능을 후속으로 연결합니다. 메뉴 데이터는 여전히 `partially-verified`입니다.

로컬 파서 검증: `python3 -m unittest discover -s tests -v`

GitHub Actions가 PR을 만들려면 저장소 설정에서 **Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**가 허용되어 있어야 합니다. 설정에 따라 사용자의 추가 조정이 필요할 수 있습니다.

## 다음 단계

1. 고정 봇 계정에서 멘션·답글 및 제한 동작 확인
2. 사용방법 프로필 소개 운영 반영 확인
3. 메뉴 변경 감지 및 업데이트 자동화

공식 문서: https://botkit.fedify.dev/deploy/store-mq
