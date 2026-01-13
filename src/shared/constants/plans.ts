/**
 * Plan Limits Configuration
 * 
 * Defines resource limits for each subscription tier.
 * -1 means unlimited
 */

export const PLAN_LIMITS = {
  FREE: {
    gateways: 1,
    plugins: 3,
    executionsPerDay: 100,
    aiTokensPerMonth: 5000,
    ramMb: 256,
    storageMb: 100,
  },
  STARTER: {
    gateways: 3,
    plugins: 10,
    executionsPerDay: 1000,
    aiTokensPerMonth: 50000,
    ramMb: 512,
    storageMb: 500,
  },
  PRO: {
    gateways: 10,
    plugins: -1, // unlimited
    executionsPerDay: 10000,
    aiTokensPerMonth: 200000,
    ramMb: 1024,
    storageMb: 2000,
  },
  BUSINESS: {
    gateways: 25,
    plugins: -1,
    executionsPerDay: 50000,
    aiTokensPerMonth: 500000,
    ramMb: 2048,
    storageMb: 5000,
  },
  ENTERPRISE: {
    gateways: -1,
    plugins: -1,
    executionsPerDay: -1,
    aiTokensPerMonth: -1,
    ramMb: 4096,
    storageMb: 10000,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
export type PlanLimitKey = keyof (typeof PLAN_LIMITS)['FREE'];

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
