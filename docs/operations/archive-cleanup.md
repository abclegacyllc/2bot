# `_archive_/` Cleanup Plan

Status: **plan ready, deletion not yet executed.** Last review: 2026-05-09.

`_archive_/` holds 2.2 MB of legacy code from earlier waves of
refactoring. It was kept "just in case" while migrations stabilised.
Wave 6.6 retires it.

This doc is the safety verification + the deletion plan. **Do not
delete the directory ad-hoc.** Run the verification first; only delete
once every check passes.

---

## 1. Inventory (as of 2026-05-09)

```
_archive_/
├── dashboard/                       # Old dashboard UI (replaced by src/app/(dashboard))
├── docs/                            # Old documentation
├── env-backups/                     # Old .env templates
├── modules/                         # Old module layout
├── modules_quota_pre-resource-rename/  # Pre-Phase-7 quota module
├── next-api-routes/                 # Old Next.js API routes (replaced by Express)
├── scripts/                         # One-off migration scripts already run
├── src/                             # Pre-refactor src/shared
└── workspace-old-names/             # Pre-Phase-13 workspace names
```

Total size: 2.2 MB. Roughly the size of a small dependency.

---

## 2. Pre-deletion safety checklist

Run each check; the deletion is safe iff **every** result is empty (or
expected).

### 2.1 No live source imports anything from `_archive_`

```bash
grep -rln "_archive_" src/ scripts/ 2>/dev/null | grep -v "^_archive_"
# Expect: only matches in scripts/deploy/backup-source.sh (a tar
# `--exclude` directive — that one is fine to keep / can be removed
# alongside the deletion).
```

### 2.2 tsconfig already excludes `_archive_`

```bash
grep -nE '"_archive_"' tsconfig.json
# Expect: line 62 in tsconfig.json (already there).
```

### 2.3 Nothing in CI / Makefile / docker-compose references it

```bash
grep -rln "_archive_" .github/ Makefile docker-compose.yml Dockerfile* 2>/dev/null
# Expect: empty.
```

### 2.4 No imports leak in via lockfile or generated artefacts

```bash
grep -rln "_archive_" .next/ node_modules/.prisma 2>/dev/null
# Expect: empty (or .next references that get rebuilt).
```

### 2.5 Confirm CI passes without `_archive_`

```bash
mv _archive_ /tmp/_archive_-staged
npm run test:run            # full unit suite
npm run test:integration    # integration suite
npx tsc --noEmit            # typecheck
npm run lint                # lint
mv /tmp/_archive_-staged _archive_  # put it back until commit
```

If all four pass, the directory has no live dependents.

---

## 3. Deletion procedure

Once §2 passes:

```bash
# 1. One commit, just the removal — easier to revert.
git rm -r _archive_/

# 2. Drop the now-redundant tar exclude in scripts/deploy/backup-source.sh
#    (tar handles missing paths fine, but keep the script tidy).

# 3. Drop the now-redundant tsconfig exclude:
#    "exclude": ["...", "_archive_", ...]

# 4. Commit.
git commit -m "chore: remove _archive_/ — Wave 6.6 cleanup

The directory accumulated during the Phase 5/7/13 refactors and
has had no live dependents since [date of last move into it]. CI
passes with it removed; verification steps in
docs/operations/archive-cleanup.md.

Co-Authored-By: ..."
```

> Why we don't just `rm -rf` it locally and force-push: the directory
> may be referenced from old PR branches or stash entries that other
> contributors are still rebasing. A normal commit lets git's
> reflog + branch protection do their work; if anyone needs the old
> contents, `git checkout <pre-removal-commit> -- _archive_/` brings
> them back.

---

## 4. After-deletion verification

```bash
# CI green on the PR
# After merge:
git pull
npm ci --legacy-peer-deps
npm run test:run
make dev    # smoke
```

If anything depended on `_archive_/` that we missed, the test suite
will catch it before merge. The git reflog protects against the
"merged + something in production turned out to need it" case for at
least 90 days (the default reflog horizon).

---

## 5. What to keep (don't move into `_archive_/` instead — delete or
keep in tree)

The `_archive_/` pattern was useful during in-flight refactors. Going
forward, prefer:

- **Dead code:** delete it. `git log` + reflog give you the recovery path.
- **In-flight refactors:** keep both old + new in `src/` behind a
  feature flag. Once the flag rolls out, delete the old path
  immediately.
- **Migration scripts that have already been run in prod:** delete
  after one or two soak windows. Scripts that *might* be re-run
  (idempotent fix-up) belong in `scripts/`, not `_archive_/`.

The point: archive directories grow forever. Either it's a real path
in `src/` or it's gone.
