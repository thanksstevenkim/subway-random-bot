# 써브웨이 랜덤 추천봇 — SQLite 백업 운영

## 보호 대상과 운영 설계

- 대상: `/opt/subway-random-bot/app/.bot-data/`의 `federation.sqlite`, `queue.sqlite`, `rate-limit.sqlite`
- 실행 서버·계정: `mustard-server-02`, `ubuntu` (UID 1000)
- 기존 비공개 R2 저장소 재사용: `mustard-backup:mustard-db-backups/subway-random-bot/`
- 매일 **05:30 JST/KST (20:30 UTC)**. 기존 Mastodon PostgreSQL 백업(04:00 JST)과 경로 및 실행 일정 분리
- Python SQLite 온라인 백업 API로 열린 DB를 일관되게 복제. `federation.sqlite`의 서명 키를 비롯해 운영 원본을 덮어쓰거나 봇을 재시작하지 않음
- 각 SQLite 사본 무결성 검사(`PRAGMA integrity_check`), `SHA256SUMS`를 함께 압축하고 R2 업로드 후 객체 크기 확인
- **DB별** 일관된 스냅샷. 세 DB가 완전히 같은 시점이라는 보장은 없음
- 자동 삭제/보존기한 아직 미설정. 데이터 보존 및 실제 복원 가능성 확인 후 별도 결정
- 업로드·크기 검증 실패 시 이미 만든 아카이브는 `~/.local/state/subway-random-bot/failed/`에 보존
- **백업 아카이브는 민감정보**: ActivityPub 서명 키·호출 기록을 포함할 수 있으므로 공개 저장소·일반 미디어 버킷으로 보내지 않음. 별도 클라이언트 측 암호화는 아직 적용되지 않음
- 성공·실패는 systemd journal에서 확인. 실패 통지 연동은 후속 작업이며 이번 설치에 포함되지 않음

## 최초 배포 (각 단계의 결과 확인 후 진행)

기존 Nginx, Docker 봇, Mastodon cron, Mastodon R2 경로는 변경하지 않습니다.

1. 운영 서버의 `ubuntu` 계정에서 코드 갱신

   ```bash
   cd /opt/subway-random-bot/app
   git pull --ff-only origin main
   ```

2. **읽기 전용 사전 점검**. 실제 백업 생성이나 R2 업로드 없음

   ```bash
   bash deploy/backup.sh --check
   ```

   `PREFLIGHT_OK` 확인. 세 DB 존재·소유권·기존 rclone remote 접근 설정을 검사합니다. `queue.sqlite`는 0바이트여도 허용합니다.

3. **1회 수동 백업과 R2 업로드** (신규 객체 생성, 기존 파일 덮어쓰기/삭제 없음)

   ```bash
   bash deploy/backup.sh
   ```

   DB마다 `SNAPSHOT_OK` 3회, 전체 `BACKUP_OK` 출력 확인. 업로드 오류가 나면 `failed/`의 아카이브를 보존하고 원인을 먼저 확인합니다.

4. **예약 실행 설치** (수동 백업 성공 후)

   ```bash
   bash deploy/install-backup-timer.sh
   ```

   별도의 `subway-bot-backup.service`와 `.timer`만 설치합니다. 기존 동명 설정과 다르면 덮어쓰지 않고 중단합니다. `Persistent=true`이므로 설치 직후 놓친 예약 시각에 대한 추가 실행이 있을 수 있습니다.

5. **읽기 전용 운영 상태 점검**

   ```bash
   systemctl list-timers --all subway-bot-backup.timer
   systemctl status subway-bot-backup.timer --no-pager
   journalctl -u subway-bot-backup.service -n 30 --no-pager
   ```

## 유지보수 및 복구 경계

- 매주 월요일: `journalctl -u subway-bot-backup.service -n 100 --no-pager`로 마지막 예약 실행 성공 여부, `failed/` 아카이브 누적 여부 확인
- 월 1회: 별도 R2 접두어의 전체 백업 크기 확인. 검증 전에는 오래된 백업을 자동 삭제하지 않음
- 분기별: 최신 R2 아카이브를 **별도 임시 위치**에 내려받아 `sha256sum -c SHA256SUMS`·SQLite 무결성 검사를 수행해 복원 가능한 데이터인지 확인. 원본에 덮어쓰지 않음
- 실제 복원이 필요하면 먼저 봇의 동시 쓰기를 정지하고 원본을 보존한 뒤, 동일한 계정/도메인과 파일 소유권을 고려한 별도 복구 절차를 수립해야 함. `federation.sqlite` 초기화 금지
- 파일 크기 확인만으로 업로드의 해시 일치 또는 복원 성공을 보장한다고 주장하지 않음
