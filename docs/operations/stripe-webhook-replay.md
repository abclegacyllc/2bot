# Stripe Webhook Replay Runbook

Status: **active.** Last review: 2026-05-08. Owner: billing on-call.

When this happens:
- Stripe shows a webhook delivery as failed in the dashboard.
- A subscription's local status is wrong (we say `active`, Stripe says
  `past_due` or vice versa).
- A customer reports a billing surprise that maps back to a missed
  webhook event.

This is a hand-on-the-wheel operation. **Don't replay without a clear
reason** — a duplicate replay can flip a subscription back into a state
the customer left.

---

## 1. Verify the gap

```bash
# 1. Find the affected subscription / customer.
docker exec 2bot-postgres psql -U postgres -d 2bot_production -c "
  SELECT id, stripe_subscription_id, plan, stripe_status, current_period_end, cancel_at_period_end, updated_at
  FROM subscriptions
  WHERE stripe_subscription_id = 'sub_XXX';
"

# 2. Pull the same subscription from Stripe to compare.
stripe subscriptions retrieve sub_XXX

# 3. List recent webhook events for this customer.
stripe events list --type 'customer.subscription.*' --limit 20 \
  | jq '.data[] | select(.data.object.id=="sub_XXX")'
```

If steps 1 and 2 disagree, you have a real gap.

---

## 2. Check Sentry / Stripe for delivery failures

```bash
# Stripe-side delivery log
stripe events list --limit 50 --include 'most_recent_attempt'

# Sentry: filter by `module:stripe-webhook` and look at the past 24h.
# Common signals:
#   - "Webhook signature verification failed" → middleware-order regression
#     (Wave 1.7's order-guard should have caught this; if not, the guard
#     is mounted incorrectly)
#   - "Webhook misconfigured: raw body required" → express.raw() not
#     before the route handler. Check src/server/app.ts.
#   - 5xx from handleStripeEvent → genuine handler bug, file an issue.
```

---

## 3. Replay one event

```bash
# Confirm the event ID
EVT=evt_1QXabc...

# Inspect first
stripe events retrieve $EVT

# Replay
stripe events resend $EVT
```

Watch in another terminal:

```bash
make logs-prod-tail | grep stripe-webhook
```

You should see:
1. `Received Stripe webhook event` (info)
2. The handler-specific log line (e.g. `Updated organization plan`)

If the second line doesn't appear, see §5.

---

## 4. Replay a backlog

If multiple events were missed (post-outage):

```bash
# Find the cut-off (last successfully processed event time)
docker exec 2bot-postgres psql -U postgres -d 2bot_production -tAc "
  SELECT max(updated_at) FROM subscriptions
  WHERE stripe_status IS NOT NULL;
"
# e.g. 2026-05-08T14:23:00Z

# Pull all subscription events since then
stripe events list \
  --type 'customer.subscription.updated' \
  --created '>=1715185380' \
  --limit 100

# Replay them one at a time, NOT in parallel. Stripe's webhook handler
# is idempotent (we look up by stripe_subscription_id), but ordering
# matters — replaying in chronological order keeps the final state
# correct.
for evt_id in $(stripe events list --type 'customer.subscription.updated' --created '>=...' --limit 100 -q ".data[].id" | tac); do
  stripe events resend "$evt_id"
  sleep 1
done
```

> **Sleep matters.** Without it, the rate limiter (Wave 1.3 — webhooks
> are in `SENSITIVE_PATH_PREFIXES`) will start refusing.

---

## 5. Failure modes

### 5.1 "Webhook signature verification failed" (400)

The handler at [src/server/routes/stripe-webhook.ts](../../src/server/routes/stripe-webhook.ts)
validates the signature against the request body. Causes:

- **Wrong `STRIPE_WEBHOOK_SECRET`** — the secret was rotated in Stripe
  but not in the API server's env. Update and restart.
- **Body was parsed before the handler ran** — Wave 1.7's runtime guard
  should print "Webhook misconfigured: raw body required". Check
  `src/server/app.ts` — the `express.raw()` mount must precede
  `express.json()`.
- **Replay is so old that the timestamp is outside the tolerance window** —
  Stripe rejects events older than 5 min by default. Just resend.

### 5.2 "Subscription not found in database"

The local row hasn't been written yet (e.g. checkout was abandoned and
the subscription got deleted before we saw it). Action: usually no-op;
the customer never had service.

### 5.3 The handler succeeded but the DB still looks wrong

You probably replayed an *older* event after a newer one already
processed. Stripe events have a `created` timestamp; processing them
out of order overwrites a later truth with an earlier one. Re-run the
*latest* event for that subscription to restore.

---

## 6. Prevention

- The Sentry alert on `stripe-webhook` errors should be wired (Wave 4.6).
- A daily reconciliation cron is not currently in place — file as backlog.
  Pseudocode: every 24h, list every subscription with `stripe_status` set
  in the local DB, fetch the same from Stripe, log + alert on any
  divergence.
