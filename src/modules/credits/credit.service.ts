/**
 * Credit Service
 *
 * UNIVERSAL credit service for the 2Bot platform.
 * 
 * Credits are a universal currency that can be used for:
 * - 2Bot AI (chat, image, TTS, STT)
 * - Marketplace (plugins, themes, templates) - future
 * - Premium features - future
 * - Any paid platform feature
 *
 * IMPORTANT: Credits are COMPLETELY SEPARATED:
 * - Personal credits belong to the USER only
 * - Organization credits belong to the ORGANIZATION only
 * - No fallback, no cross-visibility, no mixing
 *
 * Architecture:
 * - credit.service.ts: Universal credit operations (this file)
 * - wallet.service.ts: Low-level wallet storage
 * - ai-credit.service.ts: AI-specific rate calculations
 * - (future) marketplace-credit.service.ts: Marketplace pricing
 *
 * @module modules/credits/credit.service
 */

import { logger } from "@/lib/logger";
import {
    creditWalletService,
    type WalletType
} from "./wallet.service";

const creditLogger = logger.child({ module: "credit" });

// ===========================================
// Types
// ===========================================

/**
 * Credit usage categories for tracking and filtering
 * This enables universal credits across all platform features
 */
export type CreditUsageCategory =
  | "ai_usage"           // 2Bot AI (chat, image, TTS, STT)
  | "marketplace"        // Plugin/theme/template purchases
  | "premium_feature"    // Premium feature unlocks
  | "subscription"       // Auto-deductions for subscriptions
  | "transfer"           // Credit transfers (future)
  | "other";             // Miscellaneous

/**
 * Transaction types for credit operations
 */
export type CreditTransactionType =
  | "purchase"     // Bought credits
  | "usage"        // Spent credits
  | "refund"       // Refunded credits
  | "bonus"        // Promotional credits
  | "grant"        // Plan allocation / admin grant
  | "allocation"   // Monthly plan reset
  | "transfer_in"  // Received transfer (future)
  | "transfer_out"; // Sent transfer (future)

export interface CreditCheckResult {
  hasCredits: boolean;
  balance: number;
  required: number;
  remaining: number;
  walletType: WalletType;
  walletId: string;
  planLimit: number;
  monthlyUsed: number;
  withinPlanLimit: boolean;
}

export interface CreditDeductionResult {
  success: boolean;
  creditsUsed: number;
  newBalance: number;
  walletType: WalletType;
  walletId: string;
  transactionId: string;
  category: CreditUsageCategory;
}

/**
 * Options for deducting credits
 */
export interface DeductCreditsOptions {
  category: CreditUsageCategory;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Options for getting transactions with filtering
 */
export interface GetTransactionsOptions {
  limit?: number;
  offset?: number;
  type?: CreditTransactionType;
  category?: CreditUsageCategory;
  startDate?: Date;
  endDate?: Date;
}

// ===========================================
// Credit Service
// ===========================================

class CreditService {
  // ===========================================
  // Personal Credit Operations
  // ===========================================

  /**
   * Get personal credit balance for a user
   */
  async getPersonalBalance(userId: string): Promise<{
    balance: number;
    lifetime: number;
    monthlyUsed: number;
    pendingCredits: number;
    monthlyAllocation: number;
    walletType: WalletType;
  }> {
    const wallet = await creditWalletService.getOrCreatePersonalWallet(userId);
    return {
      balance: wallet.balance,
      lifetime: wallet.lifetime,
      monthlyUsed: wallet.monthlyUsed,
      pendingCredits: wallet.pendingCredits,
      monthlyAllocation: wallet.monthlyAllocation,
      walletType: "personal",
    };
  }

  /**
   * Check if user has enough personal credits
   */
  async checkPersonalCredits(
    userId: string,
    requiredCredits: number
  ): Promise<CreditCheckResult> {
    const wallet = await creditWalletService.getOrCreatePersonalWallet(userId);
    const planLimit = await creditWalletService.getUserPlanLimit(userId);

    const withinPlanLimit = wallet.monthlyUsed + requiredCredits <= planLimit;

    return {
      hasCredits: wallet.balance >= requiredCredits && withinPlanLimit,
      balance: wallet.balance,
      required: requiredCredits,
      remaining: wallet.balance - requiredCredits,
      walletType: "personal",
      walletId: wallet.id,
      planLimit,
      monthlyUsed: wallet.monthlyUsed,
      withinPlanLimit,
    };
  }

  /**
   * Deduct credits from user's personal wallet
   * 
   * UNIVERSAL: Works for any credit usage (AI, marketplace, premium, etc.)
   * The category helps track what the credits were used for.
   */
  async deductPersonalCredits(
    userId: string,
    amount: number,
    options: DeductCreditsOptions
  ): Promise<CreditDeductionResult> {
    const wallet = await creditWalletService.getOrCreatePersonalWallet(userId);

    const metadata = {
      ...options.metadata,
      category: options.category,
    };

    const result = await creditWalletService.deductCredits(
      wallet.id,
      amount,
      options.description,
      metadata
    );

    creditLogger.info(
      { userId, amount, category: options.category, newBalance: result.newBalance },
      "Deducted personal credits"
    );

    return {
      success: true,
      creditsUsed: amount,
      newBalance: result.newBalance,
      walletType: "personal",
      walletId: wallet.id,
      transactionId: result.transactionId,
      category: options.category,
    };
  }

  /**
   * Add credits to user's personal wallet
   */
  async addPersonalCredits(
    userId: string,
    amount: number,
    type: "purchase" | "bonus" | "grant" | "refund",
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ newBalance: number; walletType: WalletType }> {
    const wallet = await creditWalletService.getOrCreatePersonalWallet(userId);

    const result = await creditWalletService.addCredits(
      wallet.id,
      amount,
      type,
      description,
      metadata
    );

    creditLogger.info(
      { userId, amount, type, newBalance: result.newBalance },
      "Added personal credits"
    );

    return {
      newBalance: result.newBalance,
      walletType: "personal",
    };
  }

  /**
   * Get personal credit transactions
   */
  async getPersonalTransactions(
    userId: string,
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
    walletType: WalletType;
  }> {
    const wallet = await creditWalletService.getOrCreatePersonalWallet(userId);
    const result = await creditWalletService.getTransactions(wallet.id, options);

    return {
      ...result,
      walletType: "personal",
    };
  }

  // ===========================================
  // Organization Credit Operations
  // ===========================================

  /**
   * Get organization credit balance
   */
  async getOrgBalance(organizationId: string): Promise<{
    balance: number;
    lifetime: number;
    monthlyUsed: number;
    pendingCredits: number;
    monthlyAllocation: number;
    walletType: WalletType;
  } | null> {
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    return {
      balance: wallet.balance,
      lifetime: wallet.lifetime,
      monthlyUsed: wallet.monthlyUsed,
      pendingCredits: wallet.pendingCredits,
      monthlyAllocation: wallet.monthlyAllocation,
      walletType: "organization",
    };
  }

  /**
   * Check if organization has enough credits
   */
  async checkOrgCredits(
    organizationId: string,
    requiredCredits: number
  ): Promise<CreditCheckResult | null> {
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    const planLimit = await creditWalletService.getOrgPlanLimit(organizationId);
    const withinPlanLimit = wallet.monthlyUsed + requiredCredits <= planLimit;

    return {
      hasCredits: wallet.balance >= requiredCredits && withinPlanLimit,
      balance: wallet.balance,
      required: requiredCredits,
      remaining: wallet.balance - requiredCredits,
      walletType: "organization",
      walletId: wallet.id,
      planLimit,
      monthlyUsed: wallet.monthlyUsed,
      withinPlanLimit,
    };
  }

  /**
   * Deduct credits from organization wallet
   * 
   * UNIVERSAL: Works for any credit usage (AI, marketplace, premium, etc.)
   * The category helps track what the credits were used for.
   */
  async deductOrgCredits(
    organizationId: string,
    amount: number,
    options: DeductCreditsOptions
  ): Promise<CreditDeductionResult | null> {
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    const metadata = {
      ...options.metadata,
      category: options.category,
    };

    const result = await creditWalletService.deductCredits(
      wallet.id,
      amount,
      options.description,
      metadata
    );

    creditLogger.info(
      { organizationId, amount, category: options.category, newBalance: result.newBalance },
      "Deducted organization credits"
    );

    return {
      success: true,
      creditsUsed: amount,
      newBalance: result.newBalance,
      walletType: "organization",
      walletId: wallet.id,
      transactionId: result.transactionId,
      category: options.category,
    };
  }

  /**
   * Add credits to organization wallet
   */
  async addOrgCredits(
    organizationId: string,
    amount: number,
    type: "purchase" | "bonus" | "grant" | "refund",
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<{ newBalance: number; walletType: WalletType } | null> {
    let wallet = await creditWalletService.getOrgWallet(organizationId);

    // Create wallet if doesn't exist (for purchases)
    if (!wallet) {
      wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);
    }

    const result = await creditWalletService.addCredits(
      wallet.id,
      amount,
      type,
      description,
      metadata
    );

    creditLogger.info(
      { organizationId, amount, type, newBalance: result.newBalance },
      "Added organization credits"
    );

    return {
      newBalance: result.newBalance,
      walletType: "organization",
    };
  }

  /**
   * Get organization credit transactions
   */
  async getOrgTransactions(
    organizationId: string,
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
    walletType: WalletType;
  } | null> {
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    const result = await creditWalletService.getTransactions(wallet.id, options);

    return {
      ...result,
      walletType: "organization",
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const creditService = new CreditService();
