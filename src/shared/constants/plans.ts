/**
 * Plan Limits Configuration
 * 
 * Defines resource limits for each subscription tier.
 * -1 means unlimited
 */

import type { IsolationLevel } from '../types/context';

export const PLAN_LIMITS = {
  FREE: {
    gateways: 1,
    plugins: 3,
    executionsPerDay: 100,
    aiTokensPerMonth: 5000,
    ramMb: 256,
    storageMb: 100,
    // Database isolation
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: false,
  },
  STARTER: {
    gateways: 3,
    plugins: 10,
    executionsPerDay: 1000,
    aiTokensPerMonth: 50000,
    ramMb: 512,
    storageMb: 500,
    // Database isolation
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: false,
  },
  PRO: {
    gateways: 10,
    plugins: -1, // unlimited
    executionsPerDay: 10000,
    aiTokensPerMonth: 200000,
    ramMb: 1024,
    storageMb: 2000,
    // Database isolation
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: true, // Optional add-on
  },
  BUSINESS: {
    gateways: 25,
    plugins: -1,
    executionsPerDay: 50000,
    aiTokensPerMonth: 500000,
    ramMb: 2048,
    storageMb: 5000,
    // Database isolation
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: true, // Optional add-on
  },
  ENTERPRISE: {
    gateways: -1,
    plugins: -1,
    executionsPerDay: -1,
    aiTokensPerMonth: -1,
    ramMb: 4096,
    storageMb: 10000,
    // Database isolation (always dedicated)
    isolationLevel: 'DEDICATED' as IsolationLevel,
    dedicatedDb: true,
    canUpgradeToIsolated: true,
    customRegion: true, // Can choose database region
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

// Numeric limit keys (for quota checking)
export type PlanLimitKey = 'gateways' | 'plugins' | 'executionsPerDay' | 'aiTokensPerMonth' | 'ramMb' | 'storageMb';

// All keys including non-numeric ones
export type PlanConfigKey = keyof (typeof PLAN_LIMITS)['FREE'];

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan];
}

/**
 * Check if a user can perform an action based on their plan limits
 * @param plan - The user's plan type
 * @param action - The limit key to check
 * @param currentUsage - Current usage count
 * @returns true if action is allowed, false if limit reached
 */
export function canDoAction(
  plan: PlanType,
  action: PlanLimitKey,
  currentUsage: number
): boolean {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[action];
  if (limit === -1) return true; // unlimited
  return currentUsage < limit;
}

/**
 * Get remaining quota for a specific action
 * @returns -1 for unlimited, otherwise remaining count
 */
export function getRemainingQuota(
  plan: PlanType,
  action: PlanLimitKey,
  currentUsage: number
): number {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[action];
  if (limit === -1) return -1; // unlimited
  return Math.max(0, limit - currentUsage);
}

/**
 * Check if a plan has unlimited access to a resource
 */
export function isUnlimited(plan: PlanType, action: PlanLimitKey): boolean {
  return PLAN_LIMITS[plan][action] === -1;
}

// ===========================================
// Database Isolation Helpers
// ===========================================

/**
 * Get isolation level for a plan
 */
export function getPlanIsolationLevel(plan: PlanType): IsolationLevel {
  return PLAN_LIMITS[plan].isolationLevel;
}

/**
 * Check if plan has dedicated database by default
 */
export function hasDedicatedDb(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].dedicatedDb;
}

/**
 * Check if plan can upgrade to isolated database
 */
export function canUpgradeToIsolated(plan: PlanType): boolean {
  return PLAN_LIMITS[plan].canUpgradeToIsolated ?? false;
}

/**
 * Check if plan supports custom database region selection
 */
export function canChooseRegion(plan: PlanType): boolean {
  const limits = PLAN_LIMITS[plan];
  return 'customRegion' in limits && limits.customRegion === true;
}

/**
 * Plan pricing information (for display purposes)
 */
export const PLAN_PRICING = {
  FREE: {
    price: 0,
    interval: 'month',
    name: 'Free',
    description: 'For trying out the platform',
  },
  STARTER: {
    price: 9,
    interval: 'month',
    name: 'Starter',
    description: 'For individuals getting started',
  },
  PRO: {
    price: 29,
    interval: 'month',
    name: 'Pro',
    description: 'For professionals and small teams',
  },
  BUSINESS: {
    price: 79,
    interval: 'month',
    name: 'Business',
    description: 'For growing businesses',
  },
  ENTERPRISE: {
    price: -1, // Custom pricing
    interval: 'month',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
  },
} as const;

// ===========================================
// Stripe Price IDs (Phase 5: Billing)
// ===========================================

/**
 * Get Stripe Price IDs dynamically at runtime
 * This allows env vars to be loaded after module import
 * Set these in your .env file:
 * - STRIPE_PRICE_STARTER
 * - STRIPE_PRICE_PRO
 * - STRIPE_PRICE_BUSINESS
 */
function getStripePrices(): Record<PlanType, string | null> {
  return {
    FREE: null, // No Stripe subscription for free tier
    STARTER: process.env.STRIPE_PRICE_STARTER ?? null,
    PRO: process.env.STRIPE_PRICE_PRO ?? null,
    BUSINESS: process.env.STRIPE_PRICE_BUSINESS ?? null,
    ENTERPRISE: null, // Custom pricing - handled manually
  };
}

/**
 * @deprecated Use getPriceId() instead for runtime evaluation
 */
export const STRIPE_PRICES: Record<PlanType, string | null> = {
  FREE: null,
  STARTER: null, // Will be null at import time - use getPriceId() instead
  PRO: null,
  BUSINESS: null,
  ENTERPRISE: null,
};

/**
 * Plan prices in USD (for display and validation)
 */
export const PLAN_PRICES: Record<PlanType, number | null> = {
  FREE: 0,
  STARTER: 9,
  PRO: 29,
  BUSINESS: 79,
  ENTERPRISE: null, // Custom pricing
};

// ===========================================
// Plan Upgrade Logic
// ===========================================

/**
 * Plan hierarchy order (lowest to highest)
 */
const PLAN_ORDER: PlanType[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

/**
 * Get the Stripe Price ID for a plan
 * Evaluates at runtime to pick up env vars loaded by dotenv
 */
export function getPriceId(plan: PlanType): string | null {
  return getStripePrices()[plan];
}

/**
 * Check if upgrade from currentPlan to targetPlan is valid
 */
export function canUpgradeTo(currentPlan: PlanType, targetPlan: PlanType): boolean {
  return PLAN_ORDER.indexOf(targetPlan) > PLAN_ORDER.indexOf(currentPlan);
}

/**
 * Check if a plan has a Stripe price (can be purchased via Stripe)
 * Evaluates at runtime to pick up env vars loaded by dotenv
 */
export function hasStripePrice(plan: PlanType): boolean {
  return getStripePrices()[plan] !== null;
}
/**
 * Check if downgrade from currentPlan to targetPlan is valid
 */
export function canDowngradeTo(currentPlan: PlanType, targetPlan: PlanType): boolean {
  return PLAN_ORDER.indexOf(targetPlan) < PLAN_ORDER.indexOf(currentPlan);
}

/**
 * Compare two plans
 * @returns negative if planA < planB, 0 if equal, positive if planA > planB
 */
export function comparePlans(planA: PlanType, planB: PlanType): number {
  return PLAN_ORDER.indexOf(planA) - PLAN_ORDER.indexOf(planB);
}

/**
 * Get available upgrade options for a plan
 */
export function getUpgradeOptions(currentPlan: PlanType): PlanType[] {
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  // Enterprise is contact sales only
  return PLAN_ORDER.slice(currentIndex + 1).filter(plan => plan !== 'ENTERPRISE');
}

/**
 * Check if a plan is a paid plan
 */
export function isPaidPlan(plan: PlanType): boolean {
  return plan !== 'FREE';
}
