# Rotate the JWT Signing Key

Status: **active.** Last review: 2026-05-08. Owner: platform on-call.

Rotation logs everyone out. Pick a low-traffic moment and announce in
advance unless this is a security-incident response (in which case you
do it immediately and inform afterward).

> **Use this when:** the key was leaked, the key is older than your
> rotation policy (we recommend annually for `JWT_SECRET`, every 6
> months for `JWT_REFRESH_SECRET`), or after a Wave 0 history rewrite
> so the leaked literal is genuinely worthless.

---

## 1. Pre-flight

```bash
# 1. Confirm current key is the one you think it is.
echo "$JWT_SECRET" | sha256sum

# 2. Generate the new key. Keep this in a secrets manager BEFORE deploying.
openssl rand -base64 64

# 3. Decide blast radius. By default we have NO multi-key support
#    (verifyToken in src/lib/jwt.ts uses a single secret). That means:
#      - Every issued token instantly becomes invalid.
#      - Every WebSocket connection drops.
#      - Every active workflow run on a token-authenticated trigger
#        keeps running (workers don't re-validate mid-run).
#    Total impact is ~1s of "log in again" UX for every active user.
```

If you need a graceful rotation that keeps old tokens valid for a soak
window, see §5 — that requires a small code change first (multi-key
support).

---

## 2. Rotate

### 2.1 Quick swap (forces logout)

```bash
# 1. Update the secret in your secret manager.
# 2. Update .env.local (or however you inject env in prod).
JWT_SECRET="<new value from openssl rand>"

# 3. Restart the API server.
make restart-api

# 4. Verify the deploy. New logins should mint tokens; old tokens 401.
curl -fsS https://api.2bot.org/api/auth/me -H "Authorization: Bearer <old-token>"
# expect 401

curl -X POST https://api.2bot.org/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@2bot.org","password":"..."}'
# expect 200 + token

# 5. Smoke test that token works.
curl -fsS https://api.2bot.org/api/auth/me -H "Authorization: Bearer <new-token>"
# expect 200
```

Same for `JWT_REFRESH_SECRET` — restart, verify, done.

### 2.2 Things that should NOT also need rotating at the same time

- `ENCRYPTION_KEY` — separate key, separate ceremony. See
  [secrets.md](secrets.md) row 11. **Never naively rotate.**
- TOTP secrets — these are encrypted by `ENCRYPTION_KEY`, not signed by
  `JWT_SECRET`. Untouched.
- Stripe webhook secret — separate.
- Bridge auth tokens — those rotate daily on their own (Wave 3.6).

### 2.3 Things you *do* need to do alongside

- Force a session reset for any service-to-service caller that holds
  tokens in env. Currently we don't have any such callers; if/when we
  do, this section will list them.
- The `cron-secret` (`CRON_SECRET` env var) is a separate key —
  unrelated; do NOT touch it during a JWT rotation.

---

## 3. Verification

```bash
# Watch error rate during/after the swap. Spike of 401s for ~5 min is
# expected — that's the user fleet logging back in.
curl -fsS https://api.2bot.org/metrics | grep '^bot_http_requests_total{.*status="401"' | head

# Sentry: confirm no crash from the rotation itself.

# Audit log: confirm the rotation event is recorded.
docker exec 2bot-postgres psql -U postgres -d 2bot_production -c "
  SELECT created_at, action, metadata FROM audit_logs
  WHERE action = 'platform.jwt.rotated'
  ORDER BY created_at DESC LIMIT 5;
"
```

> **TODO:** The current code doesn't audit-log JWT rotations because
> there's no API call that triggers them — they happen by re-deploying.
> Add a startup-time audit row that fires when the key fingerprint
> changes from the previous boot. (Backlog.)

---

## 4. Rollback

If something breaks immediately after the rotation:

```bash
# Put the old key back.
JWT_SECRET="<previous value>"
make restart-api
```

Old tokens that were minted before the rotation become valid again.
**Anyone who logged in during the brief new-key window will need to
log in again** — that's unavoidable. The audit log shows you who,
since each `user.login.success` carries the userId.

---

## 5. Graceful rotation (multi-key, future enhancement)

The current `verifyToken` accepts only one secret. To support a soak
window where old AND new tokens are both valid for some hours:

- Extend `getJwtSecret()` to return an array (current + previous).
- `verifyToken` tries each in order; first success wins.
- `generateToken` always uses the current (first) entry.
- After the soak (e.g. 24h), drop the previous entry from the env.

This is a small (~30-line) code change but introduces a window where a
leaked old key is still useful — only worth it if the rotation cadence
makes the brief outage unacceptable. Backlog item; revisit when we
have > 1k concurrent users.

---

## 6. Related runbooks

- [secrets.md](secrets.md) — full provider-by-provider rotation list
  including the JWT keys.
- [breach-response.md](breach-response.md) — when a leak is the cause,
  the breach playbook drives the timing of this runbook.
