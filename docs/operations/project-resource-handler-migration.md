# ProjectResource Handler-Registry Migration Plan

Status: **infrastructure shipped, route adoption pending.** Last review: 2026-05-09.

The `ProjectResource` model uses a string `kind` discriminator
(`HTTP_ROUTE`, `SCHEDULE`, `SECRET`, `EXTERNAL_API`, `DATABASE`,
`GATEWAY_BOT`) to support polymorphic resources. Phase 7's
implementation put all per-kind logic into a single 1.7k-line
[project-resource.service.ts](../../src/modules/project-resource/project-resource.service.ts)
with kind-switching scattered across `create*Resource`,
`update*Sidecar`, and dispatch helpers. The audit flagged this as
"polymorphic complexity" — a place where adding a new kind requires
edits across many call sites.

Wave 6.3's solution: a typed handler registry. The infrastructure has
landed; this doc explains how to migrate route handlers onto it.

---

## 1. What's already in place

```
src/modules/project-resource/kind-handlers/
├── types.ts            # KindHandler interface + CreateResourceInput / UpdateSidecarInput unions
├── registry.ts         # Map<ProjectResourceKind, KindHandler>
├── dispatch.ts         # dispatchCreate / dispatchUpdateSidecar — typed entry points
├── index.ts            # public barrel
├── gateway-bot.handler.ts
├── http-route.handler.ts
├── schedule.handler.ts
├── secret.handler.ts
├── external-api.handler.ts
├── database.handler.ts
└── __tests__/registry.test.ts   # 16 tests covering the dispatcher
```

Each handler today is a **thin wrapper** that re-exposes the
corresponding service helper through the `KindHandler` interface. So
calling `dispatchCreate(owner, { kind: "SECRET", input })` is
functionally identical to calling `createSecretResource(owner, input)`.

The win is at the **call site**: a single dispatcher with a typed
discriminated-union input, instead of an `if/else` ladder per kind.

---

## 2. The migration target

Today the route layer (e.g. `src/server/routes/project-resource.ts`)
likely has code like:

```ts
// before
if (kind === "HTTP_ROUTE") return createHttpRouteResource(owner, input);
if (kind === "SCHEDULE")   return createScheduleResource(owner, input);
if (kind === "SECRET")     return createSecretResource(owner, input);
// … six more …
```

After migration:

```ts
// after — one call, exhaustive, typed
return dispatchCreate(owner, { kind, input });
```

The route's zod schema is what produces the discriminated-union shape
the dispatcher expects.

---

## 3. Migration steps (per kind)

The migration is gradual on purpose. Don't migrate all six kinds in
one PR — any regression should be isolated to one kind at a time.

### Step 1 — pick a kind

Recommended order, easiest first:

1. **SECRET** — simple sidecar, well-tested, low blast radius
2. **SCHEDULE** — similar shape, runs through the schedule cron
3. **EXTERNAL_API** — sidecar with credentials, slightly more state
4. **DATABASE** — sidecar with credentials + connection probing
5. **HTTP_ROUTE** — most complex (path matching, target lookup, auth)
6. **GATEWAY_BOT** — last because deletion is special-cased

### Step 2 — locate the call sites

```bash
# Find every place the kind-specific function is called from outside
# the service module. These are the migration targets.
grep -rn "createSecretResource\|updateSecretSidecar" src/ | grep -v project-resource
```

### Step 3 — replace with `dispatchCreate` / `dispatchUpdateSidecar`

```ts
// before
import { createSecretResource } from "@/modules/project-resource/project-resource.service";
// …
const r = await createSecretResource(owner, input);

// after
import { dispatchCreate } from "@/modules/project-resource/kind-handlers";
// …
const r = await dispatchCreate(owner, { kind: "SECRET", input });
```

### Step 4 — write a test that hits the dispatcher

Mirror the pattern in
[src/modules/project-resource/kind-handlers/__tests__/registry.test.ts](../../src/modules/project-resource/kind-handlers/__tests__/registry.test.ts):
mock the service helper, call through the dispatcher, assert the
right helper was invoked with the right args.

### Step 5 — verify locally

```bash
npm run test:run                          # unit suite
npm run test:integration                  # if your kind has an integration test
make dev                                  # smoke
```

### Step 6 — open a PR titled `refactor(project-resource): route SECRET via dispatcher`

The PR diff should be small: one route file changed, one new test,
and possibly the corresponding zod schema simplified to a discriminated
union.

---

## 4. Internal handler logic migration (optional, later)

Once all six kinds dispatch through the registry, the **next** wave of
work is moving logic FROM the 1.7k-line service file INTO each
`<kind>.handler.ts`. The handler currently delegates back to the
service; the service is the implementation. Inverting that —
service helpers become thin wrappers around handler methods, then the
service helpers can be deleted — is a larger refactor that should be
its own quarter-plan.

The migration order is the same: SECRET first, GATEWAY_BOT last. The
file to gut is [project-resource.service.ts](../../src/modules/project-resource/project-resource.service.ts);
the target is each handler under
[src/modules/project-resource/kind-handlers/](../../src/modules/project-resource/kind-handlers/).

After that work is done:

```
project-resource.service.ts        ~200 LOC  (cross-kind operations only:
                                              listProjectResources, archive,
                                              rename, etc.)
kind-handlers/<kind>.handler.ts    ~150-300 LOC each
```

vs today:

```
project-resource.service.ts        1723 LOC  (everything)
kind-handlers/<kind>.handler.ts    ~30 LOC each (thin wrappers)
```

---

## 5. Marketplace plugins shipping custom kinds

The whole reason for this pattern is forward-compat: a marketplace
plugin should be able to ship a `MARKETPLACE_CUSTOM_KIND` and register
its handler at boot:

```ts
// hypothetical plugin boot
import { registerKindHandler } from "@/modules/project-resource/kind-handlers";

registerKindHandler({
  kind: "MARKETPLACE_AIRTABLE_TABLE" as ProjectResourceKind,  // requires Prisma enum extension
  hardDeleteAllowed: true,
  create: async (owner, input) => { /* ... */ },
  updateSidecar: async (owner, resourceId, input) => { /* ... */ },
});
```

Two pre-requisites:

1. **`ProjectResourceKind` is a Prisma enum.** Adding a new value
   means a migration. Marketplace plugins will need a "kind extension"
   API — out of scope for Wave 6.
2. **A handler for an unregistered kind throws ValidationError**, not
   a generic 500. The dispatcher already does this; verify the
   error formatter on your route surface returns 400 not 500 for
   `ValidationError`.

---

## 6. Why we're not done in one PR

Three reasons:

1. **Each kind has subtly different validation + sidecar shape.**
   Migrating SECRET first lets us notice "actually, my dispatcher
   contract didn't account for secrets needing transactional creation"
   *before* doing it five more times.
2. **Tests must keep passing.** A wholesale switch is a big diff
   that's hard to review and easy to roll back. Per-kind PRs are
   small.
3. **Production telemetry should validate each step.** After SECRET
   is migrated, watch `bot_http_requests_total{route="...secrets...",status="5.."}`
   for a week before moving to SCHEDULE.

---

## 7. Tracking

The Wave 6.3 progress lives in this doc. Update §3's recommended
order with status as kinds migrate:

- [ ] SECRET — migrated to dispatcher
- [ ] SCHEDULE — migrated to dispatcher
- [ ] EXTERNAL_API — migrated to dispatcher
- [ ] DATABASE — migrated to dispatcher
- [ ] HTTP_ROUTE — migrated to dispatcher
- [ ] GATEWAY_BOT — migrated to dispatcher
- [ ] Internal logic moved into handlers (separate quarter)
- [ ] `project-resource.service.ts` shrunk to cross-kind ops only
