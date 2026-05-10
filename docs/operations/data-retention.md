# Data Retention Policy

Status: **active.** Last review: 2026-05-08. Owner: platform/security.

This document is the table-by-table answer to "how long does 2bot keep
this, and why." It is the source of truth for the GDPR deletion flow
([account.service.ts](../../src/modules/account/account.service.ts)),
audits, and any data-subject-rights request.

> Two important distinctions:
>
> - **Live data** vs **anonymised tombstone**. After GDPR account
>   deletion, the User row remains as a tombstone (PII scrubbed,
>   `anonymizedAt` set) so foreign keys from billing and audit don't
>   break. The retention numbers below describe the *live* state; once
>   anonymised, only `id`, `createdAt`, `updatedAt`, and the
>   `deleted-<id>@example.invalid` placeholder email remain on User.
>
> - **Per-tenant retention** for org plans may differ in contract.
>   Anything in this doc is the platform default; org-level overrides
>   live in the customer's MSA.

---

## Default policy summary

| Data class | Live retention | After deletion request |
|---|---|---|
| Account / profile | Indefinite while account is active | 30-day grace, then anonymised |
| Sessions / auth tokens | 7 days (token TTL) | Deleted immediately at deletion request |
| Workflow / project / plugin definitions | Indefinite while account is active | Deleted at anonymisation |
| Workflow run logs | Per-plan window (free 7d, business 90d) | Deleted at anonymisation |
| Billing records | 7 years (legal/tax minimum) | **Retained** post-anonymisation |
| Audit log | 2 years | **Retained** post-anonymisation, with subject linked to anonymous tombstone |
| AI request/response payloads | Not stored after response (cache TTL ≤ 1h) | n/a |
| Backups | 30 days (pgBackRest, Wave 4) | Eligible deletion records persist until backup expiry — see §3 |

## 1. Per-table retention (live state)

The list below mirrors `EXPORT_TABLES` in
[account.service.ts](../../src/modules/account/account.service.ts).

| Table | Holds | Live retention | Justification |
|---|---|---|---|
| `users` | Email, name, password hash, MFA artefacts, plan | Indefinite | Account exists |
| `sessions` | Bearer tokens (hashed), userAgent, IP | Token TTL (7d) | Auth lifecycle |
| `password_reset_tokens` | Single-use bearer | Hours | Reset flow |
| `subscriptions` | Stripe linkage, plan, period | Indefinite while active; 7 years after cancellation | Tax / billing reconciliation |
| `audit_logs` | Security-relevant events | 2 years | Incident investigation, SOC 2 evidence |
| `ai_usage` | Per-call cost accounting (no payloads) | 1 year | Billing reconciliation, fraud detection |
| `workflows`, `workflow_runs` | Definitions + execution logs | Free 7d / Pro 30d / Business 90d (run-retention cron) | Cost vs debuggability |
| `gateways`, `user_plugins` | User-authored bot config | Indefinite while account active | Active dependency |
| `projects`, `project_resources` | Workspace contents | Indefinite while account active | Active dependency |
| `workspace_containers`, `workspace_audit_logs` | Container state, lifecycle events | Container row indefinite; audit 2 years | Active dependency / forensics |
| `cursor_*` | Chat history, agent memory, preferences | Indefinite while account active; user can clear in UI | Personalisation |
| `support_tickets`, `ticket_messages` | Customer conversations | 3 years | Support history |
| `kb_articles`, `plugin_reviews` | User-generated content | Indefinite while account active | Content remains attributed to anonymised author after deletion |
| `org_invites` | Pending invitations | 7 days; then auto-expire | Inviter is responsible for re-issuing |

Any model not listed above is implicitly "indefinite while parent row
exists, deleted on cascade." If you add a new user-tied model, you must
also update this table and `EXPORT_TABLES`.

## 2. The deletion lifecycle

```
Active account ── requestDeletion ──▶ Soft-deleted (deletedAt set, isActive=false)
                                      │
                                      │  30-day grace window
                                      │  (cancelDeletion possible)
                                      ▼
                    Anonymisation cron ──▶ Tombstone (anonymizedAt set)
                                            │
                                            │  Live PII has been scrubbed
                                            │
                                            ▼
                                     [retained for FK integrity]
```

Concretely, **at anonymisation**:

- Cleared on `users`: email (replaced with placeholder), name, image,
  passwordHash, all MFA fields.
- Deleted entirely: `sessions`, `password_reset_tokens`.
- Deleted via cascading FKs from `users.id`: nothing — we do *not*
  cascade-delete projects/workflows/etc, because the records may have
  been transferred to an organisation that the user belonged to. The
  exception is sessions/reset tokens, which are clearly scoped to the
  user.
- Retained: `subscriptions`, `audit_logs`, anything with a billing or
  compliance retention obligation.

## 3. Backups vs deletion

A user who deletes their account today still has their data inside
backups for **up to 30 days** (the pgBackRest retention configured in
Wave 4). This is a documented limitation and must be disclosed in the
privacy policy. Two consequences:

- A subject-rights "right to erasure" request gets a fully-completed
  reply 30 days *after* anonymisation, when the last backup containing
  their pre-anon data has expired.
- Restoring from a 30-day-old backup must check the pre-existing
  `anonymized_at` for any user already past the grace window — see
  the post-restore steps in [db-restore.md](db-restore.md).

## 4. AI provider data

We use third-party LLM providers (Anthropic, OpenAI, Together,
Fireworks, OpenRouter, Vertex). Each may retain user prompts/responses
under their own policy:

- Anthropic: 30-day retention by default; on Workspaces with
  zero-retention configured, no retention.
- OpenAI: 30-day retention by default (zero-retention available on
  enterprise plans).
- Together / Fireworks / OpenRouter: see each provider's policy.
- Vertex (Gemini): no training on data when used via Vertex AI Studio.

If you change providers, update this section and verify the privacy
policy still matches.

## 5. Review cadence

Quarterly. The reviewer must:
- Reconcile `EXPORT_TABLES` against `prisma/schema.prisma` (any new
  user-tied table?).
- Verify the run-retention cron (configurable per-plan) is enabled in
  prod and last ran without errors.
- Confirm AI providers' retention has not regressed.
- Confirm backup expiration is enforced (no backups older than the
  policy window).
