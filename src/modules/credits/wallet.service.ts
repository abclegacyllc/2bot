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
import { PLAN_LIMITS, type PlanType } from "@/shared/constants/plans";

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
   */
  async deductCredits(
    walletId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ newBalance: number; transactionId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.update({
        where: { id: walletId },
        data: {
          balance: { decrement: amount },
          monthlyUsed: { increment: amount },
        },
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
        // Deduct whole credits from balance
        const wallet = await tx.creditWallet.update({
          where: { id: walletId },
          data: {
            balance: { decrement: creditsToDeduct },
            monthlyUsed: { increment: creditsToDeduct },
            pendingCredits: remainingPending,
          },
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
          createdAt: true,
        },
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return { transactions, total };
  }

  /**
   * Reset monthly usage (called by cron job at billing period start)
   */
  async resetMonthlyUsage(walletId: string): Promise<void> {
    await prisma.creditWallet.update({
      where: { id: walletId },
      data: {
        monthlyUsed: 0,
        allocationResetAt: new Date(),
      },
    });

    log.info({ walletId }, "Reset monthly usage for wallet");
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
  // Private Helpers
  // ===========================================

  private toWallet(
    dbWallet: {
      id: string;
      userId: string | null;
      organizationId: string | null;
      balance: number;
      lifetime: number;
      pendingCredits: number;
      monthlyAllocation: number;
      monthlyUsed: number;
      allocationResetAt: Date | null;
    },
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
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const creditWalletService = new CreditWalletService();
