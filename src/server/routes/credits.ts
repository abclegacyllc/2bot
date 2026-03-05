/**
 * Credits Routes
 *
 * API endpoints for platform credits - the universal currency of 2Bot.
 * Credits can be used for:
 * - AI usage (2Bot AI)
 * - Marketplace purchases (plugins, themes, templates)
 * - Premium features
 * - Any paid platform feature
 *
 * Routes:
 * - /api/credits/* - Personal credit wallet
 * - /api/orgs/:orgId/credits/* - Organization credit wallet (see org routes)
 *
 * @module server/routes/credits
 */

import { logger } from "@/lib/logger";
import { getCurrentBillingPeriod } from "@/modules/2bot-ai-provider";
import {
  creditService,
  twoBotAICreditService,
  type CreditUsageCategory,
  type WalletType
} from "@/modules/credits";
import { BadRequestError, InternalError } from "@/shared/errors";
import { formatCredits } from "@/shared/lib/format";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const creditsRouter = Router();

// All routes require authentication
creditsRouter.use(requireAuth);

// ===========================================
// GET /api/credits
// ===========================================

interface CreditsBalanceResponse {
  balance: number;
  lifetime: number;
  formattedBalance: string;
  walletType: WalletType;
}

/**
 * GET /api/credits
 *
 * Get current personal token balance
 */
creditsRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response<ApiResponse<CreditsBalanceResponse>>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const balance = await twoBotAICreditService.getBalance(userId);

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
// GET /api/credits/tokens
// ===========================================

interface TokenUsageResponse {
  used: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  exceeded: boolean;
  balance: number;
}

/**
 * GET /api/credits/tokens
 *
 * Get token usage for 2Bot AI widget.
 * Returns credits as "tokens" for backward compatibility with widget.
 */
creditsRouter.get(
  "/tokens",
  asyncHandler(async (req: Request, res: Response<ApiResponse<TokenUsageResponse>>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const balance = await twoBotAICreditService.getBalance(userId);
    
    // Include pending credits for accurate usage display
    // monthlyUsed = whole credits deducted, pendingCredits = accumulated fractional credits
    const used = balance.monthlyUsed + (balance.pendingCredits ?? 0);
    // No monthly spending cap — wallet balance is the only limit
    const exceeded = balance.balance <= 0;

    res.json({
      success: true,
      data: {
        used,
        limit: -1, // No monthly cap
        remaining: null,
        percentUsed: null,
        exceeded,
        balance: balance.balance,
      },
    });
  })
);

// ===========================================
// GET /api/credits/history
// ===========================================

interface CreditsHistoryResponse {
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    category?: CreditUsageCategory;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
  walletType: WalletType;
}

/**
 * GET /api/credits/history
 *
 * Get personal credit transaction history
 *
 * @query {number} [page] - Page number (default: 1)
 * @query {number} [pageSize] - Items per page (default: 20)
 * @query {string} [type] - Filter by transaction type (purchase, usage, refund, bonus, grant)
 * @query {string} [category] - Filter by usage category (ai_usage, marketplace, premium_feature, etc.)
 */
creditsRouter.get(
  "/history",
  asyncHandler(async (req: Request, res: Response<ApiResponse<CreditsHistoryResponse>>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const type = req.query.type as string | undefined;
    const category = req.query.category as CreditUsageCategory | undefined;

    const offset = (page - 1) * pageSize;
    const result = await twoBotAICreditService.getTransactions(userId, { 
      limit: pageSize, 
      offset, 
      type,
      // Category filter will be applied in service layer
    });

    // Filter by category if specified (from metadata)
    const filteredTransactions = category
      ? result.transactions.filter((t: Record<string, unknown>) => {
          const meta = t.metadata as Record<string, unknown> | null;
          return meta?.category === category;
        })
      : result.transactions;

    res.json({
      success: true,
      data: {
        transactions: filteredTransactions,
        total: result.total,
        page,
        pageSize,
        walletType: result.walletType,
      },
    });
  })
);

// ===========================================
// GET /api/credits/usage
// ===========================================

interface CreditsUsageResponse {
  period: string;
  totalCredits: number;
  byCategory: Record<CreditUsageCategory, number>;
  // AI-specific breakdown (only when category includes ai_usage)
  aiUsage?: {
    /** Usage grouped by capability (universal naming) */
    byCapability: Record<string, number>;
    byModel: Record<string, number>;
    byFeature: Record<string, number>;
  };
  byDay: Array<{
    date: string;
    credits: number;
  }>;
}

/**
 * GET /api/credits/usage
 *
 * Get credit usage statistics (UNIVERSAL)
 *
 * @query {string} [period] - Billing period (YYYY-MM, default: current)
 * @query {string} [category] - Filter by category (ai_usage, marketplace, all)
 */
creditsRouter.get(
  "/usage",
  asyncHandler(async (req: Request, res: Response<ApiResponse<CreditsUsageResponse>>) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const period = req.query.period as string | undefined;
    const category = (req.query.category as string) || "all";

    const billingPeriod = period || getCurrentBillingPeriod();
    
    // Initialize response data
    const byCategory: Record<CreditUsageCategory, number> = {
      ai_usage: 0,
      marketplace: 0,
      premium_feature: 0,
      subscription: 0,
      transfer: 0,
      other: 0,
    };
    
    let aiUsage: { byCapability: Record<string, number>; byModel: Record<string, number>; byFeature: Record<string, number> } | undefined;
    let byDay: Array<{ date: string; credits: number }> = [];
    let totalCredits = 0;

    // Get AI usage if requested
    if (category === "all" || category === "ai_usage") {
      const { twoBotAIUsageService: aiUsageSvc } = await import("@/modules/2bot-ai-provider");
      // 2Bot AI service only returns 2Bot usage (no source filter needed)
      const stats = await aiUsageSvc.getUsageStats(userId, {
        period: billingPeriod,
      });

      byCategory.ai_usage = stats.totals.credits;
      totalCredits += stats.totals.credits;

      // Include AI-specific breakdown
      const byCapability: Record<string, number> = {};
      const byModel: Record<string, number> = {};
      const byFeature: Record<string, number> = {};

      for (const item of stats.byCapability) {
        byCapability[item.capability] = item.credits;
      }

      for (const item of stats.byModel) {
        byModel[item.model] = item.credits;
      }

      for (const item of stats.byFeature) {
        byFeature[item.feature] = item.credits;
      }

      aiUsage = { byCapability, byModel, byFeature };

      // Use AI usage for daily breakdown
      byDay = stats.byDay.map((d: { date: string; credits: number }) => ({
        date: d.date,
        credits: d.credits,
      }));
    }

    // TODO: Add marketplace usage when marketplace is implemented
    // if (category === "all" || category === "marketplace") {
    //   const marketplaceStats = await marketplaceService.getUsageStats(userId, billingPeriod);
    //   byCategory.marketplace = marketplaceStats.credits;
    //   totalCredits += marketplaceStats.credits;
    // }

    res.json({
      success: true,
      data: {
        period: billingPeriod,
        totalCredits,
        byCategory,
        aiUsage,
        byDay,
      },
    });
  })
);

// ===========================================
// POST /api/credits/purchase
// ===========================================

interface PurchaseRequestBody {
  package: "small" | "medium" | "large" | "xlarge";
}

interface PurchaseResponse {
  checkoutUrl: string;
  sessionId: string;
}

// Credit packages — $1 = 100 credits
// Base rate: $10 per 1K credits. Larger packages include volume bonuses.
const CREDIT_PACKAGES = {
  small: { credits: 500, price: 5, name: "500 Credits" },
  medium: { credits: 1250, price: 10, name: "1.25K Credits" },
  large: { credits: 3000, price: 20, name: "3K Credits" },
  xlarge: { credits: 10000, price: 50, name: "10K Credits" },
};

/**
 * POST /api/credits/purchase
 *
 * Create Stripe checkout session for credit purchase
 *
 * @body {string} package - small, medium, large, xlarge
 */
creditsRouter.post(
  "/purchase",
  asyncHandler(async (req: Request, res: Response<ApiResponse<PurchaseResponse>>) => {
    const log = logger.child({ module: "credits-route", action: "purchase" });
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;
    const userEmail = req.user.email;
    const body = req.body as PurchaseRequestBody;

    // Validate package
    const pkg = CREDIT_PACKAGES[body.package];
    if (!pkg) {
      throw new BadRequestError("Invalid package. Choose: small, medium, large, xlarge");
    }

    // Create Stripe checkout session
    const stripe = (await import("stripe")).default;
    if (!process.env.STRIPE_SECRET_KEY) throw new InternalError("Payment service is not configured");
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      customer_email: userEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `2Bot AI Credits - ${pkg.name}`,
              description: `${pkg.credits.toLocaleString()} credits for 2Bot AI`,
            },
            unit_amount: pkg.price * 100, // cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "credit_purchase",
        userId,
        package: body.package,
        credits: pkg.credits.toString(),
      },
      success_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/usage?purchase=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_DASHBOARD_URL}/usage?purchase=cancelled`,
    });

    log.info({
      userId,
      package: body.package,
      credits: pkg.credits,
      sessionId: session.id,
    }, "Credit purchase checkout created");

    res.json({
      success: true,
      data: {
        checkoutUrl: session.url ?? "",
        sessionId: session.id,
      },
    });
  })
);

// ===========================================
// GET /api/credits/packages
// ===========================================

interface PackagesResponse {
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
 * GET /api/credits/packages
 *
 * Get available credit packages
 */
creditsRouter.get(
  "/packages",
  asyncHandler(async (_req: Request, res: Response<ApiResponse<PackagesResponse>>) => {
    const packages = Object.entries(CREDIT_PACKAGES).map(([id, pkg]) => ({
      id,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      pricePerCredit: pkg.price / pkg.credits,
      popular: id === "medium",
    }));

    res.json({
      success: true,
      data: { packages },
    });
  })
);

// ===========================================
// Helpers
// ===========================================

// ===========================================
// POST /api/credits/claim
// ===========================================

/**
 * POST /api/credits/claim
 *
 * Claim daily credits for personal wallet.
 * Only available for FREE and STARTER plans.
 */
creditsRouter.post(
  "/claim",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;

    try {
      const result = await creditService.claimPersonalDailyCredits(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to claim credits";
      throw new BadRequestError(message);
    }
  })
);

// ===========================================
// GET /api/credits/claim-status
// ===========================================

/**
 * GET /api/credits/claim-status
 *
 * Get claim status for personal wallet.
 * Returns whether daily claim is available, next claim time, monthly progress.
 */
creditsRouter.get(
  "/claim-status",
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new BadRequestError("Not authenticated");
    const userId = req.user.id;

    const status = await creditService.getPersonalClaimStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  })
);

