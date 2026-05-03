/**
 * Admin AI Health Routes
 *
 * API endpoints for monitoring AI provider health, circuit breaker status,
 * and provider alerts. Used by the admin dashboard.
 *
 * Endpoints:
 * - GET  /api/admin/ai-health           - Full health overview
 * - GET  /api/admin/ai-health/alerts    - Recent alerts
 * - GET  /api/admin/ai-health/balances  - Provider account balances
 * - POST /api/admin/ai-health/acknowledge - Acknowledge alerts
 * - POST /api/admin/ai-health/reset/:provider - Reset circuit breaker
 * - POST /api/admin/ai-health/recheck   - Force provider health re-check
 * - POST /api/admin/ai-health/probe-models - Probe individual model availability
 *
 * @module server/routes/admin-ai-health
 */

import { logger } from "@/lib/logger";
import { getModelHealthSummary } from "@/modules/2bot-ai-provider/model-health-tracker";
import {
  getProviderCircuitStatus,
  resetProviderCircuit,
} from "@/modules/2bot-ai-provider/provider-circuit-breaker";
import {
  acknowledgeAlert,
  acknowledgeProviderAlerts,
  getAlertSummary,
  getRecentAlerts,
} from "@/modules/2bot-ai-provider/provider-alerts.service";
import {
  getCachedHealthStatus,
  checkAllProviders,
} from "@/modules/2bot-ai-provider/provider-health.service";
import { getAllProviderBalances } from "@/modules/2bot-ai-provider/provider-balance.service";
import { probeAllModels, probeProviderModels, toModelCentricView } from "@/modules/2bot-ai-provider/model-probe.service";
import { getProvidersStatus } from "@/modules/2bot-ai-provider/provider-config";
import { isProviderKeyValid } from "@/modules/2bot-ai-provider/provider-registry";
import type { TwoBotAIProvider } from "@/modules/2bot-ai-provider/types";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import type { Request, Response } from "express";
import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import { requirePermission } from "../middleware/role";

const log = logger.child({ module: "admin-ai-health" });

export const adminAIHealthRouter = Router();

const VALID_PROVIDERS: TwoBotAIProvider[] = [
  "openai", "anthropic", "together", "fireworks", "openrouter", "google",
];

// ===========================================
// GET /api/admin/ai-health - Full Health Overview
// ===========================================

adminAIHealthRouter.get(
  "/",
  requirePermission("admin:stats:read"),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    // Gather all health data in parallel
    const [circuitStatus, modelHealth, providerStatus, alertSummary, cachedHealth] =
      await Promise.all([
        Promise.resolve(getProviderCircuitStatus()),
        Promise.resolve(getModelHealthSummary()),
        Promise.resolve(getProvidersStatus()),
        Promise.resolve(getAlertSummary()),
        Promise.resolve(getCachedHealthStatus()),
      ]);

    // Build provider health map from cached startup checks
    const providerHealthMap: Record<string, {
      hasApiKey: boolean;
      configured: boolean;
      healthy: boolean;
      lastChecked?: string;
      latencyMs?: number;
      error?: string;
    }> = {};

    for (const ps of providerStatus) {
      const cached = cachedHealth.get(ps.provider);
      const hasApiKey = isProviderKeyValid(ps.provider);
      providerHealthMap[ps.provider] = {
        hasApiKey,
        configured: ps.configured,
        healthy: cached?.healthy ?? false,
        lastChecked: cached?.lastChecked?.toISOString(),
        latencyMs: cached?.latencyMs,
        error: cached?.error,
      };
    }

    res.json({
      success: true,
      data: {
        // Provider-level health (API key validation)
        providers: providerHealthMap,
        // Circuit breaker status (runtime failure tracking)
        circuitBreakers: circuitStatus,
        // Per-model health (individual model failures)
        modelHealth: modelHealth.map((m) => ({
          ...m,
          disabledAt: m.disabledAt?.toISOString(),
        })),
        // Alert summary
        alerts: alertSummary,
        // Recent alerts (last 20)
        recentAlerts: getRecentAlerts({ limit: 20 }),
      },
    });
  })
);

// ===========================================
// GET /api/admin/ai-health/alerts - Alert History
// ===========================================

adminAIHealthRouter.get(
  "/alerts",
  requirePermission("admin:stats:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const provider = req.query.provider as TwoBotAIProvider | undefined;
    const type = req.query.type as "provider_down" | "provider_recovered" | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const unacknowledgedOnly = req.query.unacknowledged === "true";

    const alerts = getRecentAlerts({
      provider,
      type,
      limit,
      unacknowledgedOnly,
    });

    res.json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
      },
    });
  })
);

// ===========================================
// POST /api/admin/ai-health/acknowledge - Acknowledge Alerts
// ===========================================

adminAIHealthRouter.post(
  "/acknowledge",
  requirePermission("admin:stats:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { alertId, provider } = req.body as { alertId?: number; provider?: TwoBotAIProvider };

    if (alertId !== undefined) {
      const success = acknowledgeAlert(alertId);
      if (!success) throw new BadRequestError(`Alert ${alertId} not found`);
      res.json({ success: true, data: { acknowledged: 1 } });
    } else if (provider) {
      if (!VALID_PROVIDERS.includes(provider)) {
        throw new BadRequestError(`Invalid provider: ${provider}`);
      }
      const count = acknowledgeProviderAlerts(provider);
      res.json({ success: true, data: { acknowledged: count } });
    } else {
      throw new BadRequestError("Either alertId or provider is required");
    }
  })
);

// ===========================================
// POST /api/admin/ai-health/reset/:provider - Reset Circuit Breaker
// ===========================================

adminAIHealthRouter.post(
  "/reset/:provider",
  requirePermission("admin:stats:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const provider = req.params.provider as TwoBotAIProvider;

    if (!VALID_PROVIDERS.includes(provider)) {
      throw new BadRequestError(`Invalid provider: ${provider}`);
    }

    resetProviderCircuit(provider);
    log.info({ provider, admin: req.user?.email }, "Admin reset provider circuit breaker");

    res.json({
      success: true,
      data: { provider, circuitReset: true },
    });
  })
);

// ===========================================
// POST /api/admin/ai-health/recheck - Force Provider Health Re-check
// ===========================================

adminAIHealthRouter.post(
  "/recheck",
  requirePermission("admin:stats:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    log.info({ admin: req.user?.email }, "Admin triggered provider health re-check");

    const results = await checkAllProviders();

    res.json({
      success: true,
      data: {
        results: results.map((r) => ({
          provider: r.provider,
          healthy: r.healthy,
          error: r.error,
          latencyMs: r.latencyMs,
          lastChecked: r.lastChecked.toISOString(),
        })),
      },
    });
  })
);

// ===========================================
// GET /api/admin/ai-health/balances - Provider Account Balances
// ===========================================

adminAIHealthRouter.get(
  "/balances",
  requirePermission("admin:stats:read"),
  asyncHandler(async (_req: Request, res: Response<ApiResponse>) => {
    const balances = await getAllProviderBalances();

    res.json({
      success: true,
      data: { balances },
    });
  })
);

// ===========================================
// POST /api/admin/ai-health/probe-models - Probe Individual Model Availability
// ===========================================

adminAIHealthRouter.post(
  "/probe-models",
  requirePermission("admin:stats:read"),
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const { provider } = req.body as { provider?: TwoBotAIProvider };

    log.info({ admin: req.user?.email, provider: provider ?? "all" }, "Admin triggered model probe");

    if (provider) {
      if (!VALID_PROVIDERS.includes(provider)) {
        throw new BadRequestError(`Invalid provider: ${provider}`);
      }
      const report = await probeProviderModels(provider);
      res.json({ success: true, data: { reports: [report], byModel: toModelCentricView([report]) } });
    } else {
      const reports = await probeAllModels();
      res.json({ success: true, data: { reports, byModel: toModelCentricView(reports) } });
    }
  })
);
