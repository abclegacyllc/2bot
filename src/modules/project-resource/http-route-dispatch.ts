/**
 * HTTP_ROUTE inbound request dispatcher.
 *
 * Resolves an incoming `(method, path)` against the project's HTTP routes,
 * verifies inbound auth, dispatches an `http.request` PluginEvent to the
 * route's target plugin, and maps the plugin's `output` back into an HTTP
 * response shape.
 *
 * Plugin response contract (`output`):
 *   - `{ status?: number; headers?: Record<string,string|string[]>; body?: unknown }`
 *   - When `output` is a string, it is sent as the body with `text/plain`.
 *   - When `output` is a plain object without `status`/`headers`/`body`, it is
 *     JSON-encoded and sent as the body.
 *   - When the plugin throws / returns `success: false`, the dispatcher returns
 *     a 500 with a generic error message (details logged, never echoed).
 *
 * NOTEb is platform-side only. The bridge-agent HTTP listener
 * and nginx wildcard config land .3c. This module is invoked by
 * an internal route (added separately) once the inbound path is wired.
 */

import type { Prisma } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getPluginExecutor } from "@/modules/plugin/plugin.executor";
import type {
    HttpRequestEventData,
    PluginContext,
    PluginEvent,
} from "@/modules/plugin/plugin.interface";
import { handleWebhookTrigger } from "@/modules/workflow/workflow.triggers";

import {
    verifyHttpRouteAuth,
    type AuthVerifyResult,
} from "./http-route-auth";
import { pickBestMatch } from "./http-route-match";
import { loadProjectSecrets } from "./project-resource.service";

const log = logger.child({ module: "http-route-dispatch" });

// ===========================================
// Public input / output types
// ===========================================

export interface DispatchHttpRouteInput {
  /** Project the request is being routed for. */
  projectId: string;
  /** Request method (case-insensitive). */
  method: string;
  /** Path including leading slash, no querystring. */
  path: string;
  /** Lower-cased keys preferred but tolerated either way. */
  headers: Record<string, string | string[] | undefined>;
  /** Parsed query string. */
  query?: Record<string, string | string[]>;
  /** Decoded body (already parsed by the caller). */
  body?: unknown;
  /** Raw bytes — required for HMAC verification. */
  rawBody?: Buffer | null;
  /** Source IP, when known. */
  remoteIp?: string | null;
  /** Subdomain of `*.2bot.org` when matched, e.g. "alice-todo". */
  subdomain?: string | null;
}

export interface DispatchHttpRouteResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

// ===========================================
// Dispatcher
// ===========================================

const SUPPORTED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

/**
 * Resolve and dispatch a single inbound HTTP request to the project's matching
 * plugin handler. Always resolves with a well-formed response object — never
 * throws on caller-induced errors (404 / 401 / 405 / 500).
 */
export async function dispatchHttpRoute(
  input: DispatchHttpRouteInput,
): Promise<DispatchHttpRouteResponse> {
  const startedAt = Date.now();
  const method = input.method.toUpperCase();

  if (!SUPPORTED_METHODS.has(method)) {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  // Fetch all candidate routes for this (project, method-or-ANY).
  const candidates = await prisma.httpRoute.findMany({
    where: {
      OR: [{ method: "ANY" }, { method: method as Prisma.EnumHttpMethodFilter["equals"] }],
      resource: { projectId: input.projectId, status: "ACTIVE" },
    },
    include: {
      resource: { select: { id: true, projectId: true, userId: true, organizationId: true } },
    },
  });

  if (candidates.length === 0) {
    return jsonResponse(404, { error: "no_route" });
  }

  const matched = pickBestMatch(candidates, input.path);
  if (!matched) {
    return jsonResponse(404, { error: "no_route" });
  }
  const route = matched.route;
  const pathParams = matched.pathParams;

  // ── Inbound auth ────────────────────────────────────────────────
  const authResult: AuthVerifyResult = verifyHttpRouteAuth({
    authMode: route.authMode,
    authConfig: (route.authConfig ?? {}) as Record<string, unknown>,
    headers: input.headers,
    rawBody: input.rawBody ?? null,
  });
  if (!authResult.ok) {
    return jsonResponse(authResult.status, { error: authResult.message });
  }

  // ── Body size guard ─────────────────────────────────────────────
  if (route.maxBodyKb > 0 && input.rawBody) {
    const sizeKb = input.rawBody.length / 1024;
    if (sizeKb > route.maxBodyKb) {
      return jsonResponse(413, { error: "payload_too_large" });
    }
  }

  // ── Phase 7.3c: Workflow target takes priority over UserPlugin target ──
  if (route.targetWorkflowId) {
    try {
      const runId = await handleWebhookTrigger(route.targetWorkflowId, {
        method,
        headers: stringifyHeaders(input.headers),
        body: input.body ?? null,
        query: flattenQuery(input.query ?? {}),
      });
      log.info(
        {
          resourceId: route.resourceId,
          workflowId: route.targetWorkflowId,
          runId,
          method,
          path: input.path,
          durationMs: Date.now() - startedAt,
        },
        "HTTP_ROUTE dispatched to Workflow",
      );
      return {
        status: 202,
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...(route.corsOrigin ? { "access-control-allow-origin": route.corsOrigin } : {}),
        },
        body: { runId },
      };
    } catch (err) {
      log.warn(
        {
          resourceId: route.resourceId,
          workflowId: route.targetWorkflowId,
          error: (err as Error).message,
        },
        "HTTP_ROUTE workflow trigger failed",
      );
      return jsonResponse(503, { error: "handler_unavailable" });
    }
  }

  // ── No target plugin → echo a 503 (route exists but is unbound) ─
  if (!route.targetUserPluginId) {
    log.warn(
      { resourceId: route.resourceId, projectId: input.projectId, method, path: input.path },
      "HTTP_ROUTE matched but has no target UserPlugin",
    );
    return jsonResponse(503, { error: "route_unbound" });
  }

  // ── Resolve target plugin ──────────────────────────────────────
  const userPlugin = await prisma.userPlugin.findUnique({
    where: { id: route.targetUserPluginId },
    include: {
      plugin: {
        select: {
          id: true,
          slug: true,
          name: true,
          requiredGateways: true,
          codeBundle: true,
          bundlePath: true,
        },
      },
    },
  });
  if (!userPlugin || !userPlugin.isEnabled) {
    return jsonResponse(503, { error: "handler_unavailable" });
  }

  // ── Build event ────────────────────────────────────────────────
  const eventData: HttpRequestEventData = {
    resourceId: route.resourceId,
    method: method as HttpRequestEventData["method"],
    path: input.path,
    pathParams,
    query: input.query ?? {},
    headers: stringifyHeaders(input.headers),
    body: input.body ?? null,
    rawBodyBase64: input.rawBody
      ? Buffer.from(input.rawBody).toString("base64")
      : undefined,
    remoteIp: input.remoteIp ?? undefined,
    subdomain: input.subdomain ?? undefined,
  };

  const event: PluginEvent = { type: "http.request", data: eventData };

  // ── Load project secrets for this dispatch (best-effort) ──────
  const projectSecrets = await loadProjectSecrets(
    {
      userId: route.resource.userId,
      organizationId: route.resource.organizationId ?? null,
    },
    route.resource.projectId,
  ).catch((err) => {
    log.warn(
      { resourceId: route.resourceId, error: (err as Error).message },
      "loadProjectSecrets failed for HTTP_ROUTE — continuing with empty secrets",
    );
    return {} as Record<string, string>;
  });

  // ── Dispatch ───────────────────────────────────────────────────
  const context = buildMinimalContext(userPlugin, projectSecrets);

  const timeoutMs = route.timeoutMs > 0 ? route.timeoutMs : 15000;
  const executor = getPluginExecutor({ timeoutMs });

  let result;
  try {
    result = await executor.execute(userPlugin.plugin.slug, event, context);
  } catch (err) {
    log.error(
      { resourceId: route.resourceId, error: (err as Error).message },
      "HTTP_ROUTE plugin execution threw",
    );
    return jsonResponse(500, { error: "handler_error" });
  }

  if (!result.success) {
    log.warn(
      { resourceId: route.resourceId, error: result.error },
      "HTTP_ROUTE plugin returned failure",
    );
    return jsonResponse(500, { error: "handler_error" });
  }

  // ── Map plugin output → HTTP response ──────────────────────────
  const response = mapPluginOutputToResponse(result.output, route.corsOrigin);

  log.info(
    {
      resourceId: route.resourceId,
      method,
      path: input.path,
      status: response.status,
      durationMs: Date.now() - startedAt,
    },
    "HTTP_ROUTE dispatched",
  );

  return response;
}

// ===========================================
// Helpers
// ===========================================

function stringifyHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

function flattenQuery(
  query: Record<string, string | string[]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    out[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

function buildMinimalContext(userPlugin: {
  id: string;
  userId: string;
  organizationId: string | null;
  config: unknown;
  entryFile: string | null;
  plugin: { slug: string };
}, secrets: Record<string, string>): PluginContext {
  // We deliberately keep the context lean: HTTP_ROUTE handlers are pure
  // request/response. Gateway accessors and storage are added in a later
  // phase if a route handler ever needs them.
  const config = (userPlugin.config as Record<string, unknown> | null) ?? {};
  return {
    userId: userPlugin.userId,
    organizationId: userPlugin.organizationId ?? undefined,
    config,
    userPluginId: userPlugin.id,
    entryFile: userPlugin.entryFile ?? undefined,
    gateways: {
      // Empty accessor: throws on use so handlers don't silently misbehave.
      list: () => [],
      get: () => {
        throw new Error("HTTP_ROUTE handlers do not currently expose gateway accessors");
      },
      execute: () => {
        throw new Error("HTTP_ROUTE handlers do not currently expose gateway accessors");
      },
    } as unknown as PluginContext["gateways"],
    storage: undefined as unknown as PluginContext["storage"],
    logger: log.child({ pluginSlug: userPlugin.plugin.slug, userId: userPlugin.userId }),
    secrets,
  };
}

function jsonResponse(
  status: number,
  body: unknown,
): DispatchHttpRouteResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  };
}

function mapPluginOutputToResponse(
  output: unknown,
  corsOrigin: string | null,
): DispatchHttpRouteResponse {
  const corsHeaders: Record<string, string> = corsOrigin
    ? { "access-control-allow-origin": corsOrigin }
    : {};

  if (output === null || output === undefined) {
    return { status: 204, headers: { ...corsHeaders }, body: null };
  }

  if (typeof output === "string") {
    return {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders },
      body: output,
    };
  }

  if (
    typeof output === "object" &&
    output !== null &&
    ("status" in output || "headers" in output || "body" in output)
  ) {
    const o = output as {
      status?: unknown;
      headers?: unknown;
      body?: unknown;
    };
    const status =
      typeof o.status === "number" && Number.isInteger(o.status) && o.status >= 100 && o.status < 600
        ? o.status
        : 200;
    const headers = normalizeOutputHeaders(o.headers, corsHeaders);
    return { status, headers, body: o.body ?? null };
  }

  // Plain JSON-able value.
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders },
    body: output,
  };
}

function normalizeOutputHeaders(
  raw: unknown,
  corsHeaders: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...corsHeaders };
  if (!raw || typeof raw !== "object") {
    if (!out["content-type"]) out["content-type"] = "application/json; charset=utf-8";
    return out;
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    const key = k.toLowerCase();
    if (Array.isArray(v)) {
      out[key] = v.map((x) => String(x)).join(", ");
    } else {
      out[key] = String(v);
    }
  }
  if (!out["content-type"]) out["content-type"] = "application/json; charset=utf-8";
  return out;
}
