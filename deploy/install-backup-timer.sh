#!/usr/bin/env bash
# Run after one manually verified backup; does not restart the bot or Mastodon.
set -Eeuo pipefail
APP_DIR='/opt/subway-random-bot/app'
[[ "$(hostname)" == 'mustard-server-02' && "$(id -un)" == 'ubuntu' ]] || { echo 'Wrong host or user' >&2; exit 1; }
[[ -f "$HOME/.local/state/subway-random-bot/last-success" ]] || { echo 'Run one successful manual backup before enabling the timer' >&2; exit 1; }
sudo -v
for kind in service timer; do
  file="$APP_DIR/deploy/subway-bot-backup.$kind"
  [[ -f "$file" ]] || { echo "Missing unit: $file" >&2; exit 1; }
  # Never silently override an existing unit that might have been customized.
  if sudo test -e "/etc/systemd/system/subway-bot-backup.$kind"; then
    sudo cmp -s "$file" "/etc/systemd/system/subway-bot-backup.$kind" || {
      echo "Existing $kind differs; inspect before making changes" >&2; exit 1;
    }
  fi
done
sudo install -o root -g root -m 0644 "$APP_DIR/deploy/subway-bot-backup.service" /etc/systemd/system/subway-bot-backup.service
sudo install -o root -g root -m 0644 "$APP_DIR/deploy/subway-bot-backup.timer" /etc/systemd/system/subway-bot-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now subway-bot-backup.timer
sudo systemctl list-timers --all subway-bot-backup.timer
