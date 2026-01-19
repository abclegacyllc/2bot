#!/bin/bash
# ============================================
# 2Bot Platform - Database Backup Script
# ============================================
set -e

BACKUP_DIR="${BACKUP_DIR:-/home/abcdev/projects/2bot/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="2bot_backup_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           2Bot Platform - Database Backup                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Backup file: $BACKUP_DIR/$BACKUP_FILE"
echo ""

# Load environment
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Perform backup
echo "Creating backup..."
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-postgres}" \
  "${POSTGRES_DB:-2bot_production}" | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_DIR/$BACKUP_FILE" ] && [ -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
  echo "✓ Backup created successfully ($SIZE)"
else
  echo "✗ Backup failed!"
  exit 1
fi

# Cleanup old backups (keep last 7 days)
echo ""
echo "Cleaning up old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "2bot_backup_*.sql.gz" -mtime +7 -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/2bot_backup_*.sql.gz 2>/dev/null | wc -l)
echo "✓ $REMAINING backup(s) retained"

echo ""
echo "Backup complete!"
