/**
 * Organization Plan Limits Configuration
 * 
 * Defines resource limits for each organization subscription tier.
 * Organizations have a shared pool that can be allocated to departments and members.
 * 
 * All org plans use WORKSPACE execution mode with unlimited executions.
 * 
 * WORKSPACE POOL NOTE:
 * - Pool specs are defined in ORG_WORKSPACE_POOL_SPECS (easy to change)
 * - Change INCLUDED_ORG_WORKSPACE_POOL to update which pool an org plan includes
 * - Organizations can purchase add-ons to expand their pool (STACKING mode)
 */

import type { ExecutionMode } from './plans';

// ===========================================
// Org Plan Type Definitions
// ===========================================

export type OrgPlanType = 
  | 'ORG_FREE'
  | 'ORG_STARTER' 
  | 'ORG_GROWTH' 
  | 'ORG_PRO' 
  | 'ORG_BUSINESS' 
  | 'ORG_ENTERPRISE';

// ===========================================
// Org Workspace Pool Tiers (Easy to Change!)
// ===========================================
// Define workspace pool specs for each org plan tier.
// These are K8s-optimized (power-of-2 RAM) for efficient scheduling.
// To change specs, update these values - all org plans will use them.

export type OrgWorkspacePoolTier = 'NONE' | 'TEAM' | 'GROWTH' | 'PRO' | 'BUSINESS' | 'CUSTOM';

export interface OrgWorkspacePoolSpecs {
  ramMb: number | null;       // null = custom/negotiated
  cpuCores: number | null;
  storageMb: number | null;
}

export const ORG_WORKSPACE_POOL_SPECS: Record<OrgWorkspacePoolTier, OrgWorkspacePoolSpecs> = {
  NONE: {
    ramMb: null,        // No pool - serverless only
    cpuCores: null,
    storageMb: null,
  },
  TEAM: {
    ramMb: 4096,        // 4GB - small team
    cpuCores: 2,
    storageMb: 20480,   // 20GB
  },
  GROWTH: {
    ramMb: 8192,        // 8GB - growing team
    cpuCores: 4,
    storageMb: 51200,   // 50GB
  },
  PRO: {
    ramMb: 16384,       // 16GB - professional
    cpuCores: 8,
    storageMb: 102400,  // 100GB
  },
  BUSINESS: {
    ramMb: 32768,       // 32GB - business
    cpuCores: 16,
    storageMb: 256000,  // 250GB
  },
  CUSTOM: {
    ramMb: null,        // Custom/negotiated
    cpuCores: null,
    storageMb: null,
  },
};

// ===========================================
// Included Workspace Pool per Org Plan
// ===========================================
// Maps which workspace pool tier is included with each org plan.
// To change what pool an org plan includes, just update this mapping.

export const INCLUDED_ORG_WORKSPACE_POOL: Record<OrgPlanType, OrgWorkspacePoolTier> = {
  ORG_FREE: 'NONE',         // No pool - serverless with limits
  ORG_STARTER: 'TEAM',      // 4GB, 2 CPU, 20GB
  ORG_GROWTH: 'GROWTH',     // 8GB, 4 CPU, 50GB
  ORG_PRO: 'PRO',           // 16GB, 8 CPU, 100GB
  ORG_BUSINESS: 'BUSINESS', // 32GB, 16 CPU, 250GB
  ORG_ENTERPRISE: 'CUSTOM', // Custom negotiated
};

/**
 * Get the workspace pool specs for an org plan
 */
export function getIncludedOrgWorkspacePool(plan: OrgPlanType): OrgWorkspacePoolSpecs {
  const tier = INCLUDED_ORG_WORKSPACE_POOL[plan];
  return ORG_WORKSPACE_POOL_SPECS[tier];
}

// ===========================================
// Org Plan Limits Interface
// ===========================================

export interface OrgPlanSeats {
  included: number;             // -1 = unlimited
  extraPricePerSeat: number;    // cents/month for additional seats
}

export interface OrgPlanPool {
  ramMb: number | null;         // null = custom/negotiated
  cpuCores: number | null;
  storageMb: number | null;
}

export interface OrgPlanFeatures {
  sso: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
  auditLogs: boolean;
  apiAccess: boolean;
  dedicatedDatabase: boolean;
}

export interface OrgPlanLimits {
  // Execution mode - SERVERLESS for free, WORKSPACE for paid
  executionMode: ExecutionMode;
  
  // Serverless limits (only for ORG_FREE)
  workflowRunsPerMonth: number | null;  // null = unlimited (workspace mode)
  
  // Shared automation pool
  sharedGateways: number;         // -1 = unlimited
  sharedPlugins: number;
  sharedWorkflows: number;
  sharedCreditsPerMonth: number;
  
  // Seats
  seats: OrgPlanSeats;
  departments: number | null;     // null = unlimited
  
  // Shared workspace pool
  pool: OrgPlanPool;
  
  // Features
  features: OrgPlanFeatures;
  
  // History retention
  historyDays: number;
  
  // Pricing (cents)
  priceMonthly: number | null;    // null = custom pricing
  priceYearly: number | null;
  
  // Display
  displayName: string;
  description: string;
}

// ===========================================
// Org Plan Limits Configuration
// ===========================================
// NOTE: Workspace pool specs come from ORG_WORKSPACE_POOL_SPECS via getIncludedOrgWorkspacePool().
// To change what workspace pool an org plan includes, update INCLUDED_ORG_WORKSPACE_POOL.

export const ORG_PLAN_LIMITS: Record<OrgPlanType, OrgPlanLimits> = {
  ORG_FREE: {
    executionMode: 'SERVERLESS',
    workflowRunsPerMonth: 1000,  // Limited in serverless mode
    sharedGateways: 2,
    sharedPlugins: 5,
    sharedWorkflows: 5,
    sharedCreditsPerMonth: 500,
    seats: { included: 3, extraPricePerSeat: 0 },  // Can't add more on free
    departments: 1,
    pool: getIncludedOrgWorkspacePool('ORG_FREE'),  // NONE - no workspace pool
    features: { 
      sso: false, 
      customBranding: false, 
      prioritySupport: false,
      auditLogs: false,
      apiAccess: false,
      dedicatedDatabase: false,
    },
    historyDays: 7,
    priceMonthly: 0,
    priceYearly: 0,
    displayName: 'Org Free',
    description: 'Try organization features with your team',
  },
  ORG_STARTER: {
    executionMode: 'WORKSPACE',
    workflowRunsPerMonth: null,  // Unlimited in workspace mode
    sharedGateways: 5,
    sharedPlugins: 20,
    sharedWorkflows: 25,
    sharedCreditsPerMonth: 5000,
    seats: { included: 5, extraPricePerSeat: 1000 },    // $10/seat
    departments: 3,
    pool: getIncludedOrgWorkspacePool('ORG_STARTER'),   // TEAM: 4GB, 2 CPU, 20GB
    features: { 
      sso: false, 
      customBranding: false, 
      prioritySupport: false,
      auditLogs: true,
      apiAccess: true,
      dedicatedDatabase: false,
    },
    historyDays: 30,
    priceMonthly: 4900,     // $49
    priceYearly: 49000,     // $490
    displayName: 'Org Starter',
    description: 'For small teams getting started with automation',
  },
  ORG_GROWTH: {
    executionMode: 'WORKSPACE',
    workflowRunsPerMonth: null,  // Unlimited in workspace mode
    sharedGateways: 15,
    sharedPlugins: 50,
    sharedWorkflows: 75,
    sharedCreditsPerMonth: 20000,
    seats: { included: 15, extraPricePerSeat: 700 },    // $7/seat
    departments: 10,
    pool: getIncludedOrgWorkspacePool('ORG_GROWTH'),    // GROWTH: 8GB, 4 CPU, 50GB
    features: { 
      sso: false, 
      customBranding: true, 
      prioritySupport: false,
      auditLogs: true,
      apiAccess: true,
      dedicatedDatabase: false,
    },
    historyDays: 90,
    priceMonthly: 9900,     // $99
    priceYearly: 99000,     // $990
    displayName: 'Org Growth',
    description: 'For growing teams with multiple departments',
  },
  ORG_PRO: {
    executionMode: 'WORKSPACE',
    workflowRunsPerMonth: null,  // Unlimited in workspace mode
    sharedGateways: 50,
    sharedPlugins: 150,
    sharedWorkflows: 250,
    sharedCreditsPerMonth: 100000,
    seats: { included: 40, extraPricePerSeat: 500 },    // $5/seat
    departments: 25,
    pool: getIncludedOrgWorkspacePool('ORG_PRO'),       // PRO: 16GB, 8 CPU, 100GB
    features: { 
      sso: true, 
      customBranding: true, 
      prioritySupport: true,
      auditLogs: true,
      apiAccess: true,
      dedicatedDatabase: false,
    },
    historyDays: 180,
    priceMonthly: 19900,    // $199
    priceYearly: 199000,    // $1,990
    displayName: 'Org Pro',
    description: 'For established organizations with advanced needs',
  },
  ORG_BUSINESS: {
    executionMode: 'WORKSPACE',
    workflowRunsPerMonth: null,  // Unlimited in workspace mode
    sharedGateways: 150,
    sharedPlugins: 500,
    sharedWorkflows: 1000,
    sharedCreditsPerMonth: 500000,
    seats: { included: 100, extraPricePerSeat: 300 },   // $3/seat
    departments: null,      // Unlimited
    pool: getIncludedOrgWorkspacePool('ORG_BUSINESS'),  // BUSINESS: 32GB, 16 CPU, 250GB
    features: { 
      sso: true, 
      customBranding: true, 
      prioritySupport: true,
      auditLogs: true,
      apiAccess: true,
      dedicatedDatabase: true,
    },
    historyDays: 365,
    priceMonthly: 39900,    // $399
    priceYearly: 399000,    // $3,990
    displayName: 'Org Business',
    description: 'For large organizations requiring enterprise features',
  },
  ORG_ENTERPRISE: {
    executionMode: 'WORKSPACE',
    workflowRunsPerMonth: null,  // Unlimited in workspace mode
    sharedGateways: -1,     // Unlimited
    sharedPlugins: -1,
    sharedWorkflows: -1,
    sharedCreditsPerMonth: -1,
    seats: { included: -1, extraPricePerSeat: 0 },
    departments: null,      // Unlimited
    pool: getIncludedOrgWorkspacePool('ORG_ENTERPRISE'), // CUSTOM: negotiated
    features: { 
      sso: true, 
      customBranding: true, 
      prioritySupport: true,
      auditLogs: true,
      apiAccess: true,
      dedicatedDatabase: true,
    },
    historyDays: 365,
    priceMonthly: null,     // Custom pricing
    priceYearly: null,
    displayName: 'Org Enterprise',
    description: 'Custom solution for enterprise requirements',
  },
};

// ===========================================
// Helper Arrays
// ===========================================

export const ALL_ORG_PLAN_TYPES: OrgPlanType[] = [
  'ORG_FREE',
  'ORG_STARTER', 
  'ORG_GROWTH', 
  'ORG_PRO', 
  'ORG_BUSINESS', 
  'ORG_ENTERPRISE',
];

export const PAID_ORG_PLAN_TYPES: OrgPlanType[] = [
  'ORG_STARTER', 
  'ORG_GROWTH', 
  'ORG_PRO', 
  'ORG_BUSINESS',
];

// ===========================================
// Org Plan Stripe Prices
// ===========================================

/**
 * Stripe price IDs for org plans
 * Set via environment variables for flexibility
 */
export const ORG_PLAN_STRIPE_PRICES: Partial<Record<OrgPlanType, string | undefined>> = {
  ORG_GROWTH: process.env.STRIPE_ORG_GROWTH_PRICE_ID,
  ORG_PRO: process.env.STRIPE_ORG_PRO_PRICE_ID,
  ORG_BUSINESS: process.env.STRIPE_ORG_BUSINESS_PRICE_ID,
  // ORG_FREE, ORG_STARTER, ORG_ENTERPRISE are not purchasable via Stripe checkout
};

// ===========================================
// Org Plan Upgrade Paths
// ===========================================

/**
 * Valid upgrade paths for org plans
 * Key = current plan, Value = array of plans they can upgrade to
 */
export const ORG_PLAN_UPGRADE_PATHS: Record<OrgPlanType, OrgPlanType[]> = {
  ORG_FREE: ['ORG_STARTER', 'ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS'],
  ORG_STARTER: ['ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS'],
  ORG_GROWTH: ['ORG_PRO', 'ORG_BUSINESS'],
  ORG_PRO: ['ORG_BUSINESS'],
  ORG_BUSINESS: ['ORG_ENTERPRISE'],
  ORG_ENTERPRISE: [], // Contact sales for changes
};

// ===========================================
// Org Plan Order/Hierarchy
// ===========================================

export const ORG_PLAN_ORDER: Record<OrgPlanType, number> = {
  ORG_FREE: 0,
  ORG_STARTER: 1,
  ORG_GROWTH: 2,
  ORG_PRO: 3,
  ORG_BUSINESS: 4,
  ORG_ENTERPRISE: 5,
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Check if one org plan is higher/better than another
 */
export function isHigherOrgPlan(planA: OrgPlanType, planB: OrgPlanType): boolean {
  return ORG_PLAN_ORDER[planA] > ORG_PLAN_ORDER[planB];
}

/**
 * Check if org plan is at least as good as another
 */
export function isAtLeastOrgPlan(userPlan: OrgPlanType, requiredPlan: OrgPlanType): boolean {
  return ORG_PLAN_ORDER[userPlan] >= ORG_PLAN_ORDER[requiredPlan];
}

/**
 * Get the limits for an org plan
 */
export function getOrgPlanLimits(plan: OrgPlanType): OrgPlanLimits {
  return ORG_PLAN_LIMITS[plan];
}

/**
 * Check if org plan has a specific feature
 */
export function orgPlanHasFeature(
  plan: OrgPlanType, 
  feature: keyof OrgPlanFeatures
): boolean {
  return ORG_PLAN_LIMITS[plan].features[feature];
}

/**
 * Check if a value exceeds the org plan limit
 * @param current Current usage
 * @param limit Plan limit (-1 = unlimited)
 * @returns true if limit exceeded
 */
export function isOrgLimitExceeded(current: number, limit: number): boolean {
  if (limit === -1) return false;  // Unlimited
  return current >= limit;
}

/**
 * Calculate remaining capacity for an org plan limit
 * @param current Current usage
 * @param limit Plan limit (-1 = unlimited)
 * @returns Remaining capacity, or -1 if unlimited
 */
export function getOrgRemainingCapacity(current: number, limit: number): number {
  if (limit === -1) return -1;  // Unlimited
  return Math.max(0, limit - current);
}

/**
 * Calculate price for additional seats
 */
export function calculateExtraSeatsPrice(
  plan: OrgPlanType, 
  extraSeats: number,
  yearly: boolean = false
): number {
  const limits = ORG_PLAN_LIMITS[plan];
  const pricePerSeat = limits.seats.extraPricePerSeat;
  const monthlyPrice = extraSeats * pricePerSeat;
  return yearly ? monthlyPrice * 10 : monthlyPrice;  // 2 months free for yearly
}

/**
 * Format org plan pool resources for display
 */
export function formatOrgPoolResources(pool: OrgPlanPool): string {
  if (pool.ramMb === null || pool.cpuCores === null || pool.storageMb === null) {
    return 'Custom resources';
  }
  
  const ram = pool.ramMb >= 1024 
    ? `${(pool.ramMb / 1024).toFixed(0)}GB RAM`
    : `${pool.ramMb}MB RAM`;
  const cpu = `${pool.cpuCores} CPU${pool.cpuCores > 1 ? 's' : ''}`;
  const storage = pool.storageMb >= 1024
    ? `${(pool.storageMb / 1024).toFixed(0)}GB Storage`
    : `${pool.storageMb}MB Storage`;
  
  return `${ram}, ${cpu}, ${storage}`;
}

// ===========================================
// Org Plan Display Features (for UI)
// ===========================================

/**
 * User-friendly feature strings for each org plan (derived from ORG_PLAN_LIMITS)
 * Used by pricing pages, upgrade modals, etc.
 */
export function getOrgPlanFeatures(plan: OrgPlanType): string[] {
  const limits = ORG_PLAN_LIMITS[plan];
  const features: string[] = [];
  
  // Seats
  if (limits.seats.included === -1) {
    features.push('Unlimited team members');
  } else {
    features.push(`${limits.seats.included} team members`);
  }
  
  // Gateways
  if (limits.sharedGateways === -1) {
    features.push('Unlimited shared gateways');
  } else {
    features.push(`${limits.sharedGateways} shared gateways`);
  }
  
  // Plugins
  if (limits.sharedPlugins === -1) {
    features.push('Unlimited plugins');
  } else {
    features.push(`${limits.sharedPlugins} plugins`);
  }
  
  // Workflows
  if (limits.sharedWorkflows === -1) {
    features.push('Unlimited workflows');
  } else {
    features.push(`${limits.sharedWorkflows} workflows`);
  }
  
  // Pool resources
  if (limits.pool.ramMb === null) {
    features.push('Custom RAM pool');
  } else {
    const ram = limits.pool.ramMb >= 1024 
      ? `${(limits.pool.ramMb / 1024).toFixed(0)}GB` 
      : `${limits.pool.ramMb}MB`;
    features.push(`${ram} RAM pool`);
  }
  
  // Features
  if (limits.features.sso) {
    features.push('SSO integration');
  }
  if (limits.features.customBranding) {
    features.push('Custom branding');
  }
  if (limits.features.prioritySupport) {
    features.push('Priority support');
  }
  if (limits.features.auditLogs) {
    features.push('Audit logs');
  }
  if (limits.features.dedicatedDatabase) {
    features.push('Dedicated database');
  }
  
  return features;
}

/**
 * Get all org plan display data for UI rendering
 */
export interface OrgPlanDisplayData {
  id: OrgPlanType;
  name: string;
  price: number; // -1 for custom
  description: string;
  features: string[];
  popular: boolean;
}

export function getAllOrgPlansForDisplay(): OrgPlanDisplayData[] {
  return ALL_ORG_PLAN_TYPES.map(planId => {
    const limits = ORG_PLAN_LIMITS[planId];
    return {
      id: planId,
      name: limits.displayName,
      price: limits.priceMonthly !== null ? limits.priceMonthly / 100 : -1,
      description: limits.description,
      features: getOrgPlanFeatures(planId),
      popular: planId === 'ORG_PRO', // PRO is most popular
    };
  });
}

/**
 * Get upgrade-eligible org plans for display (excludes ENTERPRISE - contact sales)
 */
export function getOrgUpgradePlansForDisplay(): OrgPlanDisplayData[] {
  return getAllOrgPlansForDisplay();
}

/**
 * Get the display name for an org plan
 * Single source of truth for org plan display names
 */
export function getOrgPlanDisplayName(plan: OrgPlanType): string {
  return ORG_PLAN_LIMITS[plan].displayName;
}
