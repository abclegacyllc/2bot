/**
 * Organization Plan Limits Configuration
 * 
 * Defines resource limits for each organization subscription tier.
 * Organizations have a shared pool that can be allocated to departments and members.
 * 
 * All org plans use WORKSPACE execution mode with unlimited executions.
 */

import type { ExecutionMode } from './plans';

// ===========================================
// Org Plan Type Definitions
// ===========================================

export type OrgPlanType = 
  | 'ORG_STARTER' 
  | 'ORG_GROWTH' 
  | 'ORG_PRO' 
  | 'ORG_BUSINESS' 
  | 'ORG_ENTERPRISE';

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
  // All org plans use workspace mode
  executionMode: ExecutionMode;
  executionsPerMonth: null;  // Always unlimited for orgs
  
  // Shared automation pool
  sharedGateways: number;         // -1 = unlimited
  sharedPlugins: number;
  sharedWorkflows: number;
  sharedAiTokensPerMonth: number;
  
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

export const ORG_PLAN_LIMITS: Record<OrgPlanType, OrgPlanLimits> = {
  ORG_STARTER: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 5,
    sharedPlugins: 20,
    sharedWorkflows: 25,
    sharedAiTokensPerMonth: 500000,
    seats: { included: 5, extraPricePerSeat: 1000 },    // $10/seat
    departments: 3,
    pool: { ramMb: 4096, cpuCores: 2, storageMb: 20480 },
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
    displayName: 'Starter',
    description: 'For small teams getting started with automation',
  },
  ORG_GROWTH: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 15,
    sharedPlugins: 50,
    sharedWorkflows: 75,
    sharedAiTokensPerMonth: 2000000,
    seats: { included: 15, extraPricePerSeat: 700 },    // $7/seat
    departments: 10,
    pool: { ramMb: 8192, cpuCores: 4, storageMb: 51200 },
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
    displayName: 'Growth',
    description: 'For growing teams with multiple departments',
  },
  ORG_PRO: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 50,
    sharedPlugins: 150,
    sharedWorkflows: 250,
    sharedAiTokensPerMonth: 10000000,
    seats: { included: 40, extraPricePerSeat: 500 },    // $5/seat
    departments: 25,
    pool: { ramMb: 16384, cpuCores: 8, storageMb: 102400 },
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
    displayName: 'Professional',
    description: 'For established organizations with advanced needs',
  },
  ORG_BUSINESS: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: 150,
    sharedPlugins: 500,
    sharedWorkflows: 1000,
    sharedAiTokensPerMonth: 50000000,
    seats: { included: 100, extraPricePerSeat: 300 },   // $3/seat
    departments: null,      // Unlimited
    pool: { ramMb: 32768, cpuCores: 16, storageMb: 256000 },
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
    displayName: 'Business',
    description: 'For large organizations requiring enterprise features',
  },
  ORG_ENTERPRISE: {
    executionMode: 'WORKSPACE',
    executionsPerMonth: null,
    sharedGateways: -1,     // Unlimited
    sharedPlugins: -1,
    sharedWorkflows: -1,
    sharedAiTokensPerMonth: -1,
    seats: { included: -1, extraPricePerSeat: 0 },
    departments: null,      // Unlimited
    pool: { ramMb: null, cpuCores: null, storageMb: null },   // Custom
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
    displayName: 'Enterprise',
    description: 'Custom solution for enterprise requirements',
  },
};

// ===========================================
// Helper Arrays
// ===========================================

export const ALL_ORG_PLAN_TYPES: OrgPlanType[] = [
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
// Org Plan Order/Hierarchy
// ===========================================

export const ORG_PLAN_ORDER: Record<OrgPlanType, number> = {
  ORG_STARTER: 0,
  ORG_GROWTH: 1,
  ORG_PRO: 2,
  ORG_BUSINESS: 3,
  ORG_ENTERPRISE: 4,
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
