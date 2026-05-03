# Phase 6.1 — V1 dispatch deletion plan

> **Status:** PREPARED — not yet applied. Gate on telemetry before deletion.

## Background

The v1 plugin dispatch path (`gateway webhook → handle*Webhook → routeEventToPlugins → findTargetPlugins → executeUserPlugin`) was superseded in Phase 5 by the workflow dispatcher. Both paths currently run in parallel; v1 is wrapped in a feature-flag (`PLUGIN_V1_DISPATCH`, default `enabled` for telemetry) and emits `bot_v1_dispatch_total` for every legacy invocation.

Migration script (already present, idempotent):
- [scripts/migrate-v1-userplugins-to-workflows.ts](scripts/migrate-v1-userplugins-to-workflows.ts)

## Gate (must hold for ≥ 72 h before deletion)

1. `bot_v1_dispatch_total` rate **= 0** across all environments.
2. `scripts/migrate-v1-userplugins-to-workflows.ts` has been run in production
   (idempotent — safe to re-run; verify with the audit query at the bottom of
   the script).
3. No support tickets referencing v1 dispatch in the past 30 days.

## Deletion list

After the gate is met, delete the following symbols and their imports.

### `src/modules/plugin/plugin.events.ts`

- `findTargetPlugins`               (line ~461)
- `routeEventToPlugins`             (line ~651)
- `handleTelegramWebhook`           (line ~777)
- `handleDiscordWebhook`            (line ~1167)
- `handleSlackWebhook`              (line ~1387)
- `handleWhatsAppWebhook`           (line ~1545)

Keep: any pure helpers used by both v1 and the workflow path (`buildPluginEvent`, signature verifiers, etc. — audit before removing). The file may end up empty; if so, delete the file and its index re-exports.

### `src/server/routes/webhook.ts`

- Remove the four `handle*Webhook` import (line 23).
- Remove the four call-sites (lines ~441, 779, 1100, 1446). The workflow
  dispatcher already runs in the same handlers; deletion is a pure subtraction.

### `src/modules/workflow/v1-dispatch-telemetry.ts`

- Whole file. Once v1 paths are removed, the telemetry wrapper has no callers.

### `src/lib/metrics.ts`

- Remove the `bot_v1_dispatch_total` counter declaration (line ~101) and any
  helper that increments it.

### `src/server/config.ts` (or wherever flags live)

- Remove the `PLUGIN_V1_DISPATCH` env flag and any references.

## Test surface to update

- `src/modules/plugin/__tests__/plugin.events.test.ts` — remove tests for the
  four `handle*Webhook` functions; keep workflow-dispatch coverage.
- `src/server/routes/__tests__/webhook.test.ts` — drop fixtures asserting v1
  side-effects.
- Update any e2e in `scripts/smoke-test-*.sh` that still pokes `/v1/`-shaped
  endpoints.

## Rollback

Revert the deletion commit. The migration script is idempotent and the
`UserPlugin → Workflow` rows it created are *not* removed by deletion, so
roll-forward = re-add the symbols from git history.

## Audit query (paste into the gate dashboard)

```promql
sum(rate(bot_v1_dispatch_total[24h])) by (gateway_type)
```

Expected: `0` for `telegram | discord | slack | whatsapp` for ≥ 72 h.
