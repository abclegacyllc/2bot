# Feature Flag Retirement Playbook

Status: **active.** Last review: 2026-05-09.

Feature flags accumulate. Each one was added for a real reason (gradual
rollout, kill switch, A/B), but once the gradual phase is over, the
flag becomes a permanent fork in the code that costs review effort and
fails closed in surprising ways. Wave 6.1 + 6.2 are the staged
retirements of the platform's older flags; this doc is the playbook
applied to each.

---

## 1. The retirement ladder

Every flag goes through five phases. **Do not skip phases.**

| # | Phase | What it means | Time in phase |
|---|---|---|---|
| 1 | **Active** | Flag is the default-on / default-off behaviour. New PRs reference it. | indefinite |
| 2 | **Telemetry** | Flag remains on, but a metric counts every fork in the code path. We need real data to set the kill threshold. | ≥ 1 week |
| 3 | **Off in prod, code lives** | Flag flipped to `disabled` in prod env. Telemetry confirms 0 traffic on the dead branch. | ≥ 7 days |
| 4 | **Code removed** | Both branches of the fork are deleted; the flag is no longer read in code. The env var is left in `.env.example` with a tombstone comment. | until next quarter |
| 5 | **Env var removed** | The env var is removed from `.env.example`, `.env.test`, deploy scripts, etc. No traces remain. | terminal |

The "tombstone comment" in phase 4 looks like:

```bash
# REMOVED 2026-05-09 — Wave 6.1. The flag was retired and the code
# path it gated has been deleted. This entry remains for one quarter
# so old deployments don't see "unknown env var" warnings.
# PLUGIN_V1_DISPATCH=
```

---

## 2. Currently in-flight retirements

### 2.1 `PLUGIN_V1_DISPATCH` (Wave 6.1)

**Where it's read:**
[src/modules/workflow/v1-dispatch-telemetry.ts](../../src/modules/workflow/v1-dispatch-telemetry.ts) (the
telemetry source-of-truth) and any gateway webhook code that
short-circuits the legacy plugin-routing path.

**Phase:** 2 (telemetry).

**Telemetry metric:** `bot_v1_dispatch_total{eventType,mode}` —
incremented once per legacy dispatch attempt. The `mode` label
distinguishes:
- `telemetry` — flag is `enabled` or `telemetry`; legacy dispatch
  STILL runs but is counted.
- `disabled` — flag is `disabled`; legacy dispatch is short-circuited
  and only the count is emitted.

**Kill threshold:** `sum(rate(bot_v1_dispatch_total[7d])) == 0` for
seven consecutive days, with `mode=telemetry` (i.e. dispatch is still
live and we'd see the count if it happened).

**Migration prerequisite:** [scripts/migrate-v1-userplugins-to-workflows.ts](../../scripts/migrate-v1-userplugins-to-workflows.ts)
must be run first. It auto-wraps every UserPlugin install that ONLY
runs via the V1 path into a 1-step BOT_MESSAGE workflow, so plugins
keep working once V1 is off.

**Procedure:**

```bash
# Step 1 — run the migration in dry-run, eyeball the report
npx tsx scripts/migrate-v1-userplugins-to-workflows.ts

# Step 2 — apply
npx tsx scripts/migrate-v1-userplugins-to-workflows.ts --apply

# Step 3 — flip prod to telemetry mode (if not already)
PLUGIN_V1_DISPATCH=telemetry
make restart-api

# Step 4 — wait 7 days, watch the dashboard
#   bullmq-workflows.json shows V1 dispatch count via the metric

# Step 5 — once 0 for 7 days, flip to disabled
PLUGIN_V1_DISPATCH=disabled
make restart-api

# Step 6 — wait another 7 days. If anyone reports a broken bot,
#   it's almost certainly a UserPlugin that the migration missed
#   (rare but possible). Re-run the migration with their userId.

# Step 7 — code removal
git checkout -b chore/retire-plugin-v1-dispatch
# Delete the V1 dispatch fork in gateway webhook handlers.
# Delete src/modules/workflow/v1-dispatch-telemetry.ts.
# Keep `PLUGIN_V1_DISPATCH=` (empty) in .env.example with the
# tombstone comment shown in §1.

# Step 8 — env var removal (next quarter)
# Drop the tombstone entry from .env.example.
```

### 2.2 `FEATURE_AI_BUILDER` legacy alias (Wave 6.2)

The original env was `FEATURE_AI_BUILDER`; it was renamed to
`FEATURE_CURSOR_BUILDSPEC` during Wave 6.3 prep. Both names are read
today (the new name takes precedence, falling back to the old).

**Where it's read:**
[src/server/routes/cursor-buildspec.ts](../../src/server/routes/cursor-buildspec.ts) — the route is
gated by the new name with the old as fallback.

**Phase:** 1 (still active under both names).

**Kill threshold:** none — this is a pure rename retirement; no
telemetry needed because nothing changes for callers. The retirement
is "remove the old env var name from the OR-fallback in the route."

**Procedure:**

```bash
# Step 1 — verify no infra still uses the old name.
grep -rln "FEATURE_AI_BUILDER" .
# Expect: src/server/routes/cursor-buildspec.ts (the fallback) and
# .env.example (documenting the alias). All other matches should be
# in docs.

# Step 2 — drop the OR fallback in cursor-buildspec.ts.
# Before: process.env.FEATURE_CURSOR_BUILDSPEC ?? process.env.FEATURE_AI_BUILDER
# After:  process.env.FEATURE_CURSOR_BUILDSPEC

# Step 3 — drop the alias entry from .env.example, leaving only
# FEATURE_CURSOR_BUILDSPEC.

# Step 4 — communicate in the engineering channel: "if your env
# files set FEATURE_AI_BUILDER, update them to FEATURE_CURSOR_BUILDSPEC."
```

### 2.3 Other flags in the wild

| Flag | Phase | Notes |
|---|---|---|
| `FEATURE_PROJECT_RESOURCES` | 1 (active) | Polymorphic ProjectResource layer. Stays live; gated for safety not for rollout. Retire only after Wave 6.3 stabilises (i.e. after the discriminated-union refactor lands). |
| `FEATURE_PROJECT_VERSIONS` | 1 (active) | Auto-rollback feature, gated. Retire when versioning becomes default-on. |
| `FEATURE_CHAT_FIRST` | 1 (active) | Chat-first dashboard. Retire when chat-first ships to all customers. |
| `FEATURE_MFA` | 1 (active) | TOTP MFA from Wave 2.1. Retire only AFTER `Organization.mfa_required` enforcement has been on for ≥ 1 quarter without rollback. |

---

## 3. The four-eyes rule

A flag retirement deletes code paths that production has been running.
**Two-person review is non-negotiable** for any PR that:

- Removes a `process.env.FEATURE_*` read site
- Removes the alternate (else) branch of a flag-gated `if`
- Drops an env var entry from `.env.example`

The reviewer's job is to confirm the kill-threshold telemetry was met,
not just that the diff looks right.

---

## 4. When NOT to retire

A flag is fine to keep indefinitely if it's a **kill switch** rather
than a rollout flag. Examples:

- `AI_CACHE_ENABLED` — used as a circuit breaker. Stays.
- `HEALTH_MONITOR_ENABLED` — used to silence alerting in dev. Stays.
- `WORKSPACE_CAP_ADD` — used to tighten/loosen caps per environment. Stays.

Rule of thumb: if the flag exists to *change behaviour permanently
between environments*, keep it. If it exists to *gradually roll out
new behaviour to all environments*, retire it once the rollout is done.
