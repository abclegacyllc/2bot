#!/bin/bash
# ============================================
# 2Bot Platform - Source Code Backup Script
# ============================================
# Creates a timestamped archive of source code only.
# Protects against accidental `git reset --hard`, 
# branch deletions, or other destructive operations.
# ============================================
set -e

BACKUP_DIR="${SOURCE_BACKUP_DIR:-$HOME/2bot-source-backups}"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="2bot_source_${TIMESTAMP}.tar.gz"
MAX_BACKUPS="${MAX_SOURCE_BACKUPS:-30}"

mkdir -p "$BACKUP_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         2Bot Platform - Source Code Backup                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Project:  $PROJECT_DIR"
echo "  Backup:   $BACKUP_DIR/$BACKUP_FILE"
echo ""

# Record current git state for reference
GIT_INFO=""
if command -v git &>/dev/null && [ -d "$PROJECT_DIR/.git" ]; then
  GIT_BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  GIT_HASH=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
  GIT_DIRTY=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | wc -l)
  GIT_INFO="branch=${GIT_BRANCH} commit=${GIT_HASH} uncommitted_files=${GIT_DIRTY}"
  echo "  Git:      $GIT_BRANCH @ $GIT_HASH ($GIT_DIRTY uncommitted changes)"
  echo ""
fi

echo "Creating source code archive..."

tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
  -C "$PROJECT_DIR" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.next-admin' \
  --exclude='.git' \
  --exclude='coverage' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='out' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.development' \
  --exclude='.env.production' \
  --exclude='ssl' \
  --exclude='*.sql' \
  --exclude='*.sql.gz' \
  --exclude='*.tsbuildinfo' \
  --exclude='src/generated' \
  --exclude='backups' \
  --exclude='.vercel' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='_archive_' \
  --exclude='package-lock.json' \
  .

# Write a small metadata file into the backup dir
echo "$GIT_INFO backup_time=$(date -Iseconds)" > "$BACKUP_DIR/${BACKUP_FILE%.tar.gz}.meta"

# Verify
if [ -f "$BACKUP_DIR/$BACKUP_FILE" ] && [ -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
  echo "✅ Backup created: $BACKUP_DIR/$BACKUP_FILE ($SIZE)"
else
  echo "❌ Backup failed!"
  exit 1
fi

# Cleanup: keep only the last N backups
BACKUP_COUNT=$(ls -1t "$BACKUP_DIR"/2bot_source_*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  echo ""
  echo "Cleaning up old backups (keeping last $MAX_BACKUPS)..."
  ls -1t "$BACKUP_DIR"/2bot_source_*.tar.gz | tail -n +"$((MAX_BACKUPS + 1))" | while read -r old; do
    rm -f "$old"
    rm -f "${old%.tar.gz}.meta"
  done
  echo "✅ Cleaned up $((BACKUP_COUNT - MAX_BACKUPS)) old backup(s)"
fi

REMAINING=$(ls -1 "$BACKUP_DIR"/2bot_source_*.tar.gz 2>/dev/null | wc -l)
echo ""
echo "📦 $REMAINING backup(s) in $BACKUP_DIR"
echo ""
echo "To restore, run:  tar -xzf $BACKUP_DIR/$BACKUP_FILE -C /path/to/restore"
echo "Done!"
