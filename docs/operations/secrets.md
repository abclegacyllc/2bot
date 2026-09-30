# Secrets — Rotation, Storage, History Hygiene

Status: **Wave 0 of the security remediation roadmap.** This document
tracks (1) the leaked-secret inventory we found in the audit, (2) the
provider-by-provider rotation steps, (3) the git-history rewrite plan,
and (4) the long-term storage policy.

> **Owner:** platform/security lead. Review every quarter.

---

## 1. Inventory of leaked secrets

Found by audit on 2026-05-07. Two exposure tiers:

### Tier A — leaked into git history (irreversible without rewrite)

| Secret | Where in history | How |
|---|---|---|
| Postgres password `2BotDevPg2026Secure` | commits `fbf7ffd`, `b3f1c8b` | hardcoded as `DATABASE_URL` fallback in 3 scripts |
| JWT signing secret literal `2bot-super-secret-key-for-jwt-tokens-min-32-chars` | commits `fbf7ffd`, `b565d74` | hardcoded as `JWT_SECRET` fallback in 2 smoke-test scripts |

Both fallbacks have been removed from the working tree (Wave 0 patch).
The literals **still exist in old commits** until we rewrite history.

### Tier B — present only in `.env.local` on disk (never committed)

`.env.local` is gitignored. None of the values below appear in `git log
-S<value>` results. They still need rotation because they live in plain
text on disk and have likely been pasted into shells, copied to other
machines, etc.

- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, future `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `TWOBOT_OPENAI_API_KEY`, `TWOBOT_ANTHROPIC_API_KEY`,
  `TWOBOT_TOGETHER_API_KEY`, `TWOBOT_FIREWORKS_API_KEY`,
  `TWOBOT_OPENROUTER_API_KEY`
- `TWOBOT_VERTEX_AI_SERVICE_ACCOUNT` (full GCP service-account JSON
  including private key — highest priority of the Tier-B set)
- `SYSTEM_TELEGRAM_BOT_TOKEN`
- `POSTGRES_PASSWORD` (same value as Tier A; rotate once, fix both)

---

## 2. Rotation runbook

Order matters: rotate **dependents first** (anything that talks to a
service whose key is changing, so you don't lock yourself out), then
rotate the upstream key. For this repo the dependency graph is shallow
— almost everything is "rotate at provider, paste new value into
`.env.local`, restart services."

For each row: do the action, paste the new value into `.env.local`,
restart the relevant process, verify, then revoke the old key.

| # | Secret | Where to rotate | Verification |
|---|---|---|---|
| 1 | `TWOBOT_VERTEX_AI_SERVICE_ACCOUNT` | GCP IAM → service account → keys → create new key, **then** delete old key | hit any AI route that uses Vertex; check no 401 in logs |
| 2 | `STRIPE_SECRET_KEY` (test) + `STRIPE_PUBLISHABLE_KEY` (test) | Stripe dashboard → developers → API keys → roll | `make dev`, hit checkout flow, confirm webhook still verifies |
| 3 | `RESEND_API_KEY` | Resend dashboard → API keys → revoke + create | trigger any transactional email; check delivery |
| 4 | `TWOBOT_ANTHROPIC_API_KEY` | console.anthropic.com → API keys → revoke + create | hit a chat route; confirm 200 |
| 5 | `TWOBOT_OPENROUTER_API_KEY` | openrouter.ai → keys → revoke + create | as above |
| 6 | `TWOBOT_TOGETHER_API_KEY` | together.ai → settings → API → revoke + create | as above |
| 7 | `TWOBOT_FIREWORKS_API_KEY` | fireworks.ai → settings → API → revoke + create | as above |
| 8 | `SYSTEM_TELEGRAM_BOT_TOKEN` | @BotFather `/revoke` then `/token` | trigger a system alert |
| 9 | `POSTGRES_PASSWORD` (= `DATABASE_URL` password) | `ALTER USER postgres WITH PASSWORD '<new>';` then update `.env`, `.env.local`, `docker-compose.yml`, restart Postgres + app | `make dev`, login, basic CRUD |
| 10 | `JWT_SECRET` + `JWT_REFRESH_SECRET` | generate `openssl rand -base64 64` for each, paste new values | **all sessions invalidated** — communicate before doing this |
| 11 | `ENCRYPTION_KEY` | **DO NOT rotate naively** — anything encrypted with the old key needs to be re-encrypted first. Plan a separate migration before rotating this one. | run encryption tests after migration |

Tip: keep the old key alongside the new for ~5 minutes only, just long
enough to verify; then revoke. Don't leave both active overnight.

---

## 3. Git history rewrite plan (Tier A)

Goal: remove the two leaked literals from every commit in every branch.

> **Stop before doing this** if any of the following are true:
> - The repo has external mirrors / forks / public clones we haven't
>   accounted for. (For 2bot it's a private repo, so safe.)
> - Open PRs from collaborators are unmerged. Rewriting history will
>   force them to rebase.
> - You haven't rotated the leaked secret yet. The rewrite is a
>   defense-in-depth measure; **rotation is the actual fix**.

### Approach: `git-filter-repo` (preferred) or BFG

We'll use `git-filter-repo` because BFG is no longer recommended and
filter-repo handles the patterns more cleanly.

```bash
# 1. Make sure you have a fresh mirror clone — filter-repo refuses
#    to operate on a working tree by default.
cd /tmp
git clone --mirror git@github.com:<org>/2bot.git 2bot.git
cd 2bot.git

# 2. Author a replacements file that maps each leaked literal to
#    a redacted placeholder.
cat > /tmp/replacements.txt <<'EOF'
2BotDevPg2026Secure==>***REDACTED-PG-PASSWORD***
2bot-super-secret-key-for-jwt-tokens-min-32-chars==>***REDACTED-JWT-SECRET***
EOF

# 3. Run the filter. --replace-text rewrites blob contents wherever
#    the literal appears. This rewrites commit hashes for every
#    affected commit and every commit downstream of it.
git filter-repo --replace-text /tmp/replacements.txt

# 4. Inspect result. The literal should now appear nowhere.
git log -p --all -S"2BotDevPg2026Secure" | head      # should be empty
git log -p --all -S"2bot-super-secret-key-for-jwt-tokens" | head

# 5. Force-push the rewritten history. THIS IS DESTRUCTIVE.
#    Coordinate first: every collaborator must re-clone or run
#    a guided rebase. See "Collaborator rebase" below.
git push --force --all
git push --force --tags
```

### Collaborator rebase (after force-push)

Each collaborator with a working clone runs:

```bash
# Save uncommitted work
git stash -u

# Re-fetch the rewritten history
git fetch --all --prune
git reset --hard origin/main          # or whichever branch
git stash pop || true                  # restore work-in-progress
```

Open feature branches: `git rebase --onto origin/main <old-base> <branch>`.

### Soak window

After the rewrite:
- Watch CI for at least 24h (gitleaks job should now pass cleanly).
- Run `git log --all -S<literal>` weekly for a month.
- If any provider key was leaked in history, **the rotation in section 2 is what protects you**, not the rewrite. Keep the rotation evidence (timestamps + ticket links) on file.

---

## 4. Long-term secret storage

Until Wave 0 we share secrets via `.env.local` files copied between
machines. That worked for one developer; it does not scale. We will
adopt one of:

- **sops + age** — encrypt `.env.production` and check the encrypted
  file in. Each developer has an age key authorised in `.sops.yaml`.
  Decryption is offline; no third-party SaaS dependency.
  Recommended for our size.
- **Doppler** — SaaS secrets manager, pulls into the runtime via CLI.
  Simpler UX but adds a vendor dependency.

Decision deferred; the rotation in section 2 must complete first
because both options need *new* secrets to seed.

Whichever we pick, the policy is:
- `.env.local` continues to exist for local dev only.
- Production secrets never touch developer laptops in plain text.
- CI gets secrets via GitHub Actions encrypted secrets (already in use
  for the deploy workflow).
- Pre-commit hook (`make install-hooks`) and CI gitleaks job catch
  accidental new leaks.

---

## 5. Quick reference — commands

```bash
make install-hooks          # one-time setup on each clone
make scan-secrets           # ad-hoc gitleaks scan of the working tree
gitleaks protect --staged   # what the pre-commit hook runs (if installed)
```

---

## 6. Telegram webhook secret relocation (one-off)

Until 2026-09-30 the Telegram `secret_token` (the only check on inbound
`POST /webhooks/telegram/:gatewayId`) sat in `Gateway.config` as plaintext
JSON, so `GET /gateways/:id` and the account export returned it. It now
lives inside the encrypted credentials blob (`TelegramBotCredentials.
webhookSecretToken`). Every reader falls back to the old location, and the
provider moves the value across on each gateway's next reconnect, so the
deploy itself needs no data step. Run the script once afterwards to close
the gap for gateways that never reconnect, then the fallback can go:

```bash
DRY_RUN=1 npx tsx scripts/migrate-telegram-webhook-secret.ts   # report only
npx tsx scripts/migrate-telegram-webhook-secret.ts             # move + strip plaintext
```

It needs the same `DATABASE_URL` and encryption key env as the API. Rows it
cannot decrypt are reported and left untouched (exit code 1).
