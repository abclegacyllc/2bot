---
name: Incident timeline
about: Open this when an outage / SEV happens; the on-call IC owns it
title: "incident: <YYYY-MM-DD> <short>"
labels: incident
---

<!-- Mirrors the structure of docs/operations/incident-response.md.
     Open this issue at incident-declared time; close at post-mortem. -->

## Severity

- [ ] SEV-1 — total outage, paging
- [ ] SEV-2 — significant degradation
- [ ] SEV-3 — localised problem, working hours
- [ ] SEV-4 — internal-only / no customer impact

## Roles

- Incident Commander:
- Communicator:
- Scribe:

## Timeline

<!-- Append every observable event with timestamps in UTC. Keep it
     short and factual. -->

- HH:MM —
- HH:MM —

## Detection

<!-- How did we know? Alert? User report? -->

## Containment

<!-- What stopped the bleeding? Roll back, flag flip, drain a replica. -->

## Investigation

- What was accessed / mutated / lost:
- Whose data:
- By whom (IPs / accounts):
- How they got in (root cause):
- For how long:

## Resolution

<!-- The fix. -->

## Affected users

- Count:
- Notification channel + time:

## Post-mortem action items

<!-- Each item with owner + due date. -->

- [ ] Owner: ___ — Due: ___ — Action:
- [ ] Owner: ___ — Due: ___ — Action:
