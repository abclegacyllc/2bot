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

    cp ops/systemd/*.service ops/systemd/*.timer ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now 2bot-landing 2bot-dashboard 2bot-api
    systemctl --user enable --now 2bot-healthcheck.timer
    loginctl enable-linger abcdev   # required for boot survival

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
