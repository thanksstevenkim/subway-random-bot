#!/usr/bin/env bash
# Independent, read-only snapshot of the bot databases + private R2 upload.
set -Eeuo pipefail
umask 077

APP_DIR='/opt/subway-random-bot/app'
DATA_DIR="${APP_DIR}/.bot-data"
REMOTE_DIR='mustard-backup:mustard-db-backups/subway-random-bot'
STATE_DIR="${HOME}/.local/state/subway-random-bot"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(hostname)" == 'mustard-server-02' ]] || fail 'Unexpected host'
[[ "$(id -un)" == 'ubuntu' ]] || fail 'Run as ubuntu'
[[ -d "$APP_DIR/.git" ]] || fail 'Missing bot checkout'
[[ -d "$DATA_DIR" && ! -L "$DATA_DIR" ]] || fail 'Missing or symlinked SQLite directory'
[[ "$(stat -c '%u:%g:%a' "$DATA_DIR")" == '1000:1000:700' ]] || fail 'Unexpected SQLite directory ownership/mode'
[[ "$(id -u)" == '1000' ]] || fail 'ubuntu must match SQLite data owner UID 1000'
for name in federation.sqlite queue.sqlite rate-limit.sqlite; do
  [[ -f "$DATA_DIR/$name" && ! -L "$DATA_DIR/$name" ]] || fail "Missing or symlinked SQLite file: $name"
done
for program in python3 rclone sha256sum tar flock; do
  command -v "$program" >/dev/null || fail "Missing executable: $program"
done
[[ -f "$APP_DIR/deploy/backup_sqlite.py" ]] || fail 'Missing snapshot helper'
# Only the pre-existing, bucket-scoped remote may be used.
rclone listremotes | grep -Fxq 'mustard-backup:' || fail 'Existing private R2 remote unavailable'

if [[ "${1:-}" == '--check' ]]; then
  printf 'PREFLIGHT_OK: SQLite sources/ownership, helper, rclone remote; no backup or upload performed\n'
  exit 0
fi
[[ "$#" -eq 0 ]] || fail 'Usage: bash deploy/backup.sh [--check]'

mkdir -p -m 700 "$STATE_DIR"
[[ ! -L "$STATE_DIR" && "$(stat -c '%a' "$STATE_DIR")" == '700' ]] || fail 'Unsafe backup state directory'
exec 9>"$STATE_DIR/backup.lock"
if ! flock -n 9; then
  fail 'Another bot backup is already running'
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/subway-bot-backup.XXXXXXXX")"
archive=''
cleanup() {
  rc=$?
  # Match the existing Mastodon backup policy: preserve a completed local archive
  # if upload or post-upload verification failed, for manual retry.
  if (( rc != 0 )) && [[ -n "$archive" && -f "$work/$archive" ]]; then
    mkdir -p -m 700 "$STATE_DIR/failed"
    mv -- "$work/$archive" "$STATE_DIR/failed/$archive" && \
      printf 'UPLOAD_FAILED: local archive retained under %s/failed/\n' "$STATE_DIR" >&2
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

python3 "$APP_DIR/deploy/backup_sqlite.py" "$DATA_DIR" "$work/snapshots"
(
  cd "$work/snapshots"
  sha256sum federation.sqlite queue.sqlite rate-limit.sqlite > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
archive="subway-random-bot-${stamp}-$$.tar.gz"
tar -C "$work/snapshots" -czf "$work/$archive" \
  federation.sqlite queue.sqlite rate-limit.sqlite SHA256SUMS
[[ "$(tar -tzf "$work/$archive" | wc -l)" == '4' ]] || fail 'Unexpected archive content'
local_size="$(stat -c %s "$work/$archive")"
(( local_size > 0 )) || fail 'Empty archive'

remote_file="$REMOTE_DIR/$archive"
# Never sync/delete older backups or write inside Mastodon's existing backup/ prefix.
rclone --retries 5 --low-level-retries 10 copyto --immutable "$work/$archive" "$remote_file"
metadata="$(rclone --retries 5 --low-level-retries 10 lsjson --stat "$remote_file")"
python3 -c 'import json,sys; j=json.loads(sys.argv[1]); expected=int(sys.argv[2]); sys.exit(0 if j.get("Size") == expected and not j.get("IsDir", True) else 1)' \
  "$metadata" "$local_size" || fail 'R2 object size verification failed'

# Record the last verified remote object name without printing any credentials.
printf '%s\n' "$remote_file" > "$STATE_DIR/last-success"
printf 'BACKUP_OK remote=%s bytes=%s\n' "$remote_file" "$local_size"
