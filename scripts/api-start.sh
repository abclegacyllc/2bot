#!/usr/bin/env bash
#
# Starts the Express API for the 2bot-api systemd unit.
#
# Runs the compiled build that .dist-active names (dist or dist-b), which
# `make start` / `make restart-quick` produce with tsc.  Compiled JS listens in
# ~5s; tsx took 33-41s on this box because it compiles and loads ~800 modules
# on every start, and every one of those seconds is API downtime on a deploy.
#
# No pointer, "tsx", or a slot without a build: runs the TypeScript source
# through tsx exactly as before, so deleting .dist-active is a full revert.
cd "$(dirname "$0")/.." || exit 1

set -a
. ./.env 2>/dev/null
. ./.env.production 2>/dev/null
. ./.env.local 2>/dev/null
set +a
export SERVER_PORT=3002

slot=$(cat .dist-active 2>/dev/null)
case "$slot" in
    dist|dist-b) [ -f "$slot/server/start.js" ] || slot=tsx ;;
    *) slot=tsx ;;
esac

if [ "$slot" = tsx ]; then
    echo "api-start: running the TypeScript source through tsx"
    exec npx tsx src/server/start.ts
fi
echo "api-start: running compiled build $slot"
exec node --enable-source-maps "$slot/server/start.js"
