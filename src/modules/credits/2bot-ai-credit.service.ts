/**
 * AI Credit Service
 *
 * Handles AI-specific credit calculations and deductions for 2Bot AI.
 * 
 * IMPORTANT: This service operates on SPECIFIC wallets:
 * - If organizationId is provided → use ORGANIZATION wallet ONLY
 * - If userId only → use PERSONAL wallet ONLY
 * - NO FALLBACK between wallet types
 * - NO mixing of personal and organization credits
 *
 * The caller (2Bot AI provider) is responsible for determining
 * which wallet type to use based on the request context.
 *
 * NOTE: Pricing is imported from model-pricing.ts (single source of truth)
 *
 * @module modules/credits/2bot-ai-credit.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type {
    AICapability,
    TwoBotImageGenerationUsageData as ImageGenerationUsageData,
    RecordTwoBotUsageData,
    TwoBotSpeechRecognitionUsageData as SpeechRecognitionUsageData,
    TwoBotSpeechSynthesisUsageData as SpeechSynthesisUsageData,
    TwoBotTextGenerationUsageData as TextGenerationUsageData,
} from "@/modules/2bot-ai-provider";
import {
    calculateCreditsForUsageByCapability,
    getModelPricingByCapability,
    twoBotAIUsageService,
    type ImageGenerationModelPricing,
    type SpeechRecognitionModelPricing,
    type SpeechSynthesisModelPricing,
    type TextEmbeddingModelPricing,
    type TextGenerationModelPricing
} from "@/modules/2bot-ai-provider";
import { allocationService } from "@/modules/resource";
import { BadRequestError } from "@/shared/errors";
import { creditService, type CreditCheckResult } from "./credit.service";
import { creditWalletService, type WalletType } from "./wallet.service";

// Re-export types for backwards compatibility
export type { AICapability, ImageGenerationUsageData, SpeechRecognitionUsageData, SpeechSynthesisUsageData, TextGenerationUsageData };
export type RecordUsageData = RecordTwoBotUsageData;

const creditLogger = logger.child({ module: "ai-credit" });

// ===========================================
// Types
// ===========================================

/**
 * AI credit check result
 */
export interface AICreditCheckResult extends CreditCheckResult {
  estimatedCredits: number;
}

/**
 * AI credit deduction result
 */
export interface AICreditDeductionResult {
  success: boolean;
  creditsUsed: number;
  newBalance: number;
  usageId: string;
  walletType: WalletType;
  walletId: string;
}

/**
 * Credit rate configuration
 */
export interface CreditRateConfig {
  capability: AICapability;
  model: string;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  creditsPerImage?: number;
  creditsPerChar?: number;
  creditsPerMinute?: number;
}

// ===========================================
// Default Credit Rates - Uses centralized model-pricing.ts
// ===========================================

// NOTE: Rates are derived from model-pricing.ts using capability-based lookup
// Database override support is available via capability_model unique key

// ===========================================
// 2Bot AI Credit Service
// ===========================================

class TwoBotAICreditService {
  private rateCache: Map<string, CreditRateConfig> = new Map();
  private rateCacheExpiry: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get credit rate by capability
   * Priority: 1. Database by capability_model 2. Centralized pricing from model-pricing.ts
   */
  async getCreditRateByCapability(capability: AICapability, model: string): Promise<CreditRateConfig> {
    const key = `cap:${capability}:${model}`;

    // Check cache
    if (this.rateCacheExpiry && this.rateCacheExpiry > new Date()) {
      const cached = this.rateCache.get(key);
      if (cached) return cached;
    }

    // Try database with capability_model
    const dbRate = await prisma.creditRate.findUnique({
      where: { capability_model: { capability, model } },
    });

    if (dbRate) {
      const config: CreditRateConfig = {
        capability: dbRate.capability as AICapability,
        model: dbRate.model,
        creditsPerInputToken: dbRate.creditsPerInputToken ?? undefined,
        creditsPerOutputToken: dbRate.creditsPerOutputToken ?? undefined,
        creditsPerImage: dbRate.creditsPerImage ?? undefined,
        creditsPerChar: dbRate.creditsPerChar ?? undefined,
        creditsPerMinute: dbRate.creditsPerMinute ?? undefined,
      };
      this.rateCache.set(key, config);
      this.rateCacheExpiry = new Date(Date.now() + this.CACHE_TTL_MS);
      return config;
    }

    // Use centralized pricing from model-pricing.ts (single source of truth)
    const pricing = getModelPricingByCapability(capability, model);
    const config = this.convertPricingToConfig(capability, model, pricing);
    
    this.rateCache.set(key, config);
    this.rateCacheExpiry = new Date(Date.now() + this.CACHE_TTL_MS);
    return config;
  }

  /**
   * Convert model pricing to credit rate config format
   */
  private convertPricingToConfig(
    capability: AICapability,
    model: string,
    pricing: TextGenerationModelPricing | ImageGenerationModelPricing | SpeechSynthesisModelPricing | SpeechRecognitionModelPricing | TextEmbeddingModelPricing
  ): CreditRateConfig {
    const config: CreditRateConfig = { capability, model };

    if (capability === "text-generation" || capability === "image-understanding" || capability === "text-embedding") {
      const textGenPricing = pricing as TextGenerationModelPricing;
      config.creditsPerInputToken = textGenPricing.creditsPerInputToken;
      config.creditsPerOutputToken = textGenPricing.creditsPerOutputToken || 0;
    } else if (capability === "image-generation") {
      const imageGenPricing = pricing as ImageGenerationModelPricing;
      config.creditsPerImage = imageGenPricing.creditsPerImage;
    } else if (capability === "speech-synthesis") {
      const speechSynthPricing = pricing as SpeechSynthesisModelPricing;
      config.creditsPerChar = speechSynthPricing.creditsPerChar;
    } else if (capability === "speech-recognition") {
      const speechRecPricing = pricing as SpeechRecognitionModelPricing;
      config.creditsPerMinute = speechRecPricing.creditsPerMinute;
    }

    return config;
  }

  /**
   * Calculate credits for a usage
   * Uses centralized calculateCreditsForUsageByCapability from model-pricing.ts
   */
  async calculateCredits(data: RecordUsageData): Promise<number> {
    // Check for database override
    const dbRate = await prisma.creditRate.findUnique({
      where: { capability_model: { capability: data.capability, model: data.model } },
    });

    // If database override exists, use rate-based calculation method
    if (dbRate) {
      const rate = await this.getCreditRateByCapability(data.capability, data.model);
      return this.calculateCreditsWithRate(data, rate);
    }

    // Use centralized pricing calculation
    if (data.capability === "text-generation" || data.capability === "text-embedding" || data.capability === "image-understanding") {
      const textGenData = data as TextGenerationUsageData;
      return calculateCreditsForUsageByCapability(data.capability, data.model, {
        inputTokens: textGenData.inputTokens,
        outputTokens: textGenData.outputTokens,
      });
    } else if (data.capability === "image-generation") {
      const imageGenData = data as ImageGenerationUsageData;
      return calculateCreditsForUsageByCapability(data.capability, data.model, {
        imageCount: imageGenData.imageCount,
      });
    } else if (data.capability === "speech-synthesis") {
      const speechSynthData = data as SpeechSynthesisUsageData;
      return calculateCreditsForUsageByCapability(data.capability, data.model, {
        characterCount: speechSynthData.characterCount,
      });
    } else if (data.capability === "speech-recognition") {
      const speechRecData = data as SpeechRecognitionUsageData;
      return calculateCreditsForUsageByCapability(data.capability, data.model, {
        audioSeconds: speechRecData.audioSeconds,
      });
    }

    return 0;
  }

  /**
   * Calculate credits for a usage using the new capability-based system
   * Uses centralized calculateCreditsForUsageByCapability from model-pricing.ts
   */
  async calculateCreditsByCapability(
    capability: AICapability,
    model: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      imageCount?: number;
      characterCount?: number;
      audioSeconds?: number;
    }
  ): Promise<number> {
    // Use new capability-first lookup (tries capability_model, falls back to action_model)
    const rateConfig = await this.getCreditRateByCapability(capability, model);
    
    // If we got a database override, use rate-based calculation
    if (rateConfig.creditsPerInputToken !== undefined || 
        rateConfig.creditsPerOutputToken !== undefined ||
        rateConfig.creditsPerImage !== undefined ||
        rateConfig.creditsPerChar !== undefined ||
        rateConfig.creditsPerMinute !== undefined) {
      const fakeData = this.buildUsageDataFromCapability(capability, model, usage);
      return this.calculateCreditsWithRate(fakeData, rateConfig);
    }

    // Use new capability-based pricing calculation from model-pricing.ts
    return calculateCreditsForUsageByCapability(capability, model, usage);
  }

  /**
   * Build usage data from capability and usage params
   */
  private buildUsageDataFromCapability(
    capability: AICapability,
    model: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      imageCount?: number;
      characterCount?: number;
      audioSeconds?: number;
    }
  ): RecordUsageData {
    const base = { userId: "", model, capability };
    
    if (capability === "text-generation" || capability === "text-embedding" || capability === "image-understanding") {
      return { ...base, capability, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 } as TextGenerationUsageData;
    } else if (capability === "image-generation") {
      return { ...base, capability: "image-generation", imageCount: usage.imageCount || 1 } as ImageGenerationUsageData;
    } else if (capability === "speech-synthesis") {
      return { ...base, capability: "speech-synthesis", characterCount: usage.characterCount || 0 } as SpeechSynthesisUsageData;
    } else if (capability === "speech-recognition") {
      return { ...base, capability: "speech-recognition", audioSeconds: usage.audioSeconds || 0 } as SpeechRecognitionUsageData;
    }
    
    return { ...base, capability: "text-generation", inputTokens: 0, outputTokens: 0 } as TextGenerationUsageData;
  }

  /**
   * Calculate credits using a specific rate config (for database overrides)
   */
  private calculateCreditsWithRate(data: RecordUsageData, rate: CreditRateConfig): number {
    let credits = 0;

    if (data.capability === "text-generation" || data.capability === "text-embedding" || data.capability === "image-understanding") {
      const textGenData = data as TextGenerationUsageData;
      const inputCredits = textGenData.inputTokens * (rate.creditsPerInputToken || 0);
      const outputCredits = textGenData.outputTokens * (rate.creditsPerOutputToken || 0);
      credits = inputCredits + outputCredits; // Precise float
    } else if (data.capability === "image-generation") {
      const imageGenData = data as ImageGenerationUsageData;
      credits = imageGenData.imageCount * (rate.creditsPerImage || 0);
    } else if (data.capability === "speech-synthesis") {
      const speechSynthData = data as SpeechSynthesisUsageData;
      credits = speechSynthData.characterCount * (rate.creditsPerChar || 0); // Precise float
    } else if (data.capability === "speech-recognition") {
      const speechRecData = data as SpeechRecognitionUsageData;
      const minutes = speechRecData.audioSeconds / 60;
      credits = minutes * (rate.creditsPerMinute || 0); // Precise float
    }

    return credits;
  }

  /**
   * Check credits for a PERSONAL wallet
   * Called when user is NOT operating within an organization context
   */
  async checkPersonalCredits(
    userId: string,
    estimatedCredits: number
  ): Promise<AICreditCheckResult> {
    const check = await creditService.checkPersonalCredits(userId, estimatedCredits);

    return {
      ...check,
      estimatedCredits,
    };
  }

  /**
   * Check credits for an ORGANIZATION wallet
   * Called when user IS operating within an organization context
   */
  async checkOrgCredits(
    organizationId: string,
    estimatedCredits: number
  ): Promise<AICreditCheckResult | null> {
    const check = await creditService.checkOrgCredits(organizationId, estimatedCredits);

    if (!check) {
      return null;
    }

    return {
      ...check,
      estimatedCredits,
    };
  }

  /**
   * Deduct credits for 2Bot AI usage from PERSONAL wallet
   * Uses fractional credit accumulation - only deducts whole credits when pending >= 1
   */
  async deductPersonalCredits(
    data: RecordUsageData & { source: "2bot" }
  ): Promise<AICreditDeductionResult> {
    const fractionalCredits = await this.calculateCredits(data);
    const wallet = await creditWalletService.getOrCreatePersonalWallet(data.userId);

    // Check balance and plan limit (estimate worst case: 1 credit could be deducted)
    const planLimit = await creditWalletService.getUserPlanLimit(data.userId);
    const potentialDeduction = Math.ceil(wallet.pendingCredits + fractionalCredits);
    
    if (wallet.balance < potentialDeduction) {
      throw new BadRequestError(
        `Insufficient credits. Available: ${wallet.balance}, Pending: ${wallet.pendingCredits.toFixed(4)}`
      );
    }

    if (wallet.monthlyUsed + potentialDeduction > planLimit) {
      throw new BadRequestError(
        `Monthly credit limit reached. Limit: ${planLimit}, Used: ${wallet.monthlyUsed}`
      );
    }

    // Accumulate credits and deduct only when >= 1 whole credit
    const deductResult = await creditWalletService.accumulateAndDeductCredits(
      wallet.id,
      fractionalCredits,
      `2Bot AI: ${data.capability} (${data.model})`,
      {
        ...this.getUsageMetadata(data),
        category: "ai_usage",
      }
    );

    // Record precise fractional usage for analytics
    const usageId = await twoBotAIUsageService.recordUsage(data, fractionalCredits);

    creditLogger.info(
      {
        userId: data.userId,
        walletType: "personal",
        walletId: wallet.id,
        capability: data.capability,
        model: data.model,
        fractionalCredits,
        creditsDeducted: deductResult.creditsDeducted,
        pendingCredits: deductResult.newPendingCredits,
        newBalance: deductResult.newBalance,
      },
      "Recorded personal credits for 2Bot AI usage"
    );

    return {
      success: true,
      creditsUsed: fractionalCredits, // Return the precise fractional amount
      newBalance: deductResult.newBalance,
      usageId,
      walletType: "personal",
      walletId: wallet.id,
    };
  }

  /**
   * Deduct credits for 2Bot AI usage from ORGANIZATION wallet
   * Uses fractional credit accumulation - only deducts whole credits when pending >= 1
   */
  async deductOrgCredits(
    organizationId: string,
    data: RecordUsageData & { source: "2bot" }
  ): Promise<AICreditDeductionResult> {
    const fractionalCredits = await this.calculateCredits(data);
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    // Check balance and plan limit (estimate worst case: 1 credit could be deducted)
    const planLimit = await creditWalletService.getOrgPlanLimit(organizationId);
    const potentialDeduction = Math.ceil(wallet.pendingCredits + fractionalCredits);
    
    if (wallet.balance < potentialDeduction) {
      throw new BadRequestError(
        `Insufficient organization credits. Available: ${wallet.balance}, Pending: ${wallet.pendingCredits.toFixed(4)}`
      );
    }

    if (wallet.monthlyUsed + potentialDeduction > planLimit) {
      throw new BadRequestError(
        `Organization monthly credit limit reached. Limit: ${planLimit}, Used: ${wallet.monthlyUsed}`
      );
    }

    // Accumulate credits and deduct only when >= 1 whole credit
    const deductResult = await creditWalletService.accumulateAndDeductCredits(
      wallet.id,
      fractionalCredits,
      `2Bot AI: ${data.capability} (${data.model})`,
      {
        ...this.getUsageMetadata(data),
        category: "ai_usage",
        userId: data.userId,
      }
    );

    // Record precise fractional usage for analytics (with org context)
    const usageId = await twoBotAIUsageService.recordUsage(
      { ...data, organizationId },
      fractionalCredits
    );

    creditLogger.info(
      {
        organizationId,
        userId: data.userId,
        walletType: "organization",
        walletId: wallet.id,
        capability: data.capability,
        model: data.model,
        fractionalCredits,
        creditsDeducted: deductResult.creditsDeducted,
        pendingCredits: deductResult.newPendingCredits,
        newBalance: deductResult.newBalance,
      },
      "Recorded organization credits for 2Bot AI usage"
    );

    return {
      success: true,
      creditsUsed: fractionalCredits, // Return the precise fractional amount
      newBalance: deductResult.newBalance,
      usageId,
      walletType: "organization",
      walletId: wallet.id,
    };
  }

  /**
   * Deduct credits for 2Bot AI usage from ORGANIZATION wallet WITH BUDGET ENFORCEMENT
   * 
   * This method enforces department and member credit budgets in addition to
   * the organization wallet balance. The hierarchy is:
   * 1. Check org wallet balance (can afford?)
   * 2. Check department budget limit (if departmentId provided)
   * 3. Check member budget limit (if within department context)
   * 4. Accumulate credits and deduct from org wallet when >= 1
   * 5. Record usage against dept/member budgets
   * 
   * @param organizationId - The organization to charge
   * @param data - Usage data including userId, action, model, tokens, etc.
   * @param departmentId - Optional department ID for budget enforcement
   * @returns Deduction result with budget status
   */
  async deductOrgCreditsWithBudget(
    organizationId: string,
    data: RecordUsageData & { source: "2bot" },
    departmentId?: string
  ): Promise<AICreditDeductionResult & { budgetEnforced: boolean; budgetStatus?: { dept?: { used: number; limit: number }; member?: { used: number; limit: number } } }> {
    const fractionalCredits = await this.calculateCredits(data);
    const wallet = await creditWalletService.getOrCreateOrgWallet(organizationId);

    // Check org wallet balance and plan limit (estimate worst case)
    const planLimit = await creditWalletService.getOrgPlanLimit(organizationId);
    const potentialDeduction = Math.ceil(wallet.pendingCredits + fractionalCredits);
    
    if (wallet.balance < potentialDeduction) {
      throw new BadRequestError(
        `Insufficient organization credits. Available: ${wallet.balance}, Pending: ${wallet.pendingCredits.toFixed(4)}`
      );
    }

    if (wallet.monthlyUsed + potentialDeduction > planLimit) {
      throw new BadRequestError(
        `Organization monthly credit limit reached. Limit: ${planLimit}, Used: ${wallet.monthlyUsed}`
      );
    }

    let budgetEnforced = false;
    let budgetStatus: { dept?: { used: number; limit: number }; member?: { used: number; limit: number } } | undefined;

    // Check and enforce department budget if departmentId provided
    if (departmentId) {
      budgetEnforced = true;
      
      // Check department budget (use potential deduction for conservative check)
      const deptBudgetOk = await allocationService.checkDeptCreditBudget(
        departmentId,
        potentialDeduction
      );
      
      if (!deptBudgetOk) {
        const deptStatus = await allocationService.getDeptCreditStatus(departmentId);
        throw new BadRequestError(
          `Department credit budget exceeded. Used: ${deptStatus?.used ?? 0}, Budget: ${deptStatus?.budget ?? 0}`
        );
      }

      // Check member budget within department
      const memberBudgetOk = await allocationService.checkMemberCreditBudget(
        data.userId,
        departmentId,
        potentialDeduction
      );
      
      if (!memberBudgetOk) {
        const memberStatus = await allocationService.getMemberCreditStatus(data.userId, departmentId);
        throw new BadRequestError(
          `Member credit budget exceeded. Used: ${memberStatus?.used ?? 0}, Budget: ${memberStatus?.budget ?? 0}`
        );
      }
    }

    // Accumulate credits and deduct only when >= 1 whole credit
    const deductResult = await creditWalletService.accumulateAndDeductCredits(
      wallet.id,
      fractionalCredits,
      `2Bot AI: ${data.capability} (${data.model})`,
      {
        ...this.getUsageMetadata(data),
        category: "ai_usage",
        userId: data.userId,
        departmentId,
      }
    );

    // Record usage against budgets if enforced (use fractional for accurate tracking)
    if (departmentId) {
      await allocationService.recordDeptCreditUsage(departmentId, fractionalCredits);
      await allocationService.recordMemberCreditUsage(data.userId, departmentId, fractionalCredits);
      
      // Get updated status for response
      const deptStatus = await allocationService.getDeptCreditStatus(departmentId);
      const memberStatus = await allocationService.getMemberCreditStatus(data.userId, departmentId);
      
      budgetStatus = {
        dept: deptStatus ? { used: deptStatus.used, limit: deptStatus.budget ?? 0 } : undefined,
        member: memberStatus ? { used: memberStatus.used, limit: memberStatus.budget ?? 0 } : undefined,
      };
    }

    // Record precise fractional usage for analytics (with org and dept context)
    const usageId = await twoBotAIUsageService.recordUsage(
      { ...data, organizationId, departmentId },
      fractionalCredits
    );

    creditLogger.info(
      {
        organizationId,
        departmentId,
        userId: data.userId,
        walletType: "organization",
        walletId: wallet.id,
        capability: data.capability,
        model: data.model,
        fractionalCredits,
        creditsDeducted: deductResult.creditsDeducted,
        pendingCredits: deductResult.newPendingCredits,
        newBalance: deductResult.newBalance,
        budgetEnforced,
        budgetStatus,
      },
      "Recorded organization credits with budget enforcement"
    );

    return {
      success: true,
      creditsUsed: fractionalCredits,
      newBalance: deductResult.newBalance,
      usageId,
      walletType: "organization",
      walletId: wallet.id,
      budgetEnforced,
      budgetStatus,
    };
  }

  /**
   * Get personal credit balance
   */
  async getPersonalBalance(userId: string): Promise<{
    balance: number;
    lifetime: number;
    monthlyUsed: number;
    pendingCredits: number;
    planLimit: number;
    walletType: WalletType;
  }> {
    const balance = await creditService.getPersonalBalance(userId);
    const planLimit = await creditWalletService.getUserPlanLimit(userId);

    return {
      ...balance,
      planLimit,
    };
  }

  /**
   * Get organization credit balance
   */
  async getOrgBalance(organizationId: string): Promise<{
    balance: number;
    lifetime: number;
    monthlyUsed: number;
    pendingCredits: number;
    planLimit: number;
    walletType: WalletType;
  } | null> {
    const balance = await creditService.getOrgBalance(organizationId);
    
    if (!balance) {
      return null;
    }

    const planLimit = await creditWalletService.getOrgPlanLimit(organizationId);

    return {
      ...balance,
      planLimit,
    };
  }

  /**
   * Alias for getPersonalBalance (for route compatibility)
   */
  async getBalance(userId: string): Promise<{
    balance: number;
    lifetime: number;
    monthlyUsed: number;
    pendingCredits: number;
    planLimit: number;
    walletType: WalletType;
  }> {
    return this.getPersonalBalance(userId);
  }

  /**
   * Get personal credit transactions
   */
  async getTransactions(
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
    return creditService.getPersonalTransactions(userId, options);
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
    return creditService.getOrgTransactions(organizationId, options);
  }

  // ===========================================
  // Private Helpers
  // ===========================================

  private getUsageMetadata(data: RecordUsageData): Record<string, unknown> {
    if (data.capability === "text-generation" || data.capability === "text-embedding" || data.capability === "image-understanding") {
      const textGenData = data as TextGenerationUsageData;
      return {
        capability: data.capability,
        model: data.model,
        gatewayId: data.gatewayId,
        inputTokens: textGenData.inputTokens,
        outputTokens: textGenData.outputTokens,
      };
    } else if (data.capability === "image-generation") {
      const imageGenData = data as ImageGenerationUsageData;
      return {
        capability: data.capability,
        model: data.model,
        gatewayId: data.gatewayId,
        imageCount: imageGenData.imageCount,
      };
    } else if (data.capability === "speech-synthesis") {
      const speechSynthData = data as SpeechSynthesisUsageData;
      return {
        capability: data.capability,
        model: data.model,
        gatewayId: data.gatewayId,
        characterCount: speechSynthData.characterCount,
      };
    } else if (data.capability === "speech-recognition") {
      const speechRecData = data as SpeechRecognitionUsageData;
      return {
        capability: data.capability,
        model: data.model,
        gatewayId: data.gatewayId,
        audioSeconds: speechRecData.audioSeconds,
      };
    }
    return {
      capability: data.capability,
      model: data.model,
      gatewayId: data.gatewayId,
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const twoBotAICreditService = new TwoBotAICreditService();

// Backwards compatibility alias
export const aiCreditService = twoBotAICreditService;
