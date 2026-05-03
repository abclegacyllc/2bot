/**
 * Internal Cost Routes (Cost-Context Bridge RPC)
 *
 * Bridge-token-gated endpoints called by workspace containers (via the bridge
 * agent's `system.getCredits` / `system.getPlan` / `system.estimateCost`
 * actions). Plugins inside the container can call these through the SDK
 * to budget AI calls before dispatch.
 *
 *   GET  /internal/cost/credits      — current credit balance + plan limit
 *   GET  /internal/cost/plan         — user/org subscription plan
 *   POST /internal/cost/estimate     — estimate USD + credits for an AI call
 *
 * Authentication reuses `bridgeTokenAuth` from `internal.ts`. The middleware
 * resolves the workspace container's userId/organizationId — the container
 * never gets to choose which user's credits it sees.
 *
 * @module server/routes/internal-cost
 */

import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { estimateCost } from "@/lib/cost-context";
import { logger } from "@/lib/logger";
import { bridgeCostRpcTotal } from "@/lib/metrics";
import { twoBotAICreditService } from "@/modules/credits/2bot-ai-credit.service";
import { userService } from "@/modules/user/user.service";
import type { ApiResponse } from "@/shared/types";

import { bridgeTokenAuth, type InternalRequest } from "./internal";

const log = logger.child({ module: "internal-cost" });

export const internalCostRouter = Router();

internalCostRouter.use(bridgeTokenAuth);

// ===========================================
// GET /internal/cost/credits
// ===========================================

internalCostRouter.get(
  "/credits",
  async (req: Request, res: Response<ApiResponse>) => {
    const { container } = req as InternalRequest;
    try {
      // org-aware credits. When the container is bound to
      // an organization, prefer the org wallet so plugins see the right balance.
      // Fall back to the user wallet if the org has no wallet yet.
      const orgId = container.organizationId;
      const balance = orgId
        ? (await twoBotAICreditService.getOrgBalance(orgId)) ??
          (await twoBotAICreditService.getBalance(container.userId))
        : await twoBotAICreditService.getBalance(container.userId);
      bridgeCostRpcTotal.inc({ action: "credits", status: "ok" });
      res.json({
        success: true,
        data: {
          balance: balance.balance,
          lifetime: balance.lifetime,
          monthlyUsed: balance.monthlyUsed,
          pendingCredits: balance.pendingCredits,
          planLimit: balance.planLimit,
          walletType: balance.walletType,
          scope: orgId ? "organization" : "personal",
          organizationId: orgId ?? null,
        },
      });
    } catch (err) {
      bridgeCostRpcTotal.inc({ action: "credits", status: "error" });
      log.error(
        { containerId: container.id, error: (err as Error).message },
        "Failed to fetch credits",
      );
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch credits" },
      });
    }
  },
);

// ===========================================
// GET /internal/cost/plan
// ===========================================

internalCostRouter.get(
  "/plan",
  async (req: Request, res: Response<ApiResponse>) => {
    const { container } = req as InternalRequest;
    try {
      const plan = await userService.getUserPlan(container.userId);
      bridgeCostRpcTotal.inc({ action: "plan", status: "ok" });
      res.json({ success: true, data: { plan } });
    } catch (err) {
      bridgeCostRpcTotal.inc({ action: "plan", status: "error" });
      log.error(
        { containerId: container.id, error: (err as Error).message },
        "Failed to fetch plan",
      );
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch plan" },
      });
    }
  },
);

// ===========================================
// POST /internal/cost/estimate
// ===========================================

const EstimateSchema = z.object({
  kind: z.enum([
    "text",
    "image",
    "speech-synthesis",
    "speech-recognition",
    "video",
    "embedding",
  ]),
  modelId: z.string().min(1).max(128),
  provider: z.string().min(1).max(64).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  imageCount: z.number().int().nonnegative().optional(),
  charCount: z.number().int().nonnegative().optional(),
  minutes: z.number().nonnegative().optional(),
  videoSeconds: z.number().nonnegative().optional(),
});

internalCostRouter.post(
  "/estimate",
  async (req: Request, res: Response<ApiResponse>) => {
    const { container } = req as InternalRequest;
    const parsed = EstimateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      bridgeCostRpcTotal.inc({ action: "estimate", status: "error" });
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid estimate input",
          details: parsed.error.flatten() as unknown as Record<string, unknown>,
        },
      });
      return;
    }

    const result = estimateCost(parsed.data as Parameters<typeof estimateCost>[0]);
    if (!result.ok) {
      bridgeCostRpcTotal.inc({ action: "estimate", status: "error" });
      res.status(400).json({
        success: false,
        error: { code: "ESTIMATE_FAILED", message: result.error },
      });
      return;
    }

    bridgeCostRpcTotal.inc({ action: "estimate", status: "ok" });
    log.debug(
      {
        containerId: container.id,
        modelId: result.modelId,
        usd: result.usd,
        credits: result.credits,
      },
      "Cost estimate served",
    );
    res.json({ success: true, data: result });
  },
);
