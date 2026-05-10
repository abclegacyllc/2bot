# Database Restore Runbook

Status: **active.** Last review: 2026-05-08. Owner: platform on-call.

This is the playbook for two adjacent operations:

- **Disaster recovery** — restoring after a catastrophic loss (corruption,
  accidental DROP, hardware failure).
- **Point-in-time recovery (PITR)** — rolling back to a specific
  timestamp to undo a buggy migration or data deletion.

**Targets:**
- RTO (recovery time objective): **1 hour** from decision-to-restore to
  service-back-up.
- RPO (recovery point objective): **5 minutes** of acceptable data loss.

These targets are aspirational until pgBackRest + WAL streaming is in
production. See §6.

---

## 1. Backup layout (current state)

| Source | Frequency | Retention | Off-site? |
|---|---|---|---|
| `pg_dump` of `2bot_production` | manual / on-demand | local only | **no** |
| Docker volume `postgres_data` | implicit (no snapshot) | n/a | no |
| `prisma/migrations/` (DDL history) | every commit | git | yes (GitHub) |

> **Risk acknowledged.** The current "manual `pg_dump` to local disk"
> is below SOC 2's bar. Wave 4.5's pgBackRest migration (§6) is what
> fixes this; until then, do not delay setting it up if you're seriously
> considering paying customers.

---

## 2. Quick check before a restore

Before you destroy anything, verify the backup is good:

```bash
# 1. List available dumps
ls -lh /home/abcdev/projects/2bot/backups/

# 2. Pick the most recent (or the one immediately before the incident).
DUMP=/home/abcdev/projects/2bot/backups/2bot-YYYYMMDD-HHMM.sql.gz

# 3. Read the header to confirm it's the right database and not corrupt.
zcat "$DUMP" | head -50

# 4. Optional: dry-restore to a temp database to verify integrity.
docker exec 2bot-postgres createdb -U postgres 2bot_restore_test
zcat "$DUMP" | docker exec -i 2bot-postgres psql -U postgres -d 2bot_restore_test
docker exec 2bot-postgres psql -U postgres -d 2bot_restore_test -c "SELECT count(*) FROM users;"
docker exec 2bot-postgres dropdb -U postgres 2bot_restore_test
```

If step 4 fails — stop. The dump is bad. Try the next-most-recent.

---

## 3. Full restore (production)

```bash
# 0. Communicate. Status page → "Database maintenance, brief outage."
# 1. Stop the API + workers so nothing writes during the restore.
make stop-prod

# 2. Snapshot the current database BEFORE you overwrite it.
#    This is your get-out-of-jail card if the restore goes wrong.
docker exec 2bot-postgres pg_dump -U postgres -d 2bot_production -Fc \
  | gzip > "/home/abcdev/projects/2bot/backups/preincident-$(date +%Y%m%d-%H%M).dump.gz"

# 3. Drop and recreate the live DB.
docker exec 2bot-postgres dropdb -U postgres 2bot_production
docker exec 2bot-postgres createdb -U postgres 2bot_production

# 4. Restore from the dump.
zcat "$DUMP" | docker exec -i 2bot-postgres psql -U postgres -d 2bot_production

# 5. Run any migrations that landed AFTER the dump.
#    (skip this if the dump is from BEFORE a buggy migration that's
#    already been reverted in code.)
make db-migrate

# 6. Smoke-test as a real user.
make dev
curl -fsS https://api.2bot.org/health
# log in, list projects, send a workflow event.

# 7. Bring the rest back up.
make start
```

---

## 4. Point-in-time recovery (PITR)

PITR requires WAL archiving — currently **NOT in place**. Coming with
pgBackRest (§6). Until then, the closest substitute is "find a dump
from before the incident and replay forward via the audit log."

When pgBackRest is live:

```bash
# Stop writes
make stop-prod

# Restore base backup + WAL up to the target time
pgbackrest --stanza=2bot --type=time --target='2026-05-09 14:23:00' restore

# Start Postgres in recovery mode (handled automatically by pgBackRest)
docker compose start postgres

# Verify the recovery target was reached
docker exec 2bot-postgres psql -U postgres -c "SELECT pg_is_in_recovery();"

# Promote
docker exec 2bot-postgres psql -U postgres -c "SELECT pg_promote();"

# Bring services back
make start
```

---

## 5. Anonymisation conflict (Wave 2.2 interaction)

A restore from a backup older than ~30 days may contain rows for users
who have since been anonymised. If `anonymized_at` is set on a user in
production but the restored row still has live PII, you've effectively
un-deleted that user — a GDPR violation.

**Mitigation after every restore:**

```sql
-- Re-run anonymisation for any user whose deletion grace window has elapsed
UPDATE users
SET email = 'deleted-' || id || '@example.invalid',
    name = NULL,
    image = NULL,
    password_hash = '',
    totp_secret = NULL,
    totp_enabled_at = NULL,
    totp_recovery_codes = '{}',
    anonymized_at = NOW(),
    is_active = false
WHERE deletion_scheduled_for IS NOT NULL
  AND deletion_scheduled_for < NOW()
  AND anonymized_at IS NULL;

-- Drop sessions and reset tokens for any anonymised user
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE anonymized_at IS NOT NULL);
DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE anonymized_at IS NOT NULL);
```

Or simpler: the `accountAnonymizer` cron (Wave 2.2) will pick these up
within 24h. If the restore is from < 30 days ago and you can't tolerate
24h of un-deleted PII, run the SQL above immediately.

---

## 6. pgBackRest migration plan (Wave 4.5 — staged, not yet rolled out)

### 6.1 What pgBackRest gives us

- Continuous WAL archiving to S3/R2 → 5-minute RPO.
- Daily full + 6-hourly incremental backups → 1-hour RTO.
- Encrypted, deduplicated, compressed backup payloads.
- Restore CLI that handles WAL replay automatically.
- 30-day retention by default (configurable).

### 6.2 One-time setup (host)

```bash
# 1. Install pgBackRest in the postgres container (or a sidecar).
#    Image: pgbackrest/pgbackrest:latest, mounted alongside the
#    postgres data volume.

# 2. Create an S3/R2 bucket for backups: 2bot-backups-prod
#    Apply lifecycle: expire objects > 35 days.

# 3. Configure /etc/pgbackrest/pgbackrest.conf:
#      [global]
#      repo1-type=s3
#      repo1-s3-endpoint=s3.amazonaws.com   (or R2 endpoint)
#      repo1-s3-bucket=2bot-backups-prod
#      repo1-s3-region=us-east-1
#      repo1-s3-key=...
#      repo1-s3-key-secret=...
#      repo1-retention-full=4
#      repo1-cipher-type=aes-256-cbc
#      repo1-cipher-pass=<random>
#
#      [2bot]
#      pg1-path=/var/lib/postgresql/data
#      pg1-port=5432
#      pg1-host-user=postgres

# 4. Initialise the stanza.
pgbackrest --stanza=2bot stanza-create

# 5. Configure Postgres to ship WAL through pgBackRest.
#    postgresql.conf:
#      archive_mode = on
#      archive_command = 'pgbackrest --stanza=2bot archive-push %p'
#      archive_timeout = 60
#    Reload Postgres.

# 6. Take the first full backup.
pgbackrest --stanza=2bot --type=full backup
```

### 6.3 Cron schedule

```cron
# Daily full backup at 03:00 UTC
0 3 * * * pgbackrest --stanza=2bot --type=full backup

# Incremental every 6 hours
0 */6 * * * pgbackrest --stanza=2bot --type=incr backup

# Verify backup integrity weekly
0 4 * * 0 pgbackrest --stanza=2bot check
```

### 6.4 Quarterly restore drill

A backup you've never restored is not a backup. Schedule:

- 1st of every quarter (Jan/Apr/Jul/Oct), block 1h on platform on-call.
- Spin up a temporary Postgres + pgBackRest pointed at a *clone* of the
  prod bucket.
- Run `pgbackrest --stanza=2bot --type=time --target='<6h ago>' restore`.
- Verify a known query returns expected data.
- Open a GitHub issue with the result; close on success.

The drill is **not optional** — it's the only time you find out the
config drifted out of working order.

### 6.5 Rollback

If pgBackRest causes a problem, the existing manual `pg_dump` flow in
§3 still works. Don't tear it down until the new system has a full
month of clean drills.

---

## 7. Backups vs GDPR

See [data-retention.md §3](data-retention.md#3-backups-vs-deletion).
Summary: a user's deletion request is fully complete only after every
backup containing pre-anonymised data has expired (30 days under §6.3).
Disclose this in the privacy policy.
