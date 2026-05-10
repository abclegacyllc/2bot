# Breach Response Runbook

Status: **active.** Reviewed quarterly. Last review: 2026-05-08.

> A "breach" here means **any incident where personal data, secrets, or
> production systems may have been accessed by someone unauthorised** —
> external attacker, compromised internal account, accidental exposure
> (e.g. a public S3 bucket, a leaked secret in a public repo), or a
> stolen laptop containing prod credentials.

This document is the playbook the on-call engineer follows when a breach
is suspected or confirmed. **Do not skip steps to save time** — the
72-hour GDPR notification clock starts when *any one* of us becomes
aware of a likely breach, regardless of severity assessment.

---

## 1. Roles

| Role | Default holder | Responsibility |
|---|---|---|
| **Incident Commander (IC)** | First on-call to acknowledge | Coordinates the response, decides scope, owns the timeline |
| **Communicator** | Founder / company lead | Talks to customers, regulators, press; the only one who does |
| **Scribe** | Anyone not IC | Maintains the incident timeline doc as events unfold |
| **Subject-matter responders** | Service owners | Investigate / contain / remediate the affected area |

The IC can change as the incident progresses — explicitly hand off, never
implicitly.

## 2. The 72-hour clock

GDPR Article 33 requires notification of a personal data breach to the
supervisory authority **within 72 hours of becoming aware**. "Aware"
means a senior engineer has reasonable grounds to believe a breach
occurred — not "we have completed forensics." The clock starts at first
suspicion.

Article 34 may require notification to affected users when the breach
is "likely to result in a high risk" to their rights. Examples:
unencrypted password leak, financial data, identity theft enablers.

If you are uncertain whether to notify: **assume yes**, draft the
notification, then have legal review before sending.

## 3. The first 30 minutes

Run all of the following in parallel where possible:

1. **Acknowledge & declare.** Write a one-line incident note in the
   incident channel: "Suspected breach in `<area>`; investigating now;
   IC = `<name>`." The clock has started.
2. **Contain the immediate damage.** What stops the bleeding right now?
   Examples: rotate the leaked key (Wave 0 runbook), revoke a session,
   take the affected service offline, pull a public bucket private.
   Containment beats analysis in the first 30 min.
3. **Preserve evidence.** Before destroying anything that might be
   examined later, snapshot it: container filesystems, recent logs,
   audit log queries (`SELECT * FROM audit_logs WHERE …`), Cloudflare /
   nginx access logs. Save to a separate bucket nobody can edit.
4. **Open the timeline doc.** Title: `incident-YYYY-MM-DD-<short-name>`.
   Section headings: Detection, Containment, Investigation, Notification,
   Post-mortem. The Scribe owns it.

## 4. Investigation

Goals, in order:
1. **What was accessed?** Per-table: was data read, written, deleted?
2. **Whose data?** Build the affected-user list (this drives Article 34
   notifications). Audit log queries are the source of truth.
3. **By whom?** IPs, user agents, accounts. Note: knowing *whose
   credentials* were used is not the same as knowing *who* was at the
   keyboard.
4. **How did they get in?** Root cause. Phishing, leaked secret, unpatched
   vuln, broken auth check.
5. **For how long?** When did the unauthorised access start? Lookback
   should extend at least to the last known good state.

## 5. Containment beyond the immediate fix

After the initial stop-the-bleeding step:

- Rotate every credential in the blast radius, not just the leaked one
  (use [secrets.md](secrets.md) §2 as the rotation order).
- Revoke every active session (`DELETE FROM sessions WHERE …`).
- Force-rotate JWT secret if there's any chance issued tokens are in
  attacker hands (note: this logs everyone out — communicate first).
- Re-encrypt any data wrapped under a possibly-compromised
  `ENCRYPTION_KEY` (see [secrets.md](secrets.md) §2 row 11).
- Disable the integration / endpoint / feature flag where possible.

## 6. Notification

| Audience | When | Who | How |
|---|---|---|---|
| **Internal exec / board** | Immediately | IC | direct (Slack/phone) |
| **Affected users** | Within 72h if Art. 34 risk threshold met | Communicator | email from `security@2bot.org`, plus an in-app banner |
| **Regulators (DPA)** | Within 72h of awareness | Communicator + legal | submission via the DPA's online form |
| **Customers under contract** | Per contract terms (often 24–72h) | Communicator | email + status page |
| **Public / press** | Only if customer-affecting and media-likely | Founder | prepared statement |

Templates for the user notification and DPA submission live in
`docs/operations/templates/` (TODO: not yet authored — required for
SOC 2 readiness).

## 7. Recovery & verification

- Patch / re-deploy the fix.
- Verify logs from the rebuilt environment show no continuation of the
  attacker pattern for **at least 7 days**.
- Run a full backup-restore drill (see [db-restore.md](db-restore.md))
  if any data integrity is questioned.

## 8. Post-mortem (within 7 days of close)

Write up:
- Timeline (use the live doc the Scribe maintained).
- Root cause + the 5 whys.
- What contained the damage; what didn't work.
- Action items with owner + due date — durable fixes only, not "be more
  careful next time."

Action items go into the security backlog with the highest priority.

## 9. What counts as a breach (examples)

- A public commit contains an active production secret. (See
  [secrets.md](secrets.md) — even the *historical* `JWT_SECRET` literal
  meets this bar; rotation was the actual fix.)
- A user reports being able to read another tenant's data (an IDOR).
- A workspace container was used to escape to the host.
- An employee laptop with `.env.local` was stolen and not yet
  remote-wiped.
- A subprocessor (Stripe, Resend, GCP, etc.) reports a breach affecting
  data we sent them.
- Anomalous outbound traffic from a backend service to a destination
  not on its allow-list.

## 10. What does NOT count as a breach

- A login-failed event followed by a successful login from the same
  account a minute later (almost always a typo).
- A web scrape against public unauthenticated pages.
- A user accessing their own data from an unusual location.

In doubt, treat as a breach until evidence proves otherwise.
