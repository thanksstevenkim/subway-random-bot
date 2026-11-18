# Standalone Docker deployment — pick.mustard.blog

Target account (not yet created): `@subway@pick.mustard.blog`.

The fixed Cloudflare DNS and Nginx HTTPS virtual host were configured on `mustard-server-02` (2026-11-18). This repository does **not** manage DNS or Nginx. Never create another temporary federated account or modify the existing Mastodon Compose project.

## Planned layout

- Source: `/opt/subway-random-bot/app`
- Persistent SQLite bind mount: `/opt/subway-random-bot/app/.bot-data`
- Host listener: `127.0.0.1:18080` -> container `8000`
- Host Nginx (to be configured separately): HTTPS `pick.mustard.blog` -> `127.0.0.1:18080`

Docker runs the bot as the non-root `node` user (UID/GID 1000 in the official Node image). The host data directory must be writable by that user and must never be committed to Git. The `.dockerignore` also excludes the SQLite files from image builds.

## Phase A — initial preparation (already completed on 2026-11-18)

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

The initial source clone, Compose validation, SQLite directory preparation, Docker image build, DNS and HTTPS configuration were completed separately. Starting the container makes the fixed public bot reachable.

## Phase B — build and start the fixed bot

The deployment script `deploy/deploy.sh` checks the exact host/user/path/remote, clean `main` branch and SQLite directory ownership, fast-forwards `main`, validates Compose, builds the image, starts **only** the `bot` service, then checks WebFinger through the local Nginx HTTPS origin. It never deletes SQLite files and does not modify Nginx, Cloudflare, or Mastodon containers.

For the **first** use only, download the script by updating the existing server checkout:

```bash
cd /opt/subway-random-bot/app
git pull --ff-only origin main
bash deploy/deploy.sh
```

For **subsequent** deployments, one command is enough:

```bash
bash /opt/subway-random-bot/app/deploy/deploy.sh
```

If the WebFinger check fails, the script prints the bot logs and exits nonzero; it intentionally does not perform an automatic rollback or remove any persistent data. HTTP 200 confirms the origin endpoint, **not** end-to-end federation. The first actual mention/reply test is a separate operation on the **same** `@subway@pick.mustard.blog` account.

- Configure `pick.mustard.blog` in Cloudflare and its own Nginx server block, without changing the Mastodon vhost.
- The proxy must set a trusted fixed Host and HTTPS forwarding headers; reject untrusted client-supplied forwarding values.
- Run a controlled Docker build and start only the dedicated Compose project.
- Confirm that the database persists across container replacement before making the first public federated mention.
- Back up the `federation.sqlite` and `queue.sqlite` databases consistently; do not copy a live SQLite database without using the SQLite backup API or coordinating a clean stop.
- Review the reported npm audit warnings before public operation.

## Isolation

This Compose file does not connect to Mastodon's Docker networks or databases, does not publish an Internet-facing port, and does not modify existing Nginx configuration. The resource limits are initial safeguards and not measured operating requirements.

Official references: https://botkit.fedify.dev/deploy/docker and https://srvx.h3.dev/guide/cli
