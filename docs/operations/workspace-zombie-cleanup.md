# Workspace Zombie Cleanup Runbook

Status: **active.** Last review: 2026-05-08. Owner: platform on-call.

A "zombie" workspace is one of:

- A `WorkspaceContainer` row with `status='RUNNING'` but no container
  exists in Docker.
- A Docker container that's running but isn't reflected in the DB
  (orphaned, e.g. left behind by a crashed deploy).
- A container whose bridge agent has been unreachable for > 15 min.
- A container in `ERROR` for > 24h with no auto-retry succeeding.

This runbook is what you run when the zombie count climbs or after an
outage that may have left containers in inconsistent state.

---

## 1. Detection

Three early-warning sources:

- **Metric:** `bot_workspace_containers{status="error"}` (Wave 4.2 gauge).
  Alert when this exceeds 1% of the running fleet for > 10 min.
- **Container lifecycle service** logs at WARN: `containerLifecycleService`
  in `src/modules/workspace/` runs every minute and writes to
  `WorkspaceAuditLog` when it detects mismatches.
- **Bridge token rotation cron** writes ERROR-level logs when a single
  container fails 3 cycles in a row (Wave 3.6).

---

## 2. Triage queries

Pick the one that matches what you're seeing.

### 2.1 DB-says-running, Docker-says-no

```sql
-- Containers that are RUNNING in the DB but the lifecycle health-check
-- has failed for at least 15 minutes.
SELECT id, container_id, name, user_id, last_health_check_at, last_health_status
FROM workspace_containers
WHERE status = 'RUNNING'
  AND (
    last_health_check_at IS NULL
    OR last_health_check_at < NOW() - INTERVAL '15 minutes'
  )
ORDER BY last_health_check_at ASC NULLS FIRST
LIMIT 50;
```

### 2.2 Docker-says-running, DB-says-no (orphaned containers)

```bash
# All workspace containers Docker knows about
docker ps --filter 'label=2bot.managed=true' --format '{{.ID}}\t{{.Names}}\t{{.Status}}'

# Compare to the DB. Anything in Docker but not in the DB is orphaned.
docker exec 2bot-postgres psql -U postgres -d 2bot_production -tAc \
  "SELECT container_id FROM workspace_containers WHERE container_id IS NOT NULL"
```

### 2.3 Stuck in ERROR forever

```sql
SELECT id, container_id, name, error, status_changed_at
FROM workspace_containers
WHERE status = 'ERROR'
  AND status_changed_at < NOW() - INTERVAL '24 hours'
ORDER BY status_changed_at ASC
LIMIT 50;
```

---

## 3. Cleanup

### 3.1 Reconcile DB to Docker (DB says RUNNING but no container)

```bash
# Recreate one (safe — the lifecycle service will handle this on its next
# tick once you mark the row STOPPED, and the user can resume from the UI).
docker exec 2bot-postgres psql -U postgres -d 2bot_production -c "
  UPDATE workspace_containers
  SET status = 'STOPPED',
      status_changed_at = NOW(),
      last_health_status = 'reconciled by ops'
  WHERE id = '<container-db-id>';
"
```

### 3.2 Remove orphaned Docker containers (no DB row)

```bash
# Confirm the container is genuinely orphaned — labels on workspace
# containers should match the platform's. If it lacks 2bot.managed=true
# DO NOT remove it; it may be unrelated.
docker inspect <container-id> --format '{{json .Config.Labels}}'

# Remove if confirmed orphaned.
docker stop <container-id>
docker rm <container-id>

# Their volumes too — but only if the user_id label confirms they're
# truly the leftover of a deleted user.
docker volume ls --filter 'label=2bot.managed=true'
docker volume rm <volume-name>
```

### 3.3 Force-clear stuck ERROR rows

These are safe to mark STOPPED — the user retries from the UI and
the lifecycle service rebuilds the container.

```sql
UPDATE workspace_containers
SET status = 'STOPPED',
    error = NULL,
    status_changed_at = NOW()
WHERE status = 'ERROR'
  AND status_changed_at < NOW() - INTERVAL '24 hours';
```

### 3.4 Mass cleanup (after a bad outage)

If dozens of containers are in ERROR after an incident:

```bash
# Step 1 — gather the list
docker exec 2bot-postgres psql -U postgres -d 2bot_production -tAc "
  SELECT container_id FROM workspace_containers
  WHERE status='ERROR' AND status_changed_at < NOW() - INTERVAL '1 hour'
" > /tmp/error-containers.txt

# Step 2 — for each, try a graceful stop then remove
while read cid; do
  [ -z "$cid" ] && continue
  docker stop "$cid" 2>/dev/null
  docker rm "$cid" 2>/dev/null
done < /tmp/error-containers.txt

# Step 3 — flip the DB rows to STOPPED so the lifecycle service
# rebuilds them on next user request
docker exec 2bot-postgres psql -U postgres -d 2bot_production -c "
  UPDATE workspace_containers
  SET status='STOPPED', error=NULL, container_id=NULL
  WHERE status='ERROR' AND status_changed_at < NOW() - INTERVAL '1 hour';
"
```

---

## 4. Common root causes

| Symptom | Likely cause |
|---|---|
| Bridge tokens failing rotation 3+ cycles | Container or bridge agent crashed; lifecycle service hasn't picked it up yet |
| All containers stuck in PROVISIONING | docker-compose just restarted — wait 5 min |
| ERROR rate climbing right after a deploy | Bridge agent image broke; check the workspace image build |
| ERROR + "no space left on device" | Host disk full — `docker system prune` first, then `df -h /var/lib/docker` |
| ERROR + cgroup OOM | A workspace process exceeded its `Memory` cap; user runaway, expected behaviour. No action. |

---

## 5. Prevention

- **Wave 3.6** alerts on 3-failure streaks before a container becomes
  fully zombie — adopt the alert rule from
  [workspace-hardening.md §7](workspace-hardening.md#7-bridge-token-rotation-alerting).
- The lifecycle service auto-cleans rows that have been stopped > 7 days
  with `state=ERROR`. Don't lower this threshold without checking the
  free-tier auto-stop interval first.
- After deploying a new workspace image, smoke test on a single tenant
  before letting the rolling-restart hit the rest.
