#!/usr/bin/env bash
#
# `next start` from whichever build slot is live.  Used by the 2bot-landing
# and 2bot-dashboard systemd units:  next-start.sh <port>
#
# Production has two build slots, .next and .next-b, and .next-active names
# the live one.  `make start` builds into the idle slot while the live one
# keeps serving, flips .next-active, and restarts -- a few seconds of restart
# instead of the ~4 minutes `next build` spends wiping and rewriting the dir
# a running server reads from.
#
# The slot cannot simply be renamed after building: Next bakes the distDir
# name into every page module (distDir:".next-b"), so a build only works from
# the directory it was built into.  Hence a pointer, not a rename.
cd "$(dirname "$0")/.." || exit 1
port=${1:?usage: next-start.sh <port>}

slot=$(cat .next-active 2>/dev/null)
case "$slot" in
    .next|.next-b) ;;
    *) slot=.next ;;   # no pointer yet (first deploy) or garbage: legacy dir
esac

set -a
. ./.env 2>/dev/null
. ./.env.production 2>/dev/null
. ./.env.local 2>/dev/null
set +a

echo "next-start: serving build slot $slot ($(cat "$slot/BUILD_ID" 2>/dev/null || echo 'no BUILD_ID')) on port $port"
export NEXT_DIST_DIR=$slot
exec npx next start -p "$port"
