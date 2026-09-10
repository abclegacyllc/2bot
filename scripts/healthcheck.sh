#!/usr/bin/env bash
#
# 2bot public health gate.
#
# Probes the PUBLIC path (through Cloudflare), not localhost, on purpose:
# localhost being healthy tells us nothing about what a visitor gets.  The
# 2026-09-08 outage looked exactly like this -- Postgres and Redis were fine,
# the box was fine, and the site was still returning 502 to the world.
#
# Requires TWO consecutive non-200s before acting, so a single blip (a
# Cloudflare hiccup, a 20s timeout under load) never triggers a restart.
#
# Run by 2bot-healthcheck.timer every 60s.  Output goes to the journal:
#     journalctl --user -u 2bot-healthcheck -f
set -uo pipefail

URL="${URL:-https://www.2bot.org/}"
STATE="${STATE:-$HOME/.local/state/2bot/healthcheck.fails}"
THRESHOLD=2
SERVICES=(2bot-landing 2bot-dashboard 2bot-api)

mkdir -p "$(dirname "$STATE")"
fails=$(cat "$STATE" 2>/dev/null || echo 0)
[[ "$fails" =~ ^[0-9]+$ ]] || fails=0

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$URL" 2>/dev/null || echo 000)

if [[ "$code" == "200" ]]; then
    if (( fails > 0 )); then
        echo "recovered: $URL is 200 again after $fails consecutive failure(s)"
    fi
    echo 0 > "$STATE"
    exit 0
fi

fails=$(( fails + 1 ))
echo "$fails" > "$STATE"
echo "UNHEALTHY: $URL returned HTTP $code (consecutive failure $fails/$THRESHOLD)"

if (( fails < THRESHOLD )); then
    echo "holding: one more consecutive failure will trigger a restart"
    exit 0
fi

# Which upstream is actually down?  Logged before restarting so the journal
# still carries the evidence -- the old setup truncated its logs on every
# start, which is why the original crash could never be diagnosed.
for p in 3000 3001 3002; do
    lc=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$p/" 2>/dev/null || echo 000)
    echo "  upstream 127.0.0.1:$p -> HTTP $lc"
done

echo "RESTARTING 2bot services after $fails consecutive public failures"
for s in "${SERVICES[@]}"; do
    if systemctl --user restart "$s" 2>&1; then
        echo "  restarted $s"
    else
        echo "  FAILED to restart $s"
    fi
done

echo 0 > "$STATE"
sleep 15
after=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$URL" 2>/dev/null || echo 000)
echo "post-restart: $URL -> HTTP $after"
