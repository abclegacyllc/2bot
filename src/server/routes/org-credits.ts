/**
 * Organization Credits Routes
 *
 * API endpoints for organization credit wallet management.
 * All routes at /api/orgs/:orgId/credits/* for organization credits.
 *
 * @module server/routes/org-credits
 */

import type { Request, Response } from "express";
import { Router } from "express";

import { logger } from "@/lib/logger";
import { getCurrentBillingPeriod } from "@/modules/2bot-ai-provider";
import { twoBotAICreditService, type WalletType } from "@/modules/credits";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";

import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";
import { requireOrgAdmin, requireOrgMember } from "../middleware/org-auth";

export const orgCreditsRouter = Router({ mergeParams: true });

// ===========================================
// Helper Functions
// ===========================================

/**
 * Extract and validate path parameter as string
 */
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toString();
}

// ===========================================
// GET /api/orgs/:orgId/credits
// ===========================================

interface OrgCreditsBalanceResponse {
  balance: number;
  lifetime: number;
  formattedBalance: string;
  walletType: WalletType;
}

/**
 * GET /api/orgs/:orgId/credits
 *
 * Get organization credit wallet balance.
 * Requires: Org member access
 */
orgCreditsRouter.get(
  "/",
  requireAuth,
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgCreditsBalanceResponse>>) => {
    const orgId = getPathParam(req, "orgId");
    const balance = await twoBotAICreditService.getOrgBalance(orgId);

    if (!balance) {
      throw new NotFoundError("Organization credit wallet not found");
    }

    res.json({
      success: true,
      data: {
        balance: balance.balance,
        lifetime: balance.lifetime,
        formattedBalance: formatCredits(balance.balance),
        walletType: balance.walletType,
      },
    });
  })
);

// ===========================================
// GET /api/orgs/:orgId/credits/tokens
// ===========================================

interface OrgTokenUsageResponse {
  used: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  exceeded: boolean;
  balance: number;
}

/**
 * GET /api/orgs/:orgId/credits/tokens
 *
 * Get organization token usage for 2Bot AI widget.
 * Returns credits as "tokens" for backward compatibility with widget.
 * Requires: Org member access
 */
orgCreditsRouter.get(
  "/tokens",
  requireAuth,
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgTokenUsageResponse>>) => {
    const orgId = getPathParam(req, "orgId");
    const balance = await twoBotAICreditService.getOrgBalance(orgId);

    if (!balance) {
      throw new NotFoundError("Organization credit wallet not found");
    }

    // Include pending credits for accurate usage display
    const used = balance.monthlyUsed + (balance.pendingCredits ?? 0);
    const limit = balance.planLimit;
    const remaining = limit === -1 ? null : Math.max(0, limit - used);
    const percentUsed = limit === -1 ? null : Math.min(100, (used / limit) * 100);
    const exceeded = limit !== -1 && used >= limit;

    res.json({
      success: true,
      data: {
        used,
        limit,
        remaining,
        percentUsed,
        exceeded,
        balance: balance.balance,
      },
    });
  })
);

// ===========================================
// GET /api/orgs/:orgId/credits/history
// ===========================================

interface OrgCreditsHistoryResponse {
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  walletType: WalletType;
}

/**
 * GET /api/orgs/:orgId/credits/history
 *
 * Get organization credit transaction history.
 * Requires: Org member access
 *
 * @query {number} [page] - Page number (default: 1)
 * @query {number} [pageSize] - Items per page (default: 20)
 * @query {string} [type] - Filter by type (purchase, usage, refund, bonus, grant)
 */
orgCreditsRouter.get(
  "/history",
  requireAuth,
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgCreditsHistoryResponse>>) => {
    const orgId = getPathParam(req, "orgId");
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const type = req.query.type as string | undefined;

    const offset = (page - 1) * pageSize;
    const result = await twoBotAICreditService.getOrgTransactions(orgId, {
      limit: pageSize,
      offset,
      type,
    });

    if (!result) {
      throw new NotFoundError("Organization credit wallet not found");
    }

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        total: result.total,
        page,
        pageSize,
        walletType: result.walletType,
      },
    });
  })
);

// ===========================================
// GET /api/orgs/:orgId/credits/usage
// ===========================================

interface OrgCreditsUsageResponse {
  period: string;
  totalCredits: number;
  byCategory: Record<string, number>;
  aiUsage?: {
    /** Usage grouped by capability (universal naming) */
    byCapability: Record<string, number>;
    byModel: Record<string, number>;
  };
  byMember: Array<{
    userId: string;
    credits: number;
  }>;
  byDay: Array<{
    date: string;
    credits: number;
  }>;
}

/**
 * GET /api/orgs/:orgId/credits/usage
 *
 * Get organization credit usage statistics.
 * Requires: Org admin access
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 */
orgCreditsRouter.get(
  "/usage",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgCreditsUsageResponse>>) => {
    const orgId = getPathParam(req, "orgId");
    const period = (req.query.period as string) || getCurrentBillingPeriod();

    // Get org usage stats from the 2bot-ai-provider service
    // (2Bot AI service only returns 2Bot usage, no source filter needed)
    const { twoBotAIUsageService: aiUsageSvc } = await import("@/modules/2bot-ai-provider");
    const stats = await aiUsageSvc.getOrgUsageStats(orgId, {
      period,
    });

    // Calculate totals from stats
    const totalCredits = stats.totals.credits;
    const byCapability: Record<string, number> = {};
    const byModel: Record<string, number> = {};

    for (const item of stats.byCapability) {
      byCapability[item.capability] = item.credits;
    }

    for (const item of stats.byModel) {
      byModel[item.model] = item.credits;
    }

    const byDay = stats.byDay.map((d: { date: string; credits: number }) => ({
      date: d.date,
      credits: d.credits,
    }));

    // Get per-member breakdown (if available)
    const byMember = stats.byMember?.map((m: { userId: string; credits: number }) => ({
      userId: m.userId,
      credits: m.credits,
    })) || [];

    res.json({
      success: true,
      data: {
        period,
        totalCredits,
        byCategory: {
          ai_usage: totalCredits,
        },
        aiUsage: {
          byCapability,
          byModel,
        },
        byMember,
        byDay,
      },
    });
  })
);

// ===========================================
// POST /api/orgs/:orgId/credits/purchase
// ===========================================

interface OrgPurchaseRequestBody {
  package: "org_small" | "org_medium" | "org_large" | "org_xlarge";
}

interface OrgPurchaseResponse {
  checkoutUrl: string;
  sessionId: string;
}

// Organization credit packages (larger than personal)
// 1 credit = $0.001 USD ($1 = 1,000 credits)
const ORG_CREDIT_PACKAGES = {
  org_small: { credits: 2500, price: 20, name: "2.5K Org Credits" },
  org_medium: { credits: 6250, price: 40, name: "6.25K Org Credits" },
  org_large: { credits: 15000, price: 80, name: "15K Org Credits" },
  org_xlarge: { credits: 50000, price: 200, name: "50K Org Credits" },
};

/**
 * POST /api/orgs/:orgId/credits/purchase
 *
 * Create Stripe checkout session for org credit purchase.
 * Requires: Org admin access
 *
 * @body {string} package - org_small, org_medium, org_large, org_xlarge
 */
orgCreditsRouter.post(
  "/purchase",
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<OrgPurchaseResponse>>) => {
    const log = logger.child({ module: "org-credits-route", action: "purchase" });
    const orgId = getPathParam(req, "orgId");
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const body = req.body as OrgPurchaseRequestBody;

    // Validate package
    const pkg = ORG_CREDIT_PACKAGES[body.package];
    if (!pkg) {
      throw new BadRequestError("Invalid package. Choose: org_small, org_medium, org_large, org_xlarge");
    }

    // Create Stripe checkout session
    const stripe = (await import("stripe")).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!);

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `2Bot AI Org Credits - ${pkg.name}`,
              description: `${pkg.credits.toLocaleString()} credits for organization`,
            },
            unit_amount: pkg.price * 100, // cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "org_credit_purchase",
        userId,
        organizationId: orgId,
        package: body.package,
        credits: pkg.credits.toString(),
      },
      success_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/orgs/${orgId}/settings?purchase=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/orgs/${orgId}/settings?purchase=cancelled`,
    });

    log.info({
      userId,
      organizationId: orgId,
      package: body.package,
      credits: pkg.credits,
      sessionId: session.id,
    }, "Org credit purchase checkout created");

    res.json({
      success: true,
      data: {
        checkoutUrl: session.url!,
        sessionId: session.id,
      },
    });
  })
);

// ===========================================
// GET /api/orgs/:orgId/credits/packages
// ===========================================

interface OrgPackagesResponse {
  packages: Array<{
    id: string;
    name: string;
    credits: number;
    price: number;
    pricePerCredit: number;
    popular?: boolean;
  }>;
}

/**
 * GET /api/orgs/:orgId/credits/packages
 *
 * Get available org credit packages.
 * Requires: Org member access
 */
orgCreditsRouter.get(
  "/packages",
  requireAuth,
  requireOrgMember,
  asyncHandler(async (_req: Request, res: Response<ApiResponse<OrgPackagesResponse>>) => {
    const packages = Object.entries(ORG_CREDIT_PACKAGES).map(([id, pkg]) => ({
      id,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      pricePerCredit: pkg.price / pkg.credits,
      popular: id === "org_medium",
    }));

    res.json({
      success: true,
      data: { packages },
    });
  })
);
