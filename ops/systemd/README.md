# 2bot process supervision

## Why this exists

2bot's three Node servers ran as bare `nohup` background processes started by
hand via `make start`. Nothing supervised them and nothing started them at
boot. On **2026-09-08 10:05** the box rebooted:

| | came back by itself? | why |
|---|---|---|
| 2bot Postgres + Redis | ✅ | Docker `restart=unless-stopped` |
| 4truck api/bot/queue | ✅ | systemd units, `enabled`, `Restart=always` |
| **2bot landing/dashboard/api** | ❌ | **no unit, no cron, nothing** |

They stayed down until a human ran `make start` roughly 47 hours later. That
is the whole story behind "2bot.org goes down intermittently": the site does
not recover from *anything* — a crash, a reboot, an accidental kill — without
someone noticing and logging in.

## What these units change

`Restart=always` + `RestartSec=5` means a dead process is back in ~5s.
`StartLimitIntervalSec=0` (in `[Unit]`, where systemd actually reads it —
putting it in `[Service]` silently does nothing) means systemd never gives up;
the default budget of 5 starts per 10s would otherwise leave a crash-looping
service dead, which is the failure we are fixing.

These are **user** units, installed under `~/.config/systemd/user/`. They
survive reboot because `loginctl enable-linger abcdev` is set. That was chosen
because it needs no root; if you later want system units, move them to
`/etc/systemd/system/`, add `User=abcdev`, and drop the `--user` flags.

## Resource caps

The box is shared with 4truck (12 cores, 47 GiB). 4truck uses ~1.8 GiB and is
uncapped. Each 2bot service is capped so the three together can never exceed
~3.5 GiB and 6 of 12 cores — roughly 15-20x current usage, so the caps protect
4truck without ever throttling normal 2bot traffic.

## Logs

stdout/stderr go to the journal, not `/tmp`. The old setup used
`nohup ... > /tmp/2bot-logs/x.log` — a `>` truncate, so **every restart
destroyed the previous crash evidence**, and `/tmp` does not survive a reboot.
That is why the original outage could never be diagnosed after the fact.

    journalctl --user -u 2bot-api -f
    journalctl --user -u 2bot-healthcheck --since today

## Install

    make install-services           # copies ops/systemd/* to ~/.config/systemd/user, reloads, enables
    loginctl enable-linger abcdev   # required for boot survival (install-services warns if off)

`make start` runs `install-services` first, so editing a unit here and
deploying is enough; the installed copy is never edited by hand.

## Deploying: `make start` / `make restart`

Both do the same thing, and neither kills anything by port. Killing a port
was the pre-systemd habit, and with `Restart=always` systemd just brings the
process back 5s later, so the Makefile ended up fighting the units.

The frontend has **two build slots**, `.next` and `.next-b`; `.next-active`
names the live one and `scripts/next-start.sh` serves it. A deploy:

1. builds into the **idle** slot while the live one keeps serving (~4 min);
   if the build fails, production is untouched;
2. flips `.next-active` to the new slot;
3. `systemctl --user restart` the three services, then waits for all three
   to answer 200 (the downtime is this restart: a few seconds).

A slot cannot just be renamed after building. Next bakes the dist dir into
every page module (`distDir:".next-b"`), so a build only runs from the
directory it was built into. That's why this uses a pointer, not a rename.

| | |
|---|---|
| `make restart-quick` | restart without rebuilding (API code or `.env` changes; the API runs from source via tsx) |
| `make rollback` | point the frontend back at the previous slot and restart it; the API is untouched, so roll it back with git |
| `make stop-prod` | stop the services **and the health timer**; otherwise the timer restarts them two minutes later |
| `make status` / `make health` / `make logs-prod` | read-only |

## Backups

`2bot-backup.timer` runs `scripts/deploy/backup.sh` nightly at 02:45:
plain-SQL `pg_dump` of `2bot_production`, gzipped, to `backups/`, kept 14
days. A dump only counts if it ends with pg_dump's completion marker.
Hand-named snapshots (`2bot_backup_pre_*`) are never pruned. `make backup`
runs it on demand. The backups sit **on the same disk**, so they don't
survive losing the box; off-site copies are still to do.

    journalctl --user -u 2bot-backup --since yesterday

## Health gate

`scripts/healthcheck.sh` runs every 60s and probes **the public URL through
Cloudflare**, not localhost — localhost being healthy tells you nothing about
what a visitor gets, which is exactly how the 2026-09-08 outage looked from
the box. It requires **two consecutive** non-200s before restarting, so a
single blip never triggers one.

## Known gap

`admin.2bot.org` proxies to `127.0.0.1:3007`, which nginx's own comment calls a
"Next.js **dev** instance". `make start` never starts 3007, so admin 502s by
design. Either run `make dev`, or give admin a production server and repoint
`upstream 2bot_admin`.
