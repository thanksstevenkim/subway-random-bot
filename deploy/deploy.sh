#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/subway-random-bot/app"
DOMAIN="pick.mustard.blog"
WEBFINGER_URL="https://${DOMAIN}/.well-known/webfinger?resource=acct%3Asubway%40pick.mustard.blog"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$(hostname)" == "mustard-server-02" ]] || fail "Unexpected host"
[[ "$(id -un)" == "ubuntu" ]] || fail "Run as ubuntu"
[[ -d "$APP_DIR/.git" ]] || fail "Missing project directory"
cd "$APP_DIR"

[[ "$(git branch --show-current)" == "main" ]] || fail "Expected main branch"
[[ "$(git remote get-url origin)" == "https://github.com/thanksstevenkim/subway-random-bot.git" ]] || fail "Unexpected origin"
[[ -z "$(git status --porcelain)" ]] || fail "Uncommitted changes: preserve them before deploying"
[[ -d .bot-data && ! -L .bot-data ]] || fail "Persistent SQLite directory missing or symlinked"
[[ "$(stat -c '%u:%g:%a' .bot-data)" == "1000:1000:700" ]] || fail "SQLite directory must be owned by UID/GID 1000 and mode 700"
[[ -f /etc/nginx/conf.d/pick.mustard.blog.conf ]] || fail "Fixed Nginx host config is missing"

printf '\n=== 1. Update main (fast-forward only) ===\n'
git pull --ff-only origin main

printf '\n=== 2. Validate bot Compose configuration ===\n'
docker compose config --quiet

printf '\n=== 3. Build bot image ===\n'
docker compose build bot

printf '\n=== 4. Start/update only the bot container ===\n'
docker compose up -d --no-build --no-deps bot

printf '\n=== 5. Container state ===\n'
docker compose ps bot

printf '\n=== 6. Fixed-domain WebFinger HTTP check (local origin) ===\n'
status="000"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  status="$(curl -ksS --connect-timeout 2 --max-time 5 \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    -o /dev/null -w '%{http_code}' "$WEBFINGER_URL" || true)"
  [[ "$status" == "200" ]] && break
  sleep 2
done

if [[ "$status" != "200" ]]; then
  printf 'WebFinger HTTP check failed: %s\n' "$status" >&2
  docker compose logs --tail=60 bot >&2 || true
  fail "Bot started but HTTP readiness is not confirmed; no automatic rollback or data deletion"
fi

printf 'WebFinger HTTP %s via local Nginx (not a federation delivery test)\n' "$status"
printf '\n=== 7. Recent bot logs ===\n'
docker compose logs --tail=20 bot
printf '\n=== BOT DEPLOYMENT COMPLETE ===\n'
