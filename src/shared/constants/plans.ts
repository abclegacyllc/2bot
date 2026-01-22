/**
 * Plan Limits Configuration
 * 
 * Defines resource limits for each subscription tier.
 * -1 means unlimited
 */

import type { IsolationLevel } from '../types/context';

// ===========================================
// Plan Type Definitions
// ===========================================

export type PlanType = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
export type ExecutionMode = 'SERVERLESS' | 'WORKSPACE';

// ===========================================
// Plan Type Arrays (for iteration/validation)
// ===========================================

export const ALL_PLAN_TYPES: PlanType[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
export const SERVERLESS_PLANS: PlanType[] = ['FREE', 'STARTER'];
export const WORKSPACE_PLANS: PlanType[] = ['PRO', 'BUSINESS', 'ENTERPRISE'];
export const PAID_PLAN_TYPES: PlanType[] = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

// ===========================================
// Plan Order/Hierarchy
// ===========================================

export const PLAN_ORDER: Record<PlanType, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  BUSINESS: 3,
  ENTERPRISE: 4,
};

// ===========================================
// Execution Mode Helpers
// ===========================================

/**
 * Get execution mode for a user based on their plan and add-on status
 */
export function getExecutionMode(plan: PlanType, hasWorkspaceAddon: boolean = false): ExecutionMode {
  if (WORKSPACE_PLANS.includes(plan) || hasWorkspaceAddon) {
    return 'WORKSPACE';
  }
  return 'SERVERLESS';
}

/**
 * Check if a plan includes workspace execution by default
 */
export function hasWorkspaceByDefault(plan: PlanType): boolean {
  return WORKSPACE_PLANS.includes(plan);
}

/**
 * Check if one plan is higher/better than another
 */
export function isHigherPlan(planA: PlanType, planB: PlanType): boolean {
  return PLAN_ORDER[planA] > PLAN_ORDER[planB];
}

/**
 * Check if one plan is at least as good as another
 */
export function isAtLeastPlan(userPlan: PlanType, requiredPlan: PlanType): boolean {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan];
}

// ===========================================
// Plan Limits Interface
// ===========================================

export interface WorkspaceResources {
  ramMb: number;
  cpuCores: number;
  storageMb: number;
}

export interface PlanLimits {
  // Execution Mode
  executionMode: ExecutionMode;
  
  // Serverless limits (only apply if mode = SERVERLESS)
  executionsPerMonth: number | null;  // null = unlimited
  
  // Workspace limits (only apply if mode = WORKSPACE)
  workspace: WorkspaceResources | null;  // null = not included (need add-on)
  
  // Always apply regardless of mode
  gateways: number;           // -1 = unlimited
  workflows: number;          // -1 = unlimited
  workflowSteps: number;
  plugins: number;            // -1 = unlimited
  aiTokensPerMonth: number;   // -1 = unlimited
  historyDays: number;
  
  // Organization limits (for org owners)
  maxDepartments: number;
  maxMembers: number;
  
  // Database isolation
  isolationLevel: IsolationLevel;
  dedicatedDb: boolean;
  canUpgradeToIsolated: boolean;
  customRegion?: boolean;
  
  // Pricing (cents)
  priceMonthly: number | null;  // null = custom
  priceYearly: number | null;
}

// ===========================================
// Plan Limits Configuration
// ===========================================

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  FREE: {
    executionMode: 'SERVERLESS',
    executionsPerMonth: 500,
    workspace: null,
    gateways: 1,
    workflows: 3,
    workflowSteps: 5,
    plugins: 3,
    aiTokensPerMonth: 10000,
    historyDays: 7,
    maxDepartments: 1,
    maxMembers: 3,
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: false,
    priceMonthly: 0,
    priceYearly: 0,
  },
  STARTER: {
    executionMode: 'SERVERLESS',
    executionsPerMonth: 5000,
    workspace: null,
    gateways: 3,
    workflows: 10,
    workflowSteps: 10,
    plugins: 10,
    aiTokensPerMonth: 100000,
    historyDays: 30,
    maxDepartments: 3,
    maxMembers: 5,
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: false,
    priceMonthly: 900,
    priceYearly: 9000,
  },
  PRO: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: 512, cpuCores: 0.5, storageMb: 2048 },
    gateways: 10,
    workflows: 50,
    workflowSteps: 15,
    plugins: 25,
    aiTokensPerMonth: 500000,
    historyDays: 90,
    maxDepartments: 5,
    maxMembers: 10,
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: true,
    priceMonthly: 2900,
    priceYearly: 29000,
  },
  BUSINESS: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: 2048, cpuCores: 2, storageMb: 10240 },
    gateways: 25,
    workflows: 200,
    workflowSteps: 25,
    plugins: 100,
    aiTokensPerMonth: 2000000,
    historyDays: 365,
    maxDepartments: 20,
    maxMembers: 50,
    isolationLevel: 'SHARED' as IsolationLevel,
    dedicatedDb: false,
    canUpgradeToIsolated: true,
    priceMonthly: 7900,
    priceYearly: 79000,
  },
  ENTERPRISE: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,  // UNLIMITED
    workspace: { ramMb: -1, cpuCores: -1, storageMb: -1 },  // Custom
    gateways: -1,
    workflows: -1,
    workflowSteps: 30,
    plugins: -1,
    aiTokensPerMonth: -1,
    historyDays: 365,
    maxDepartments: -1,
    maxMembers: -1,
    isolationLevel: 'DEDICATED' as IsolationLevel,
    dedicatedDb: true,
    canUpgradeToIsolated: true,
    customRegion: true,
    priceMonthly: null,  // Custom
    priceYearly: null,
  },
};

// ===========================================
// Plan Limits Helpers
// ===========================================

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Check if a user can perform an action based on their plan limits
 * @param plan - The user's plan type
 * @param key - The limit key to check  
 * @param currentUsage - Current usage count
 * @returns true if action is allowed, false if limit reached
 */
export function canDoAction(
  plan: PlanType,
  key: keyof Pick<PlanLimits, 'gateways' | 'workflows' | 'plugins' | 'aiTokensPerMonth'>,
  currentUsage: number
): boolean {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[key];
  if (limit === -1 || limit === null) return true; // unlimited
  return currentUsage < limit;
}

/**
 * Get remaining quota for a specific action
 * @returns -1 for unlimited, otherwise remaining count
 */
export function getRemainingQuota(
  plan: PlanType,
  key: keyof Pick<PlanLimits, 'gateways' | 'workflows' | 'plugins' | 'aiTokensPerMonth'>,
  currentUsage: number
): number {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[key];
  if (limit === -1 || limit === null) return -1; // unlimited
  return Math.max(0, limit - currentUsage);
}

/**
 * Check if a plan has unlimited access to a resource
 */
export function isUnlimited(
  plan: PlanType, 
  key: keyof Pick<PlanLimits, 'gateways' | 'workflows' | 'plugins' | 'aiTokensPerMonth' | 'executionsPerMonth'>
): boolean {
  const value = PLAN_LIMITS[plan][key];
  return value === -1 || value === null;
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

// Note: PLAN_ORDER (Record<PlanType, number>) is defined at the top of this file

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
  return PLAN_ORDER[targetPlan] > PLAN_ORDER[currentPlan];
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
  return PLAN_ORDER[targetPlan] < PLAN_ORDER[currentPlan];
}

/**
 * Compare two plans
 * @returns negative if planA < planB, 0 if equal, positive if planA > planB
 */
export function comparePlans(planA: PlanType, planB: PlanType): number {
  return PLAN_ORDER[planA] - PLAN_ORDER[planB];
}

/**
 * Get available upgrade options for a plan
 */
export function getUpgradeOptions(currentPlan: PlanType): PlanType[] {
  const currentOrder = PLAN_ORDER[currentPlan];
  // Enterprise is contact sales only
  return ALL_PLAN_TYPES.filter(plan => 
    PLAN_ORDER[plan] > currentOrder && plan !== 'ENTERPRISE'
  );
}

/**
 * Check if a plan is a paid plan
 */
export function isPaidPlan(plan: PlanType): boolean {
  return plan !== 'FREE';
}
