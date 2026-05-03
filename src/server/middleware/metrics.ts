/**
 * HTTP metrics middleware
 *
 * Records `bot_http_requests_total` and `bot_http_request_duration_ms` for
 * every Express request. Uses `req.route?.path` when available (matches the
 * Express route pattern, e.g. `/users/:id`) so labels stay low-cardinality.
 *
 * @module server/middleware/metrics
 */

import type { NextFunction, Request, Response } from "express";

import {
    httpRequestDurationMs,
    httpRequestsTotal,
} from "@/lib/metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Don't measure the metrics endpoint itself — would create a feedback loop
  // and inflate scrape histograms.
  if (req.path === "/metrics") {
    next();
    return;
  }

  const startNs = process.hrtime.bigint();

  res.on("finish", () => {
    // Prefer the matched route pattern (low cardinality) over the raw URL
    // (which contains tenant IDs and would explode the metric label set).
    const route =
      (req.route?.path as string | undefined) ??
      (req.baseUrl || "unmatched");
    const status = String(res.statusCode);
    const method = req.method;

    const durationMs =
      Number(process.hrtime.bigint() - startNs) / 1_000_000;

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDurationMs.observe({ method, route, status }, durationMs);
  });

  next();
}
