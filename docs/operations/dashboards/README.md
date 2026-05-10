# Grafana Dashboards

The five dashboards in this folder are the bare-minimum operational
view of 2bot. Import them into Grafana via **Dashboards → Import →
Upload JSON**, then attach the Prometheus data source.

| File | Purpose | Owner |
|---|---|---|
| `api-overview.json` | API latency, error rate, request volume per route | platform |
| `bullmq-workflows.json` | Queue depth (waiting / active / failed), DLQ alerts | workflow |
| `workspace-fleet.json` | Container count by status, bridge token rotation health | workspace |
| `stripe-webhooks.json` | Webhook delivery success / failure / latency | billing |
| `errors-and-rate-limits.json` | 5xx rates, rate-limit rejections, auth failures | platform |

All dashboards use the standard Prometheus metric names emitted by
`src/lib/metrics.ts`. Adding a new metric? Update both the code and
this README so future-you can find which dashboard it lands on.

## Variables

Every dashboard exposes:

- `instance` — replica filter (per-pod metrics)
- `interval` — `$__rate_interval` for rate queries

## Alerts

Alert rules live alongside the dashboard JSON in `alerts.yml`. Wire
them into your Alertmanager separately — Grafana imports don't
auto-create alerts.

## Style guide

- Latency panels: p50 (green) + p95 (yellow) + p99 (red), histogram_quantile.
- Error panels: error rate as % of total, with thresholds 1% / 5%.
- Counter panels: rate(increase()) over the dashboard's $interval.
- Gauges (queue depth, container count): plain `last()` value, no rate.
