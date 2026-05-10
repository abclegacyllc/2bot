# Data Protection Impact Assessment (DPIA) — 2bot Platform

Status: **draft v1.** Reviewed by: pending. Last update: 2026-05-08.

This DPIA documents 2bot's processing of personal data, the risks that
processing creates for data subjects, and the mitigations we have in
place. It is required by GDPR Article 35 because we process personal
data using automated systems at scale, including AI inference on user
inputs.

---

## 1. Description of the processing

### 1.1 Nature

2bot is a multi-tenant SaaS platform that lets users build chatbots,
workflows, and AI-driven automations. Personal data is processed at
three layers:

- **Account layer.** Email, name, password hash, MFA artefacts, login
  history, plan/billing details. Stored in our own Postgres instance.
- **Tenant content.** Workflows, gateway configs, plugin code, files in
  user-controlled workspace containers. Stored in our Postgres + on
  per-user container filesystems.
- **AI inference.** End-user prompts (and the upstream user's chat
  history when a tenant builds a chatbot) are forwarded to third-party
  LLM providers (see [data-retention.md](data-retention.md) §4).

### 1.2 Scope and context

- **Categories of subjects.** Tenant administrators (paying customers),
  team members within those tenants, end-users who interact with bots
  the tenants have built. The third group is the highest-volume and
  the one with the least direct relationship to 2bot.
- **Categories of data.** Identifiers (email, name, IP), authentication
  artefacts (password hash, TOTP secret, recovery codes — encrypted at
  rest), service usage (workflow runs, audit log), conversational
  content (prompts/responses; not stored beyond cache TTL).
- **No special-category data is processed by 2bot directly.** Tenants
  may, in theory, process such data via their bots; that is governed
  by the tenant's own DPIA, not this one. Our terms forbid processing
  of GDPR Art. 9 categories without prior written agreement.

### 1.3 Purposes

- Operating the SaaS (account management, workflow execution).
- Billing.
- Security monitoring and abuse prevention.
- Improving the product (aggregate usage analytics — never per-user
  tracking, never sold).

### 1.4 Recipients

- 2bot internal infrastructure.
- Subprocessors: Stripe (billing), Resend (transactional email),
  Cloudflare (CDN/DDoS), AI providers (inference). Full list in the
  privacy policy.

---

## 2. Necessity & proportionality

| Data | Why we need it | Could we do without? |
|---|---|---|
| Email | Account identity + transactional email | No — also serves password reset |
| Password hash | Authentication | Could outsource to Auth0/Clerk; in scope for a future review |
| TOTP secret | Step-up auth | Optional; users opt in |
| IP address | Rate limiting + audit | We could hash but loses forensic value |
| Bot conversation content | Necessary for bot operation | No |
| Per-call AI cost | Billing | No |

We do not collect data we do not use. The export endpoint
([account.service.ts](../../src/modules/account/account.service.ts))
is the inventory: every category of personal data we hold is in the
export.

---

## 3. Risks to data subjects

The risks below are catalogued by likelihood × severity. Reassessed
quarterly or when the platform's risk surface materially changes.

### 3.1 Risk register (top items)

| # | Risk | Likelihood | Severity | Pre-mitigation residual |
|---|---|---|---|---|
| 1 | Account takeover via password reuse | Medium | High | Exposes all tenant data |
| 2 | Cross-tenant IDOR | Low (after Wave 1.2) | High | Disclosure of one tenant's data to another |
| 3 | Workspace container escape to host | Low (after Wave 3) | Critical | Disclosure across all tenants |
| 4 | Leaked production secret | Was Critical pre-Wave 0; Low post | Critical | Total compromise |
| 5 | AI provider mishandling prompts | Low | Medium | Loss of confidentiality of prompt content |
| 6 | Loss of availability (DB / DR) | Low | High | Cannot serve customers; data loss possible |
| 7 | Internal abuse (admin reads tenant data) | Low | High | Confidentiality breach without external attacker |

### 3.2 Mitigations in place

The numbers below reference the items above.

- **#1 Account takeover.** bcrypt cost-12 password hashing. TOTP MFA
  (Wave 2.1, opt-in; per-org enforcement landing next). Login attempts
  are rate-limited (Wave 1.3) with sensitive routes failing closed when
  the limiter is degraded.
- **#2 Cross-tenant IDOR.** Org-scoping is now middleware-default
  (Wave 1.2). Routes that read `x-organization-id` directly use the
  `getValidatedOrgId(req)` helper that throws if membership wasn't
  verified, so a forgotten middleware mount fails loudly.
- **#3 Workspace escape.** Containers run as non-root, with
  `CapDrop: ALL` and a curated `CapAdd` set. Wave 3 adds per-container
  resource caps, runtime sandbox (gVisor on free tier), and replaces
  the docker.sock with a read-mostly proxy. **Open risk pending Wave 3.**
- **#4 Secrets.** Pre-commit gitleaks + CI gitleaks
  ([secrets.md](secrets.md)). All on-disk secrets are scheduled for
  rotation (Wave 0). Encryption at rest for TOTP secrets (and
  user-provided integration credentials) via AES-256-GCM with key
  versioning.
- **#5 AI provider leakage.** Provider list and retention noted in
  [data-retention.md](data-retention.md) §4. We do not include user
  identifiers in prompts. Workspaces with zero-retention configurations
  are preferred where the contract allows it.
- **#6 Availability.** Wave 4 brings pgBackRest + WAL streaming with
  off-site backups, RTO 1h / RPO 5min, quarterly restore drills. **Open
  risk pending Wave 4.**
- **#7 Internal abuse.** Every admin action is audit-logged
  ([src/lib/audit.ts](../../src/lib/audit.ts)). Admin role is gated
  behind an explicit `admin-guard` middleware; admin endpoints are
  separated from the user-facing API. Background: SOC 2-style access
  reviews are not yet established (in scope for a future wave).

### 3.3 Residual risk (post-Wave 2)

After Waves 0–2, the remaining material risks are #3 and #6 above.
Wave 3 addresses #3; Wave 4 addresses #6. We do not consider it safe
to enable customer-facing GDPR-deletion in production until Wave 4
backups are running, because the 30-day backup retention versus 30-day
deletion grace window must be coordinated.

---

## 4. Subject rights

We support, via [account.service.ts](../../src/modules/account/account.service.ts):

- **Access / portability.** `GET /account/export` streams JSONL of
  every user-tied row. Self-service.
- **Rectification.** `PATCH /user/profile` (existing). Self-service.
- **Erasure.** `POST /account/delete` schedules anonymisation in 30
  days. After backups expire (additional 30 days; Wave 4) the erasure
  is complete.
- **Restriction / objection.** Currently handled manually via
  `support@2bot.org`. Programmatic interface is not on the roadmap.

Response time SLA: 30 days, GDPR-mandated.

---

## 5. Sign-off

The DPIA must be signed by the platform/security lead and (when we
have one) the DPO before MFA-required-by-default is rolled out to any
external customer. This document is currently a draft; v1 sign-off is
the next milestone after Wave 2 lands in production.

| Role | Name | Date | Notes |
|---|---|---|---|
| Platform / security lead | TBD | TBD | |
| DPO | n/a | n/a | DPO not yet appointed |
| Founder | TBD | TBD | |

---

## 6. Review schedule

- Quarterly default review.
- Triggered review when: new subprocessor, new data category, new
  risk surface (workflow that processes special-category data,
  expansion to a new jurisdiction).
