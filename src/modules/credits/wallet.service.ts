/**
 * Credit Wallet Service
 *
 * Manages credit wallets for users and organizations.
 * 
 * IMPORTANT: Wallets are COMPLETELY SEPARATED:
 * - Personal wallets belong to users only
 * - Organization wallets belong to organizations only
 * - NO fallback between wallet types
 * - NO cross-visibility between wallet types
 *
 * Wallet Types:
 * - Personal: userId set, organizationId null (user's own credits)
 * - Organization: organizationId set, userId null (org's shared credits)
 *
 * @module modules/credits/wallet.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ORG_PLAN_LIMITS, type OrgPlanType } from "@/shared/constants/org-plans";
import { PLAN_LIMITS, type CreditClaimType, type PlanType } from "@/shared/constants/plans";
import type { CreditWallet as PrismaCreditWallet } from "@prisma/client";

const log = logger.child({ module: "credit-wallet" });

// ===========================================
// Types
// ===========================================

export type WalletType = "personal" | "organization";

export interface CreditWallet {
  id: string;
  type: WalletType;
  ownerId: string; // userId or organizationId
  balance: number;
  lifetime: number;
  pendingCredits: number; // Accumulated fractional credits
  monthlyAllocation: number;
  monthlyUsed: number;
  allocationResetAt: Date | null;
  lastClaimedAt: Date | null;
  monthlyClaimedTotal: number;
}

/**
 * Context for wallet operations
 * Must specify EITHER userId OR organizationId, never both for a single operation
 */
export interface WalletContext {
  /** User ID for personal wallet operations */
  userId?: string;
  /** Organization ID for organization wallet operations */
  organizationId?: string;
}

// ===========================================
// Credit Wallet Service
// ===========================================

class CreditWalletService {
  /**
   * Get personal wallet for a user (creates if not exists)
   * This is for USER operations only
   */
  async getOrCreatePersonalWallet(userId: string): Promise<CreditWallet> {
    let wallet = await prisma.creditWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      // Get initial credits from plan
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      });

      const plan = (user?.plan || "FREE") as PlanType;
      const initialCredits = this.getPlanCredits(plan);

      wallet = await prisma.creditWallet.create({
        data: {
          userId,
          balance: initialCredits,
          lifetime: initialCredits,
          monthlyAllocation: initialCredits,
        },
      });

      // Record initial grant
      await prisma.creditTransaction.create({
        data: {
          creditWalletId: wallet.id,
          type: "grant",
          amount: initialCredits,
          balanceAfter: initialCredits,
          description: "Initial plan credits",
          metadata: { walletType: "personal", plan },
        },
      });

      log.info({ userId, initialCredits, plan }, "Created personal wallet with initial credits");
    }

    return this.toWallet(wallet, "personal");
  }

  /**
   * Get personal wallet (returns null if not exists)
   */
  async getPersonalWallet(userId: string): Promise<CreditWallet | null> {
    const wallet = await prisma.creditWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return null;
    }

    return this.toWallet(wallet, "personal");
  }

  /**
   * Get organization wallet (returns null if not exists)
   * This is for ORGANIZATION operations only
   */
  async getOrgWallet(organizationId: string): Promise<CreditWallet | null> {
    const wallet = await prisma.creditWallet.findUnique({
      where: { organizationId },
    });

    if (!wallet) {
      return null;
    }

    return this.toWallet(wallet, "organization");
  }

  /**
   * Get or create organization wallet
   */
  async getOrCreateOrgWallet(organizationId: string): Promise<CreditWallet> {
    // Try to find existing wallet first
    let wallet = await prisma.creditWallet.findUnique({
      where: { organizationId },
    });

    if (wallet) {
      return this.toWallet(wallet, "organization");
    }

    try {
      // Get initial credits from org plan
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      });

      const plan = (org?.plan || "ORG_FREE") as OrgPlanType;
      const initialCredits = this.getOrgPlanCredits(plan);

      // Create new wallet
      wallet = await prisma.creditWallet.create({
        data: {
          organizationId,
          balance: initialCredits,
          lifetime: initialCredits,
          monthlyAllocation: initialCredits,
        },
      });

      // Record initial grant
      // Note: If transaction creation fails, we still have the wallet
      try {
        await prisma.creditTransaction.create({
          data: {
            creditWalletId: wallet.id,
            type: "grant",
            amount: initialCredits,
            balanceAfter: initialCredits,
            description: "Initial organization plan credits",
            metadata: { walletType: "organization", plan },
          },
        });
      } catch (txError) {
        log.warn({ organizationId, err: txError }, "Failed to create initial grant transaction");
      }

      log.info({ organizationId, initialCredits, plan }, "Created org wallet with initial credits");
      
      return this.toWallet(wallet, "organization");
    } catch (error) {
      // If creation failed (likely unique constraint violation due to race condition),
      // fetch the existing wallet
      log.warn({ organizationId, err: error }, "Failed to create org wallet, retrying fetch");
      
      const existingWallet = await prisma.creditWallet.findUnique({
        where: { organizationId },
      });

      if (existingWallet) {
        return this.toWallet(existingWallet, "organization");
      }

      // If still no wallet, rethrow error
      throw error;
    }
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string): Promise<CreditWallet | null> {
    const wallet = await prisma.creditWallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return null;
    }

    const type: WalletType = wallet.userId ? "personal" : "organization";
    return this.toWallet(wallet, type);
  }

  /**
   * Check if wallet has enough credits
   */
  async checkCredits(
    walletId: string,
    requiredCredits: number
  ): Promise<{
    hasCredits: boolean;
    wallet: CreditWallet;
    balance: number;
    required: number;
    remaining: number;
  }> {
    const wallet = await this.getWalletById(walletId);

    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    return {
      hasCredits: wallet.balance >= requiredCredits,
      wallet,
      balance: wallet.balance,
      required: requiredCredits,
      remaining: wallet.balance - requiredCredits,
    };
  }

  /**
   * Deduct credits from wallet
   * 
   * Uses a WHERE guard (balance >= amount) to prevent race conditions
   * that could result in negative balances from concurrent requests.
   */
  async deductCredits(
    walletId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ newBalance: number; transactionId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic check-and-decrement: only updates if balance >= amount
      const updated = await tx.creditWallet.updateMany({
        where: { id: walletId, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          monthlyUsed: { increment: amount },
        },
      });

      if (updated.count === 0) {
        throw new Error(`Insufficient credits in wallet ${walletId}. Required: ${amount}`);
      }

      // Re-read to get the new balance
      const wallet = await tx.creditWallet.findUniqueOrThrow({
        where: { id: walletId },
      });

      const transaction = await tx.creditTransaction.create({
        data: {
          creditWalletId: walletId,
          type: "usage",
          amount: -amount,
          balanceAfter: wallet.balance,
          description,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });

      return { wallet, transaction };
    });

    return {
      newBalance: result.wallet.balance,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Accumulate fractional credits and deduct whole credits when threshold reached
   * 
   * This method:
   * 1. Adds fractional credits to pendingCredits
   * 2. When pendingCredits >= 1, deducts floor(pending) from balance
   * 3. Keeps the remainder in pendingCredits
   * 
   * @returns creditsDeducted - The whole credits actually deducted from balance (0 or more)
   */
  async accumulateAndDeductCredits(
    walletId: string,
    fractionalCredits: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ 
    creditsDeducted: number; 
    newBalance: number; 
    newPendingCredits: number;
    transactionId: string | null;
  }> {
    const result = await prisma.$transaction(async (tx) => {
      // Get current wallet state
      const currentWallet = await tx.creditWallet.findUnique({
        where: { id: walletId },
      });

      if (!currentWallet) {
        throw new Error(`Wallet not found: ${walletId}`);
      }

      // Calculate new pending credits
      const newPending = currentWallet.pendingCredits + fractionalCredits;
      
      // Calculate how many whole credits to deduct
      const creditsToDeduct = Math.floor(newPending);
      const remainingPending = newPending - creditsToDeduct;

      let transaction = null;

      if (creditsToDeduct > 0) {
        // Atomic check-and-decrement: only updates if balance >= creditsToDeduct
        const updated = await tx.creditWallet.updateMany({
          where: { id: walletId, balance: { gte: creditsToDeduct } },
          data: {
            balance: { decrement: creditsToDeduct },
            monthlyUsed: { increment: creditsToDeduct },
            pendingCredits: remainingPending,
          },
        });

        if (updated.count === 0) {
          throw new Error(`Insufficient credits in wallet ${walletId}. Required: ${creditsToDeduct}, Available: ${currentWallet.balance}`);
        }

        // Re-read to get the new balance
        const wallet = await tx.creditWallet.findUniqueOrThrow({
          where: { id: walletId },
        });

        // Record transaction for the deduction
        transaction = await tx.creditTransaction.create({
          data: {
            creditWalletId: walletId,
            type: "usage",
            amount: -creditsToDeduct,
            balanceAfter: wallet.balance,
            description,
            metadata: metadata ? JSON.parse(JSON.stringify({
              ...metadata,
              fractionalCredits,
              pendingBefore: currentWallet.pendingCredits,
              pendingAfter: remainingPending,
            })) : undefined,
          },
        });

        return {
          creditsDeducted: creditsToDeduct,
          newBalance: wallet.balance,
          newPendingCredits: remainingPending,
          transactionId: transaction.id,
        };
      } else {
        // Just accumulate, no deduction yet
        await tx.creditWallet.update({
          where: { id: walletId },
          data: {
            pendingCredits: newPending,
          },
        });

        return {
          creditsDeducted: 0,
          newBalance: currentWallet.balance,
          newPendingCredits: newPending,
          transactionId: null,
        };
      }
    });

    if (result.creditsDeducted > 0) {
      log.debug(
        { walletId, fractionalCredits, creditsDeducted: result.creditsDeducted, newPending: result.newPendingCredits },
        "Deducted accumulated credits from wallet"
      );
    }

    return result;
  }

  /**
   * Add credits to wallet
   */
  async addCredits(
    walletId: string,
    amount: number,
    type: "purchase" | "bonus" | "grant" | "refund" | "allocation",
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ newBalance: number; transactionId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          lifetime: type === "purchase" ? { increment: amount } : undefined,
        },
      });

      const transaction = await tx.creditTransaction.create({
        data: {
          creditWalletId: walletId,
          type,
          amount,
          balanceAfter: wallet.balance,
          description,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      });

      return { wallet, transaction };
    });

    log.info({ walletId, amount, type, newBalance: result.wallet.balance }, "Added credits to wallet");

    return {
      newBalance: result.wallet.balance,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Get transactions for a wallet
   */
  async getTransactions(
    walletId: string,
    options: { limit?: number; offset?: number; type?: string } = {}
  ): Promise<{
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      balanceAfter: number;
      description: string | null;
      metadata: Record<string, unknown> | null;
      createdAt: Date;
    }>;
    total: number;
  }> {
    const where = {
      creditWalletId: walletId,
      ...(options.type ? { type: options.type } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options.limit || 50,
        skip: options.offset || 0,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        metadata: t.metadata as Record<string, unknown> | null,
      })),
      total,
    };
  }

  /**
   * Reset monthly usage (called by cron job at billing period start)
   * Also refreshes monthlyAllocation from current plan constants
   */
  async resetMonthlyUsage(walletId: string): Promise<void> {
    // Get the wallet to determine owner and plan
    const wallet = await prisma.creditWallet.findUnique({
      where: { id: walletId },
      include: {
        user: { select: { plan: true } },
        organization: { select: { plan: true } },
      },
    });

    let monthlyAllocation: number | undefined;
    if (wallet?.userId && wallet.user) {
      const plan = (wallet.user.plan || "FREE") as PlanType;
      monthlyAllocation = this.getPlanCredits(plan);
    } else if (wallet?.organizationId && wallet.organization) {
      const plan = (wallet.organization.plan || "ORG_FREE") as OrgPlanType;
      monthlyAllocation = this.getOrgPlanCredits(plan);
    }

    await prisma.creditWallet.update({
      where: { id: walletId },
      data: {
        monthlyUsed: 0,
        ...(monthlyAllocation !== undefined && { monthlyAllocation }),
        allocationResetAt: new Date(),
      },
    });

    log.info({ walletId, monthlyAllocation }, "Reset monthly usage for wallet");
  }

  /**
   * Get credits from personal plan
   */
  getPlanCredits(plan: PlanType): number {
    return PLAN_LIMITS[plan]?.creditsPerMonth || PLAN_LIMITS.FREE.creditsPerMonth;
  }

  /**
   * Get credits from org plan
   */
  getOrgPlanCredits(plan: OrgPlanType): number {
    return ORG_PLAN_LIMITS[plan]?.sharedCreditsPerMonth || ORG_PLAN_LIMITS.ORG_FREE.sharedCreditsPerMonth;
  }

  /**
   * Get plan credit limit for a user
   */
  async getUserPlanLimit(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const plan = (user?.plan || "FREE") as PlanType;
    return this.getPlanCredits(plan);
  }

  /**
   * Get plan credit limit for an organization
   */
  async getOrgPlanLimit(organizationId: string): Promise<number> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    const plan = (org?.plan || "ORG_FREE") as OrgPlanType;
    return this.getOrgPlanCredits(plan);
  }

  // ===========================================
  // Daily Credit Claims
  // ===========================================

  /**
   * Get the claim configuration for a wallet based on its owner's plan.
   */
  private async getClaimConfig(walletId: string): Promise<{
    creditClaimType: CreditClaimType;
    dailyCreditClaim: number;
    monthlyClaimCap: number;
    creditsPerMonth: number;
  }> {
    const wallet = await prisma.creditWallet.findUnique({
      where: { id: walletId },
      include: {
        user: { select: { plan: true } },
        organization: { select: { plan: true } },
      },
    });

    if (!wallet) throw new Error("Wallet not found");

    if (wallet.userId && wallet.user) {
      const plan = (wallet.user.plan || "FREE") as PlanType;
      const limits = PLAN_LIMITS[plan];
      return {
        creditClaimType: limits.creditClaimType,
        dailyCreditClaim: limits.dailyCreditClaim,
        monthlyClaimCap: limits.monthlyClaimCap,
        creditsPerMonth: limits.creditsPerMonth,
      };
    }

    if (wallet.organizationId && wallet.organization) {
      const plan = (wallet.organization.plan || "ORG_FREE") as OrgPlanType;
      const limits = ORG_PLAN_LIMITS[plan];
      return {
        creditClaimType: limits.creditClaimType,
        dailyCreditClaim: limits.dailyCreditClaim,
        monthlyClaimCap: limits.monthlyClaimCap,
        creditsPerMonth: limits.sharedCreditsPerMonth,
      };
    }

    throw new Error("Wallet has no owner");
  }

  /**
   * Claim daily credits for a wallet.
   * Only available for plans with creditClaimType = 'daily' (FREE, STARTER, ORG_FREE).
   *
   * Rules:
   * - Can only claim once per calendar day
   * - Monthly claimed total resets when a new month starts
   * - If monthly cap is reached, no more claims until next month
   * - Partial claim if remaining cap < daily amount
   */
  async claimDailyCredits(walletId: string): Promise<{
    credited: number;
    newBalance: number;
    monthlyClaimedTotal: number;
    monthlyClaimCap: number;
    nextClaimTime: Date;
  }> {
    const config = await this.getClaimConfig(walletId);

    if (config.creditClaimType !== "daily") {
      throw new Error("This plan does not support daily credit claims");
    }

    const wallet = await prisma.creditWallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if already claimed today
    if (wallet.lastClaimedAt) {
      const lastClaimDay = new Date(
        wallet.lastClaimedAt.getFullYear(),
        wallet.lastClaimedAt.getMonth(),
        wallet.lastClaimedAt.getDate()
      );
      if (lastClaimDay.getTime() === today.getTime()) {
        throw new Error("Already claimed today. Come back tomorrow!");
      }
    }

    // If new month since last claim, reset monthly total
    let currentMonthlyTotal = wallet.monthlyClaimedTotal;
    if (wallet.lastClaimedAt) {
      const lastMonth = wallet.lastClaimedAt.getMonth();
      const lastYear = wallet.lastClaimedAt.getFullYear();
      if (now.getMonth() !== lastMonth || now.getFullYear() !== lastYear) {
        currentMonthlyTotal = 0;
      }
    }

    // Check monthly cap
    if (currentMonthlyTotal >= config.monthlyClaimCap) {
      throw new Error("Monthly credit claim cap reached. Wait for next month!");
    }

    // Calculate credits to grant (partial if near cap)
    const remainingCap = config.monthlyClaimCap - currentMonthlyTotal;
    const creditsToGrant = Math.min(config.dailyCreditClaim, remainingCap);

    if (creditsToGrant <= 0) {
      throw new Error("No credits available to claim");
    }

    // Grant credits atomically
    const updatedWallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: creditsToGrant },
          lifetime: { increment: creditsToGrant },
          lastClaimedAt: now,
          monthlyClaimedTotal: currentMonthlyTotal + creditsToGrant,
        },
      });

      await tx.creditTransaction.create({
        data: {
          creditWalletId: walletId,
          type: "daily_claim",
          amount: creditsToGrant,
          balanceAfter: updated.balance,
          description: `Daily credit claim (+${creditsToGrant} credits)`,
          metadata: {
            dailyCreditClaim: config.dailyCreditClaim,
            monthlyClaimedTotal: currentMonthlyTotal + creditsToGrant,
            monthlyClaimCap: config.monthlyClaimCap,
          },
        },
      });

      return updated;
    });

    // Next claim time = midnight tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    log.info(
      { walletId, creditsToGrant, monthlyTotal: currentMonthlyTotal + creditsToGrant },
      "Daily credit claim completed"
    );

    return {
      credited: creditsToGrant,
      newBalance: updatedWallet.balance,
      monthlyClaimedTotal: currentMonthlyTotal + creditsToGrant,
      monthlyClaimCap: config.monthlyClaimCap,
      nextClaimTime: tomorrow,
    };
  }

  /**
   * Get the current claim status for a wallet.
   * Used by the frontend to display the claim button state.
   */
  async getClaimStatus(walletId: string): Promise<{
    canClaim: boolean;
    creditClaimType: CreditClaimType;
    dailyCreditClaim: number;
    monthlyClaimedTotal: number;
    monthlyClaimCap: number;
    nextClaimTime: Date | null;
    lastClaimedAt: Date | null;
    monthlyGrantDate: Date | null;
    monthlyGrantAmount: number;
  }> {
    const config = await this.getClaimConfig(walletId);

    if (config.creditClaimType !== "daily") {
      // For monthly/none plans, return grant info
      const wallet = await prisma.creditWallet.findUniqueOrThrow({
        where: { id: walletId },
      });
      return {
        canClaim: false,
        creditClaimType: config.creditClaimType,
        dailyCreditClaim: 0,
        monthlyClaimedTotal: 0,
        monthlyClaimCap: 0,
        nextClaimTime: null,
        lastClaimedAt: null,
        monthlyGrantDate: wallet.allocationResetAt,
        monthlyGrantAmount: config.creditsPerMonth,
      };
    }

    const wallet = await prisma.creditWallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if new month → reset monthly total
    let currentMonthlyTotal = wallet.monthlyClaimedTotal;
    if (wallet.lastClaimedAt) {
      const lastMonth = wallet.lastClaimedAt.getMonth();
      const lastYear = wallet.lastClaimedAt.getFullYear();
      if (now.getMonth() !== lastMonth || now.getFullYear() !== lastYear) {
        currentMonthlyTotal = 0;
      }
    }

    // Check if already claimed today
    let claimedToday = false;
    if (wallet.lastClaimedAt) {
      const lastClaimDay = new Date(
        wallet.lastClaimedAt.getFullYear(),
        wallet.lastClaimedAt.getMonth(),
        wallet.lastClaimedAt.getDate()
      );
      claimedToday = lastClaimDay.getTime() === today.getTime();
    }

    const capReached = currentMonthlyTotal >= config.monthlyClaimCap;
    const canClaim = !claimedToday && !capReached;

    // Next claim time
    let nextClaimTime: Date | null = null;
    if (claimedToday) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      nextClaimTime = tomorrow;
    }

    return {
      canClaim,
      creditClaimType: config.creditClaimType,
      dailyCreditClaim: config.dailyCreditClaim,
      monthlyClaimedTotal: currentMonthlyTotal,
      monthlyClaimCap: config.monthlyClaimCap,
      nextClaimTime,
      lastClaimedAt: wallet.lastClaimedAt,
      monthlyGrantDate: null,
      monthlyGrantAmount: 0,
    };
  }

  /**
   * Grant monthly credits for a wallet (PRO+ plans, ORG_STARTER+ plans).
   * Called by cron or on login check.
   *
   * - Resets monthlyUsed to 0
   * - Adds creditsPerMonth to balance
   * - Updates allocationResetAt
   */
  async grantMonthlyCredits(walletId: string): Promise<{
    granted: number;
    newBalance: number;
  } | null> {
    const config = await this.getClaimConfig(walletId);

    if (config.creditClaimType !== "monthly") {
      return null; // Not a monthly plan
    }

    const wallet = await prisma.creditWallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    // Check if monthly grant is due (never granted, or last grant was in a previous month)
    const now = new Date();
    if (wallet.allocationResetAt) {
      const lastResetMonth = wallet.allocationResetAt.getMonth();
      const lastResetYear = wallet.allocationResetAt.getFullYear();
      if (now.getMonth() === lastResetMonth && now.getFullYear() === lastResetYear) {
        return null; // Already granted this month
      }
    }

    const creditsToGrant = config.creditsPerMonth;
    if (creditsToGrant <= 0) {
      return null; // Unlimited or zero
    }

    const updatedWallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: creditsToGrant },
          lifetime: { increment: creditsToGrant },
          monthlyUsed: 0,
          monthlyAllocation: creditsToGrant,
          allocationResetAt: now,
          monthlyClaimedTotal: 0,
        },
      });

      await tx.creditTransaction.create({
        data: {
          creditWalletId: walletId,
          type: "monthly_grant",
          amount: creditsToGrant,
          balanceAfter: updated.balance,
          description: `Monthly credit grant (+${creditsToGrant} credits)`,
          metadata: { creditsPerMonth: creditsToGrant },
        },
      });

      return updated;
    });

    log.info(
      { walletId, creditsToGrant, newBalance: updatedWallet.balance },
      "Monthly credit grant completed"
    );

    return {
      granted: creditsToGrant,
      newBalance: updatedWallet.balance,
    };
  }

  /**
   * Process monthly reset for daily-claim wallets.
   * Resets monthlyUsed and monthlyClaimedTotal for a new billing period.
   * Called by cron at start of each month.
   */
  async processMonthlyResetForDailyClaim(walletId: string): Promise<void> {
    const config = await this.getClaimConfig(walletId);

    if (config.creditClaimType !== "daily") {
      return; // Not a daily claim plan
    }

    await prisma.creditWallet.update({
      where: { id: walletId },
      data: {
        monthlyUsed: 0,
        monthlyClaimedTotal: 0,
        monthlyAllocation: config.creditsPerMonth,
        allocationResetAt: new Date(),
      },
    });

    log.info({ walletId }, "Monthly reset for daily claim wallet");
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  private toWallet(
    dbWallet: PrismaCreditWallet,
    type: WalletType
  ): CreditWallet {
    return {
      id: dbWallet.id,
      type,
      ownerId: (type === "personal" ? dbWallet.userId : dbWallet.organizationId) as string,
      balance: dbWallet.balance,
      lifetime: dbWallet.lifetime,
      pendingCredits: dbWallet.pendingCredits,
      monthlyAllocation: dbWallet.monthlyAllocation,
      monthlyUsed: dbWallet.monthlyUsed,
      allocationResetAt: dbWallet.allocationResetAt,
      lastClaimedAt: dbWallet.lastClaimedAt,
      monthlyClaimedTotal: dbWallet.monthlyClaimedTotal,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const creditWalletService = new CreditWalletService();
