# Contributing to 2bot

This document covers what we ask of every contributor and the
non-obvious architectural decisions you'll need to know before you
touch the code.

> **For ops/security runbooks** see [docs/operations/](docs/operations/).
> This file is the developer-onboarding companion.

---

## 1. Getting started

```bash
# 1. clone + install
git clone <repo>
cd 2bot
pnpm install            # or npm install --legacy-peer-deps
                        # (legacy-peer-deps because tree-sitter-typescript
                        #  has a peer-dep mismatch with tree-sitter@0.25;
                        #  npm ci handles it, npm install needs the flag)

# 2. install git hooks (gitleaks pre-commit)
make install-hooks

# 3. set up .env files
cp .env.example .env.local
# fill in secrets — see docs/operations/secrets.md if any are missing

# 4. start infra + dev servers
make docker-up
make db-setup           # first time only
make dev                # Next.js on :3000, Express on :3002
```

If you're new to a sub-area, the right onboarding doc is the relevant
runbook in `docs/operations/`. For example: working on workspace
containers? Read `docs/operations/workspace-hardening.md` first.

---

## 2. Pull request workflow

### 2.1 Branching

- `main` is the trunk and is always deployable.
- Feature branches off `main`: `feat/short-description`,
  `fix/short-description`, `chore/...`, `docs/...`.
- One PR = one logical change. Bundle pure renames separately from
  behaviour changes.

### 2.2 What we expect on every PR

- ✅ `npm run test:run` passes locally
- ✅ `npx tsc --noEmit` passes locally
- ✅ `npm run lint` passes (or only warns)
- ✅ A test that proves the new behaviour, OR a written justification
  in the PR description if the change is genuinely untestable
- ✅ If the change touches a security boundary (auth, MFA, gateway
  signatures, workspace isolation, billing webhook), call it out in
  the description with a checklist of what you considered

CI runs the same checks; passing locally first means a faster review.

### 2.3 Reviewing

- Default reviewer: the [CODEOWNERS](.github/CODEOWNERS) entry for the
  touched paths.
- Two-person rule for: anything in `src/lib/encryption.ts`,
  `src/lib/jwt.ts`, `src/server/middleware/`, `src/modules/auth/`,
  `prisma/migrations/`, `src/server/routes/stripe-webhook.ts`,
  `docker-compose.yml`, anything in `nginx/`. Otherwise one approval is
  enough.

### 2.4 Commit messages

Imperative mood, present tense, < 72 chars on the subject. We don't
enforce conventional-commits but consistent prefixes (`feat:`, `fix:`,
`chore:`, `docs:`, `refactor:`, `test:`) make changelog work easier.

---

## 3. Code style

- TypeScript strict mode is on, including `noUncheckedIndexedAccess`.
  Don't `// @ts-ignore` — fix the type. There's literally one
  `@ts-ignore` in the whole tree, keep it that way.
- Validate at boundaries with **zod** schemas. Trust internal types.
- Don't add comments that restate what code does. Comments explain
  *why* something is non-obvious.
- Custom errors live in `src/shared/errors`. Throw the right one;
  the global error handler maps to the HTTP response.
- Logs go through `pino` via `src/lib/logger.ts`. Don't `console.log`.
  The logger redacts a curated list of sensitive keys (see
  [src/lib/logger.ts](src/lib/logger.ts)) — if you add a new field
  that holds a token/code/secret, **add it to `REDACT_PATHS`**.

---

## 4. Architecture decisions you need to know

### 4.1 Next.js + Express dual surface (Wave 6.5 decision)

The repo runs **two** HTTP servers:

- **Next.js** (`src/app/`) — pages, the React frontend, and a small set
  of `src/app/api/*` Route Handlers
- **Express** (`src/server/`) — the long-lived API: auth, billing,
  gateways, workflows, plugins, workspaces, websockets, BullMQ
  producers/consumers

The split exists because Next.js 16 doesn't fit the long-lived stateful
needs (open WebSockets, BullMQ workers, dockerode connections). We
keep both because rewriting the API as Next-only would be a
multi-month migration without delivering customer value.

**Default for new code:**

- A new **business logic** endpoint → goes in `src/server/routes/` and
  the matching `src/modules/<domain>/` service.
- A new **page-supporting BFF** endpoint that just queries the DB to
  hydrate a page → can go in `src/app/api/` if it has no long-lived
  state and won't outlive the request.
- WebSockets, cron, BullMQ producers/consumers, dockerode → **always**
  Express.

If you're adding a route and it's not obvious which side it belongs
on, default to Express. Moving a route from Express to Next-API later
is cheap; the reverse is not.

### 4.2 The org-scoping defence-in-depth (Wave 1.2)

The `x-organization-id` header is user-controlled. **Three layers**
guard against an IDOR:

1. Global `requireOrgHeaderMembership` middleware (defense-in-depth)
2. Per-router `.use(requireOrgHeaderMembership)` after `requireAuth`
   (primary enforcement — runs *after* `req.user` is populated)
3. `getValidatedOrgId(req)` helper that throws if the header is set
   but `req.orgMembership` wasn't validated

**Never read `req.headers["x-organization-id"]` directly.** Use
`getValidatedOrgId(req)`. The helper makes a forgotten middleware
mount fail loudly instead of becoming a silent escalation.

See [src/server/middleware/org-auth.ts](src/server/middleware/org-auth.ts).

### 4.3 Workspace containers and the DinD blast radius (Wave 3)

User code runs inside Docker containers managed by
[src/modules/workspace/workspace-docker.service.ts](src/modules/workspace/workspace-docker.service.ts).
A container escape would compromise every other tenant on the host.

- The default cap set is over-permissive for backwards compat. **Don't
  add to it.** If you genuinely need a new cap, prove it under
  `WORKSPACE_CAP_ADD=""` in staging first.
- `Privileged: false` and `SecurityOpt: ['no-new-privileges:true']`
  are non-negotiable.
- The Docker socket should be replaced with `tecnativa/docker-socket-proxy`
  in production. Set `DOCKER_HOST=tcp://2bot-docker-proxy:2375`.

Full details: [docs/operations/workspace-hardening.md](docs/operations/workspace-hardening.md).

### 4.4 Polymorphism via `kind` discriminator

The `ProjectResource` model uses a string `kind` column to discriminate
between HTTP routes, schedules, secrets, databases, external APIs,
etc. The codebase is in transition from runtime kind-switches to a
typed handler registry — see
[docs/operations/project-resource-handler-migration.md](docs/operations/project-resource-handler-migration.md).

When adding a new kind, follow the registry pattern, not the switch
pattern.

### 4.5 At-rest encryption with key versioning

Sensitive credentials (TOTP secrets, gateway tokens, integration API
keys, BYO database URLs) are encrypted at rest via
[src/lib/encryption.ts](src/lib/encryption.ts) using AES-256-GCM with
a versioned key envelope (`v2:<keyVersion>:<base64>`).

- Always `encrypt()` user-supplied secrets before storing.
- Read with `decrypt()` or `decryptIfEncrypted()` (the latter
  tolerates legacy plaintext during migrations).
- Key rotation is supported via `ENCRYPTION_KEY_VERSION` + historical
  `ENCRYPTION_KEY_V<N>`. **Never naively rotate `ENCRYPTION_KEY`
  without a re-encrypt migration** — it would orphan all existing
  ciphertext. See [docs/operations/secrets.md](docs/operations/secrets.md).

---

## 5. Testing

We have two test suites:

- **Unit tests:** `npm run test:run` — mocked Prisma, runs in seconds.
  This is what CI runs and what every PR must pass.
- **Integration tests:** `npm run test:integration` — real Postgres
  via the `2bot_test` database. Run before merging anything that
  touches a Prisma query path.

**Test infrastructure:**

- `vitest.config.ts` for unit, `vitest.integration.config.ts` for
  integration (gated on `*.integration.test.ts` filename glob).
- `src/test-helpers/integration-setup.ts` exposes `cleanDatabase()`,
  `seedTestUsers()`, and `setupIntegrationTest()`.

**Test patterns to copy from:**

- Mocked Prisma + service: `src/modules/credits/__tests__/credit.service.test.ts`
- Real-Postgres integration: `src/modules/workflow/__tests__/workflow.service.integration.test.ts`
- Stripe mock with `vi.hoisted` (note the `function`-not-arrow trick):
  `src/server/routes/__tests__/stripe-webhook.test.ts`
- Real-crypto signature verification: `src/server/routes/__tests__/webhook-signatures.test.ts`

---

## 6. Adding new things

### A new module (`src/modules/<name>/`)

```
<name>/
  <name>.service.ts        # business logic
  <name>.types.ts          # types and interfaces
  <name>.validation.ts     # zod schemas (if applicable)
  index.ts                 # barrel — only export the public API
  __tests__/<name>.service.test.ts
```

Don't reach into another module's internals — go through its barrel.

### A new route

1. Add the route handler to `src/server/routes/<area>.ts`.
2. Wire it into [src/server/routes/index.ts](src/server/routes/index.ts).
3. Add a zod schema to validate the request body / query / params.
4. Audit-log mutating operations (`auditActions.*` from
   [src/lib/audit.ts](src/lib/audit.ts)).
5. If the route reads `x-organization-id`, use `getValidatedOrgId(req)`
   — see §4.2.

### A new Prisma migration

1. Edit `prisma/schema.prisma`.
2. `make db-migrate` (auto-generates a SQL file).
3. Hand-review the generated SQL. Add comments. Rename the file to
   `YYYYMMDDHHMMSS_descriptive_name`.
4. Apply to `2bot_test` before running integration tests.

### A new metric

[src/lib/metrics.ts](src/lib/metrics.ts) declares all collectors. Add
yours under the matching section (HTTP / Workflow / Workspace / etc.)
and add it to one of the dashboards in
[docs/operations/dashboards/](docs/operations/dashboards/) so it's
actually viewable.

---

## 7. Security responsibilities

If you find a security issue:
- **External**: email security@2bot.org. Don't open a public issue.
- **Internal**: open a private security incident — see
  [docs/operations/breach-response.md](docs/operations/breach-response.md).

The two-person review rule (§2.3) exists precisely for the files that
fail an audit review badly. Don't skip it.

---

## 8. Where to ask

- Architecture: post in the engineering channel, tag the relevant
  CODEOWNER.
- Specific module: see the relevant `docs/operations/*` runbook for
  the on-call owner.
- Tooling / build / CI: anyone on platform.
