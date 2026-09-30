#!/usr/bin/env bash
# ============================================
# 2Bot Platform - Database Backup Script
# ============================================
# Dumps 2bot_production from the running 2bot-postgres container as plain SQL,
# gzipped -- the format docs/operations/db-restore.md restores with
# `zcat | psql`.  Run nightly by 2bot-backup.timer; `make backup` runs it now.
#
# Until 2026-09-30 this script piped `docker compose -f docker-compose.prod.yml`
# (neither exists on this box) into gzip without pipefail, so every run wrote a
# 20-byte empty .gz and still printed "Backup created successfully".  Now every
# step fails loudly, and a dump only counts if it ends with pg_dump's own
# completion marker -- a truncated dump still gunzips cleanly.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/abcdev/projects/2bot/backups}"
CONTAINER="${PG_CONTAINER:-2bot-postgres}"
DB="${POSTGRES_DB:-2bot_production}"
DB_USER="${POSTGRES_USER:-postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# Only nightly dumps are pruned.  Hand-made snapshots such as
# 2bot_backup_pre_pgvector_* don't match and are kept forever.
NIGHTLY_GLOB='2bot_backup_[0-9]*_[0-9]*.sql.gz'

umask 077
mkdir -p "$BACKUP_DIR"

final="$BACKUP_DIR/2bot_backup_$(date +%Y%m%d_%H%M%S).sql.gz"
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

echo "Dumping $DB from $CONTAINER -> $final"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" | gzip -6 > "$tmp"

tail_lines=$(zcat "$tmp" | tail -n 20)
if [[ "$tail_lines" != *"PostgreSQL database dump complete"* ]]; then
    echo "✗ Backup is incomplete (no pg_dump completion marker) — nothing kept" >&2
    exit 1
fi
mv "$tmp" "$final"
echo "✓ Backup created ($(du -h "$final" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 -name "$NIGHTLY_GLOB" -mtime +"$KEEP_DAYS" -print -delete \
    | sed 's/^/  pruned /'
echo "✓ $(find "$BACKUP_DIR" -maxdepth 1 -name "$NIGHTLY_GLOB" | wc -l) nightly backup(s) retained (${KEEP_DAYS}-day window)"
