# Standalone Docker deployment — preparation only

Target account (not yet created): `@subway@pick.mustard.blog`.

This repository intentionally does **not** configure DNS, Nginx, certificates, or start a container. Do not create another temporary federated account. Do not modify the existing Mastodon Compose project.

## Planned layout

- Source: `/opt/subway-random-bot/app`
- Persistent SQLite bind mount: `/opt/subway-random-bot/app/.bot-data`
- Host listener: `127.0.0.1:18080` -> container `8000`
- Host Nginx (to be configured separately): HTTPS `pick.mustard.blog` -> `127.0.0.1:18080`

Docker runs the bot as the non-root `node` user (UID/GID 1000 in the official Node image). The host data directory must be writable by that user and must never be committed to Git. The `.dockerignore` also excludes the SQLite files from image builds.

## Phase A — prepare files and validate Compose (does not start the bot)

After merging the PR and on `mustard-server-02` as `ubuntu`:

```bash
test "$(hostname)" = "mustard-server-02"
test "$(id -un)" = "ubuntu"

sudo install -d -o ubuntu -g ubuntu -m 0755 /opt/subway-random-bot
git clone https://github.com/thanksstevenkim/subway-random-bot.git /opt/subway-random-bot/app

sudo install -d -o 1000 -g 1000 -m 0700 /opt/subway-random-bot/app/.bot-data
cd /opt/subway-random-bot/app
docker compose config --quiet
```

Do not run `docker compose up` yet. The HTTPS origin and proxy behavior must be decided first, and starting the bot could expose a new federated identity if indexed.

## Phase B — only after the fixed HTTPS domain is configured

- Configure `pick.mustard.blog` in Cloudflare and its own Nginx server block, without changing the Mastodon vhost.
- The proxy must set a trusted fixed Host and HTTPS forwarding headers; reject untrusted client-supplied forwarding values.
- Run a controlled Docker build and start only the dedicated Compose project.
- Confirm that the database persists across container replacement before making the first public federated mention.
- Back up the `federation.sqlite` and `queue.sqlite` databases consistently; do not copy a live SQLite database without using the SQLite backup API or coordinating a clean stop.
- Review the reported npm audit warnings before public operation.

## Isolation

This Compose file does not connect to Mastodon's Docker networks or databases, does not publish an Internet-facing port, and does not modify existing Nginx configuration. The resource limits are initial safeguards and not measured operating requirements.

Official references: https://botkit.fedify.dev/deploy/docker and https://srvx.h3.dev/guide/cli
