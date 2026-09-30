#!/usr/bin/env bash
#
# Production deploys, behind the Makefile's start / restart-quick /
# restart-env / rollback targets.  Production runs as systemd user units
# (ops/systemd); everything here goes through systemctl, never kill-by-port.
#
# Two components, each with two build slots and a pointer naming the live one:
#
#   frontend  .next | .next-b    pointer .next-active  (scripts/next-start.sh)
#   api       dist  | dist-b     pointer .dist-active  (scripts/api-start.sh;
#                                 "tsx" = run the TypeScript source, as before)
#
# A deploy builds into the idle slot while the live one keeps serving, so a
# failed build never touches production.  Then it flips the pointer (saving
# the old value in <pointer>.prev) and restarts.  A slot can't be renamed
# after building -- Next bakes its distDir into every page module -- hence
# pointers rather than renames.
#
# .last-deploy records which components the last deploy flipped, so
# `rollback` only undoes those; rolling back twice rolls forward again.
#
# Usage: scripts/prod.sh deploy|quick|env|rollback|wait|slots|clean-idle
set -euo pipefail
cd "$(dirname "$0")/.."

# One deploy at a time. Two concurrent ones would build into the same idle
# slot and flip pointers under each other (two sessions deployed seven
# minutes apart on 2026-09-30). Read-only commands don't need the lock.
case ${1:-} in
    deploy|quick|env|rollback|clean-idle)
        exec 9>.deploy.lock
        if ! flock -n 9; then
            echo "Another deploy is running (lock: .deploy.lock). Wait for it to finish." >&2
            exit 1
        fi
        ;;
esac

CYAN='\033[36m' GREEN='\033[32m' YELLOW='\033[33m' RED='\033[31m' RESET='\033[0m'
say()  { echo -e "${CYAN}$*${RESET}"; }
ok()   { echo -e "${GREEN}✅ $*${RESET}"; }
fail() { echo -e "${RED}❌ $*${RESET}" >&2; }

UNITS=(2bot-landing 2bot-dashboard 2bot-api)
TIMERS=(2bot-healthcheck.timer 2bot-backup.timer)

pointer() { case $1 in frontend) echo .next-active ;; api) echo .dist-active ;; esac; }
units_of() { case $1 in frontend) echo 2bot-landing 2bot-dashboard ;; api) echo 2bot-api ;; esac; }

# Is <slot> a usable build of <component>?
built() {
    case $1 in
        frontend) [ -f "$2/BUILD_ID" ] ;;
        api) [ "$2" = tsx ] || [ -f "$2/server/start.js" ] ;;
    esac
}

live_slot() {
    local s; s=$(cat "$(pointer "$1")" 2>/dev/null || true)
    case $1 in
        frontend) case $s in .next|.next-b) echo "$s" ;; *) echo .next ;; esac ;;
        api) case $s in dist|dist-b) built api "$s" && echo "$s" || echo tsx ;; *) echo tsx ;; esac ;;
    esac
}

idle_slot() {
    case $1 in
        frontend) [ "$(live_slot frontend)" = .next ] && echo .next-b || echo .next ;;
        api) [ "$(live_slot api)" = dist ] && echo dist-b || echo dist ;;
    esac
}

# Point <component> at <slot>, keeping the current value for rollback.
set_live() {
    local p; p=$(pointer "$1")
    live_slot "$1" > "$p.prev.tmp" && mv "$p.prev.tmp" "$p.prev"
    echo "$2" > "$p.tmp" && mv "$p.tmp" "$p"
}

build_frontend() {
    local live idle; live=$(live_slot frontend); idle=$(idle_slot frontend)
    say "Building Next.js into idle slot $idle (live: $live, still serving; ~4 minutes)..."
    if ! NEXT_DIST_DIR=$idle npm run build; then
        rm -rf "$idle"   # the failed build already wiped it; don't leave it for rollback
        fail "Frontend build failed. Production is untouched and still serving $live."
        return 1
    fi
    ok "Frontend built into $idle ($(cat "$idle/BUILD_ID"))"
    NEW_FRONTEND=$idle
}

build_api() {
    local live idle; live=$(live_slot api); idle=$(idle_slot api)
    say "Compiling the API into idle slot $idle (live: $live, still serving; ~90 seconds)..."
    rm -rf "$idle"       # no stale .js from deleted sources
    # tsc emits even when it finds type errors; a build with errors doesn't ship.
    if ! npx tsc -p tsconfig.server.json --outDir "$idle" || ! npx tsc-alias -p tsconfig.server.json --outDir "$idle"; then
        rm -rf "$idle"
        fail "API build failed. Production is untouched and still running $live."
        return 1
    fi
    ok "API compiled into $idle"
    NEW_API=$idle
}

restart() {
    say "Restarting: $*"
    systemctl --user restart "$@"
    systemctl --user start "${TIMERS[@]}"
}

wait_healthy() {
    local failed=0 unit url code i
    for spec in "2bot-landing|http://127.0.0.1:3000/" "2bot-dashboard|http://127.0.0.1:3001/" "2bot-api|http://127.0.0.1:3002/health"; do
        unit=${spec%%|*}; url=${spec#*|}; code=000
        for i in $(seq 1 90); do
            code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url") || true
            [ "$code" = 200 ] && break
            sleep 1
        done
        if [ "$code" = 200 ]; then
            ok "$unit answering on $url"
        else
            fail "$unit not answering on $url (HTTP $code). Last log lines:"
            journalctl --user -u "$unit" -n 20 --no-pager -o cat
            failed=1
        fi
    done
    if [ $failed != 0 ]; then
        echo -e "${YELLOW}Broken after a deploy? make rollback${RESET}"
        return 1
    fi
}

cmd=${1:-}
case $cmd in
    deploy)   # make start / restart: both components
        build_api
        # The API build replaced the previous one in its idle slot; if the
        # frontend fails, drop it so `rollback` can't switch to code that
        # never went live.
        build_frontend || { rm -rf "$NEW_API"; exit 1; }
        set_live api "$NEW_API"
        set_live frontend "$NEW_FRONTEND"
        echo "frontend api" > .last-deploy
        restart "${UNITS[@]}"
        wait_healthy
        ;;
    quick)    # make restart-quick: API code changes; frontend untouched
        build_api
        set_live api "$NEW_API"
        echo "api" > .last-deploy
        restart "${UNITS[@]}"
        wait_healthy
        ;;
    env)      # make restart-env: no build (.env changes)
        restart "${UNITS[@]}"
        wait_healthy
        ;;
    rollback)
        comps=$(cat .last-deploy 2>/dev/null || echo frontend)
        # Check every component before switching any, so a half-done
        # rollback can't leave a flipped pointer that nothing restarted.
        declare -A target=()
        for c in $comps; do
            prev=$(cat "$(pointer "$c").prev" 2>/dev/null || true)
            if [ -z "$prev" ] && [ "$c" = frontend ]; then prev=$(idle_slot frontend); fi  # before .prev existed
            if [ -z "$prev" ] || ! built "$c" "$prev"; then
                fail "No previous $c build to go back to (${prev:-none recorded}); nothing switched"
                exit 1
            fi
            target[$c]=$prev
        done
        to_restart=()
        for c in $comps; do
            say "Switching $c: $(live_slot "$c") -> ${target[$c]}"
            set_live "$c" "${target[$c]}"
            read -ra u <<< "$(units_of "$c")"
            to_restart+=("${u[@]}")
        done
        restart "${to_restart[@]}"
        wait_healthy
        ;;
    wait)
        wait_healthy
        ;;
    slots)    # one line per component, for `make status`
        f=$(live_slot frontend); a=$(live_slot api)
        echo "Frontend build: $f ($(cat "$f/BUILD_ID" 2>/dev/null || echo 'no build'))"
        if [ "$a" = tsx ]; then echo "API build:      tsx (TypeScript source, compiled at every start)"
        else echo "API build:      $a (compiled $(date -r "$a/server/start.js" '+%Y-%m-%d %H:%M'))"; fi
        echo "Last deploy:    $(cat .last-deploy 2>/dev/null || echo 'none recorded') -- make rollback undoes it"
        ;;
    clean-idle)   # make clean: idle slots only; live ones are serving
        for c in frontend api; do
            i=$(idle_slot "$c"); rm -rf "$i"
            echo "  Removed idle $c slot $i/ (kept live $(live_slot "$c"))"
        done
        ;;
    *)
        echo "usage: $0 deploy|quick|env|rollback|wait|slots|clean-idle" >&2
        exit 2
        ;;
esac
