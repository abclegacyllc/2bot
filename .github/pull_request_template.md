<!--
Thanks for the PR. A few asks before you hit Submit:
  1. Title: imperative, < 72 chars (e.g. "fix: stop double-charging on
     plan downgrade"). The body is the right place for detail.
  2. If this is a security-relevant change (auth, MFA, gateway
     signatures, workspace caps, billing), tick the security
     section below — don't delete it.
  3. Two-person review for the paths in CONTRIBUTING.md §2.3.
-->

## Summary

<!-- 1-3 bullets — what changed and why. The "why" matters more than the "what". -->

-
-

## Test plan

<!-- How did you verify this works? -->

- [ ] Unit tests added / updated (`npm run test:run`)
- [ ] Integration tests run if this touches Prisma / DB (`npm run test:integration`)
- [ ] Manual smoke test (describe what you did)
- [ ] N/A — pure docs / refactor / config — explain why no test:

## Risk & rollback

<!-- One sentence per row. -->

- **Blast radius:** which users / tenants / surfaces this affects
- **Rollback path:** how to undo if it breaks (revert the commit?
  flip a flag? run a migration?)
- **Soak window:** does this need to bake on staging before going live?

## Security checklist

<!-- Tick each item or leave a `~~strikethrough~~ N/A because ...` -->

- [ ] No new secrets committed (gitleaks pre-commit will catch most;
      double-check `.env*` files weren't accidentally added)
- [ ] If a route reads `x-organization-id`, it uses `getValidatedOrgId(req)`
- [ ] If a route writes, it has a zod schema for the request body
- [ ] If this stores user-supplied secrets, they're `encrypt()`ed at rest
- [ ] If this adds a new field that holds a token/code/secret, it's
      added to `REDACT_PATHS` in `src/lib/logger.ts`
- [ ] If this changes the workspace container HostConfig, the change
      is documented in `docs/operations/workspace-hardening.md`
- [ ] If this is a destructive migration (DROP / ALTER NOT NULL on a
      populated column), there's a backfill plan in the description

## Linked issues / context

<!-- e.g. "Closes #123", "Relates to docs/operations/...md", or
     a Sentry / incident link. -->

-
