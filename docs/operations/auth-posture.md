# Authentication Posture (Phase 3.4)

## Summary

The platform uses **bearer-only, cookie-less HTTP authentication**. All API
endpoints — both the Next.js routes and the Express server (3001/3002) — read
their token from the `Authorization: Bearer <token>` header. There is no
`Set-Cookie` issued by the server, no `cookie-parser` middleware, and no client
code that reads `document.cookie` for auth purposes.

This is verified by the absence of any of the following in `src/`:

```bash
grep -rn "res.cookie\|Set-Cookie\|req.cookies\|cookie-parser" \
  --include="*.ts" --include="*.tsx" src/
# (returns no auth-related matches)
```

## Implications

### CSRF surface — none
Because the browser does **not** automatically attach a session cookie to
cross-site requests, a malicious page cannot forge an authenticated request to
our origin. The classic CSRF attack pattern requires ambient credentials; we
have none. **No `SameSite`, no anti-CSRF token, no `Origin` check** is required
for correctness.

### XSS sensitivity — high
The flip side: the access token must live somewhere the JS application can read
it (memory, `localStorage`, `sessionStorage`). Any successful XSS exfiltrates
the token. Mitigations already in place:

- Strict CSP (see `next.config.ts` headers).
- Sanitization at all rendering boundaries (DOMPurify in markdown views).
- Short-lived access tokens with refresh rotation (see `auth.ts`).
- HTTPS-only in production (HSTS preload set in `nginx/`).

### TLS — required
With bearer tokens in headers, network-layer confidentiality is the only thing
between the token and an attacker. **Production must terminate TLS at the
ingress and reject plain HTTP.** Confirm via `curl -I http://api.2bot.org/`:
expect 301 → HTTPS.

### Token rotation
- **User access tokens**: rotated on each refresh; refresh token bound to
  `userAgent` + `ip` fingerprint and revocable from the dashboard.
- **Bridge auth tokens** (workspace ↔ platform): rotated daily by the
  `bridge-token-rotation-cron` (Phase 3.2). Online rotation — no container
  restart required.

## What we deliberately do *not* do

- We do **not** issue session cookies. Adding them would re-introduce the
  CSRF surface we currently don't have.
- We do **not** authenticate on `Origin` or `Referer`. Those headers are not
  reliable for bearer-token flows and would only create false negatives for
  legitimate clients (mobile apps, server-side renderers, CLI users).

## Future work

If we ever add cookie-based session auth (e.g. for a server-side rendered
admin panel), this document must be revised and the following added in the
same PR:

1. `cookie-parser` middleware.
2. `SameSite=Strict; Secure; HttpOnly` on every issued cookie.
3. Anti-CSRF token (`csurf` or equivalent) on every state-changing route.
4. `Origin` header pin to the canonical app origin.
5. Threat-model review.
