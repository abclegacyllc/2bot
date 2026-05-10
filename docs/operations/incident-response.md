# Incident Response Runbook

Status: **active.** Last review: 2026-05-08. Owner: platform on-call.

For *security* incidents (data breach, leaked secret, unauthorised
access) jump straight to [breach-response.md](breach-response.md).
This doc covers the *operational* incident playbook: outage, partial
degradation, runaway error rate, hot DB, etc.

---

## 1. Severity ladder

| Level | What it means | Response |
|---|---|---|
| **SEV-1** | Customer-facing total outage. /health is failing or 5xx rate > 50%. | Drop everything. Page everyone. |
| **SEV-2** | Significant degradation: workflow worker stalled, billing webhooks failing, > 10% 5xx. | On-call drives; pull in module owner. |
| **SEV-3** | Localised problem: one tenant impacted, single feature broken. | Triage in working hours. |
| **SEV-4** | No customer impact: noisy alert, slow query, capacity creep. | Backlog item. |

Pick a level on the way in and adjust if the picture changes — "downgraded"
status updates are as valuable as "upgraded" ones.

---

## 2. The first 5 minutes (SEV-1/2)

1. **Acknowledge in the incident channel.** One line: "I'm IC, looking
   at <symptom>. Severity SEV-?". This stops duplicate responders.
2. **Open the dashboard.** [docs/operations/dashboards/](dashboards/) →
   start with `api-overview.json` (latency + error rate by route).
3. **Decide: contain or investigate?** If customer impact is ongoing,
   contain first:
   - **Roll back the last deploy** if the symptom started right after.
     `git log` on `main` + `make deploy-previous`.
   - **Disable a feature flag.** `FEATURE_X=disabled` on the API server,
     restart.
   - **Drain a hot replica.** Take it out of the load balancer, leave
     it running so you can investigate.
4. **Open a timeline doc.** `incident-YYYY-MM-DD-<name>` — same template
   as breach-response.md §3 step 4.

---

## 3. Triage decision tree

### "Latency is up across the board"

- DB? Check `pg_stat_activity` for stuck queries; `EXPLAIN` the slowest.
- Redis? `redis-cli --latency` on the production replica.
- Upstream AI provider? Look at `bot_ai_provider_request_duration_ms`
  by provider in the dashboard.
- The API server itself? Check `bot_http_request_duration_ms{p99}`
  vs CPU. CPU saturated → scale out (or kill a runaway request).

### "Error rate spike on a specific route"

- Pull the last 100 errors from Sentry filtered by the route.
- Check if all errors share a stack frame → likely a code bug in the
  last deploy.
- If errors are 502/503 → check if a dependent service is down.

### "BullMQ workflow runs piling up"

- `bot_queue_depth{queue="workflow-runs",state="waiting"}` climbing → workers stuck.
- Check `workflow-worker` container is alive and healthy.
- Grep worker logs for repeated stack traces.
- If a poison-pill job is the cause: see [stripe-webhook-replay.md](stripe-webhook-replay.md)
  for the general replay/skip pattern.

### "Workspace containers in ERROR state climbing"

→ See [workspace-zombie-cleanup.md](workspace-zombie-cleanup.md).

### "DB connection pool exhausted"

- Are pgbouncer transactions stacking?
- Long-running query? `SELECT pid, query, state, wait_event_type, age(now(),query_start) FROM pg_stat_activity ORDER BY age DESC LIMIT 20;`
- If a single query is the culprit: `SELECT pg_cancel_backend(<pid>);`
  (or `pg_terminate_backend` for a hard kill).

### "5xx everywhere, can't reach any service"

- Is the host up at all? SSH check.
- nginx config syntax error after a deploy? `nginx -t` on the host.
- Disk full? `df -h` — `/var/lib/docker` and `/var/log` are usual culprits.
- DNS? `dig api.2bot.org`.

---

## 4. Communication

| Audience | When | Channel | Who |
|---|---|---|---|
| Internal team | Continuously while live | incident channel | IC |
| Status page | Within 10 min of SEV-1/2 declaration | status.2bot.org | IC |
| Affected customers | If outage > 30 min and only some customers impacted | email + in-app banner | Communicator |
| Post-incident | Within 7 days | post-mortem doc shared | IC |

The status page goes up *first* — even before you have a fix in mind.
"Investigating an issue affecting workflow execution. Updates every 15
minutes." beats silence.

---

## 5. After the fire

- **Restore monitoring.** Re-enable any alerts you silenced. Re-add
  any replicas you drained.
- **Run a full backup-restore check** if data integrity was ever in
  question. See [db-restore.md](db-restore.md).
- **Close the timeline doc** with a section: "Customer-visible from
  HH:MM to HH:MM. <N> customers affected. <error-budget cost>."
- **Post-mortem within 7 days.** Template: timeline, root cause, what
  went well, what didn't, action items with owner + due date.

---

## 6. On-call basics

- The on-call is whoever owns the pager for the week. SEV-1/2 alerts
  page; SEV-3/4 file tickets only.
- Hand-off at 9am Mondays — verbal sync between outgoing and incoming
  on-call covers any open incidents and any baseline weirdness.
- When in doubt about whether to act: act. Reverting a deploy when it
  wasn't strictly necessary costs an hour; *not* reverting one that
  was needed costs a day.
