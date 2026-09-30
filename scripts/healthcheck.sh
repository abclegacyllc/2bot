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

# probe URL TIMEOUT -> sets CODE (000 when nothing came back), RC (curl's exit
# code) and MSG (curl's error text).  The old `$(curl -w '%{http_code}' ...
# || echo 000)` appended a second "000" to curl's own output whenever curl
# exited non-zero, so a timeout logged as 000000 and a 200 whose body stalled
# logged as 200000 -- and counted as a failure.  It also threw away curl's
# error, so the timeouts could never be diagnosed.
probe() {
    read -r CODE RC MSG < <(curl -s -o /dev/null --max-time "$2" \
        -w '%{http_code} %{exitcode} %{errormsg}\n' "$1" 2>/dev/null)
    CODE=${CODE:-000} RC=${RC:-?} MSG=${MSG:-}
}

mkdir -p "$(dirname "$STATE")"
fails=$(cat "$STATE" 2>/dev/null || echo 0)
[[ "$fails" =~ ^[0-9]+$ ]] || fails=0

probe "$URL" 20
code=$CODE

if [[ "$code" == "200" ]]; then
    # Headers said 200; a stalled body is worth a note, not a restart.
    [[ "$RC" == "0" ]] || echo "note: $URL answered 200 but curl exited $RC ($MSG)"
    if (( fails > 0 )); then
        echo "recovered: $URL is 200 again after $fails consecutive failure(s)"
    fi
    echo 0 > "$STATE"
    exit 0
fi

fails=$(( fails + 1 ))
echo "$fails" > "$STATE"
echo "UNHEALTHY: $URL returned HTTP $code, curl exit $RC${MSG:+ ($MSG)} (consecutive failure $fails/$THRESHOLD)"

if (( fails < THRESHOLD )); then
    echo "holding: one more consecutive failure will trigger a restart"
    exit 0
fi

# Which upstream is actually down?  Logged before restarting so the journal
# still carries the evidence -- the old setup truncated its logs on every
# start, which is why the original crash could never be diagnosed.
for p in 3000 3001 3002; do
    probe "http://127.0.0.1:$p/" 5
    echo "  upstream 127.0.0.1:$p -> HTTP $CODE${MSG:+ ($MSG)}"
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
probe "$URL" 20
echo "post-restart: $URL -> HTTP $CODE${MSG:+ ($MSG)}"
