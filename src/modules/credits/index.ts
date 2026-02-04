/**
 * Credits Module
 *
 * Universal credit system for the 2Bot platform.
 * 
 * IMPORTANT: Credits are COMPLETELY SEPARATED:
 * - Personal credits belong to users only
 * - Organization credits belong to organizations only
 * - NO fallback between wallet types
 * - NO cross-visibility between wallet types
 *
 * Architecture:
 * - wallet.service.ts: Low-level wallet operations
 * - credit.service.ts: General credit operations
 * - 2bot-ai-credit.service.ts: 2Bot AI-specific credit calculations
 *
 * Usage:
 * - For personal credits: use creditService methods
 * - For org credits: use creditService.getOrg* methods
 * - For 2Bot AI credits: use twoBotAICreditService methods
 *
 * @module modules/credits
 */

// Wallet Service - Low-level wallet operations
export {
    creditWalletService,
    type CreditWallet,
    type WalletContext,
    type WalletType
} from "./wallet.service";

// Credit Service - General credit operations
export {
    creditService,
    type CreditCheckResult,
    type CreditDeductionResult,
    type CreditTransactionType,
    type CreditUsageCategory,
    type DeductCreditsOptions,
    type GetTransactionsOptions
} from "./credit.service";

// 2Bot AI Credit Service - AI-specific credit calculations
export {
    aiCreditService, // Backwards compatibility alias
    twoBotAICreditService,
    type AICreditCheckResult,
    type AICreditDeductionResult,
    type CreditRateConfig
} from "./2bot-ai-credit.service";

