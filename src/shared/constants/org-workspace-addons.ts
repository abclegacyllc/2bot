/**
 * Organization Workspace Pool Boosters Configuration
 * 
 * Kubernetes-optimized org pool boosters with separated pricing.
 * These are 2x the specs of user add-ons at 2x the price, with 3x storage.
 * 
 * Organizations use these to expand their shared workspace pool.
 * All boosters stack on top of the org plan's included pool.
 * 
 * PRICING NOTES:
 * - Prices are in CENTS (e.g., 1000 = $10.00)
 * - Yearly price = monthly * 10 (2 months free)
 * - Formula: User add-on price * 2 = Org booster price
 * - Specs: 2x RAM, 2x CPU, 3x Storage vs user add-ons
 * 
 * K8s OPTIMIZATION:
 * - Power-of-2 RAM values for optimal bin-packing
 * - Standard CPU ratios for predictable scheduling
 */

import type { OrgPlanType } from './org-plans';

// ===========================================
// Type Definitions
// ===========================================

export type OrgWorkspaceBoosterTier = 'ORG_MICRO' | 'ORG_SMALL' | 'ORG_MEDIUM' | 'ORG_LARGE' | 'ORG_XLARGE';

export interface OrgWorkspaceSpecs {
  ramMb: number;
  cpuCores: number;
  storageMb: number;
}

export interface OrgWorkspacePricing {
  priceMonthly: number;  // cents
  priceYearly: number;   // cents
}

export interface OrgWorkspaceBooster extends OrgWorkspaceSpecs, OrgWorkspacePricing {
  tier: OrgWorkspaceBoosterTier;
  description: string;
  displayName: string;
}

// ===========================================
// SPECS CONFIGURATION (Kubernetes-Optimized)
// ===========================================
// Power-of-2 RAM for optimal K8s bin-packing
// 2x RAM, 2x CPU, 3x Storage vs user add-ons
// These specs are infrastructure-aligned, change rarely

export const ORG_WORKSPACE_SPECS: Record<OrgWorkspaceBoosterTier, OrgWorkspaceSpecs> = {
  ORG_MICRO: {
    ramMb: 2048,       // 2GB (2x user MICRO 1GB)
    cpuCores: 1,       // 1 core (2x user MICRO 0.5)
    storageMb: 30720,  // 30GB (3x user MICRO 10GB)
  },
  ORG_SMALL: {
    ramMb: 4096,       // 4GB (2x user SMALL 2GB)
    cpuCores: 2,       // 2 cores (2x user SMALL 1)
    storageMb: 61440,  // 60GB (3x user SMALL 20GB)
  },
  ORG_MEDIUM: {
    ramMb: 8192,       // 8GB (2x user MEDIUM 4GB)
    cpuCores: 4,       // 4 cores (2x user MEDIUM 2)
    storageMb: 122880, // 120GB (3x user MEDIUM 40GB)
  },
  ORG_LARGE: {
    ramMb: 16384,      // 16GB (2x user LARGE 8GB)
    cpuCores: 8,       // 8 cores (2x user LARGE 4)
    storageMb: 245760, // 240GB (3x user LARGE 80GB)
  },
  ORG_XLARGE: {
    ramMb: 32768,      // 32GB (2x user XLARGE 16GB)
    cpuCores: 16,      // 16 cores (2x user XLARGE 8)
    storageMb: 460800, // 450GB (3x user XLARGE 150GB)
  },
};

// ===========================================
// PRICING CONFIGURATION (Easy to Change!)
// ===========================================
// Formula: User add-on price * 2 = Org booster price
// Yearly = Monthly * 10 (gives 2 months free)
// Adjust these prices based on your infrastructure costs

export const ORG_WORKSPACE_PRICING: Record<OrgWorkspaceBoosterTier, OrgWorkspacePricing> = {
  ORG_MICRO: {
    priceMonthly: 1000,   // $10/mo (2x user MICRO $5)
    priceYearly: 10000,   // $100/yr
  },
  ORG_SMALL: {
    priceMonthly: 1800,   // $18/mo (2x user SMALL $9)
    priceYearly: 18000,   // $180/yr
  },
  ORG_MEDIUM: {
    priceMonthly: 3000,   // $30/mo (2x user MEDIUM $15)
    priceYearly: 30000,   // $300/yr
  },
  ORG_LARGE: {
    priceMonthly: 5800,   // $58/mo (2x user LARGE $29)
    priceYearly: 58000,   // $580/yr
  },
  ORG_XLARGE: {
    priceMonthly: 9800,   // $98/mo (2x user XLARGE $49)
    priceYearly: 98000,   // $980/yr
  },
};

// ===========================================
// TIER RESTRICTIONS BY ORG PLAN
// ===========================================
// Controls which boosters each org plan can purchase

export const ALLOWED_ORG_BOOSTERS_BY_PLAN: Record<OrgPlanType, OrgWorkspaceBoosterTier[]> = {
  ORG_FREE: ['ORG_MICRO', 'ORG_SMALL'],                                       // Micro + Small for free orgs
  ORG_STARTER: ['ORG_MICRO', 'ORG_SMALL'],                                    // Limited options
  ORG_GROWTH: ['ORG_MICRO', 'ORG_SMALL', 'ORG_MEDIUM'],                       // More options
  ORG_PRO: ['ORG_MICRO', 'ORG_SMALL', 'ORG_MEDIUM', 'ORG_LARGE', 'ORG_XLARGE'],       // All options
  ORG_BUSINESS: ['ORG_MICRO', 'ORG_SMALL', 'ORG_MEDIUM', 'ORG_LARGE', 'ORG_XLARGE'],  // All options
  ORG_ENTERPRISE: ['ORG_MICRO', 'ORG_SMALL', 'ORG_MEDIUM', 'ORG_LARGE', 'ORG_XLARGE'], // All + custom
};

// ===========================================
// COMBINED BOOSTER DATA
// ===========================================
// Merges specs, pricing, and metadata for each tier

export const ORG_WORKSPACE_BOOSTERS: Record<OrgWorkspaceBoosterTier, OrgWorkspaceBooster> = {
  ORG_MICRO: {
    tier: 'ORG_MICRO',
    displayName: 'Org Micro',
    description: 'Light expansion for small teams',
    ...ORG_WORKSPACE_SPECS.ORG_MICRO,
    ...ORG_WORKSPACE_PRICING.ORG_MICRO,
  },
  ORG_SMALL: {
    tier: 'ORG_SMALL',
    displayName: 'Org Small',
    description: 'Solid expansion for growing teams',
    ...ORG_WORKSPACE_SPECS.ORG_SMALL,
    ...ORG_WORKSPACE_PRICING.ORG_SMALL,
  },
  ORG_MEDIUM: {
    tier: 'ORG_MEDIUM',
    displayName: 'Org Medium',
    description: 'Substantial expansion for active teams',
    ...ORG_WORKSPACE_SPECS.ORG_MEDIUM,
    ...ORG_WORKSPACE_PRICING.ORG_MEDIUM,
  },
  ORG_LARGE: {
    tier: 'ORG_LARGE',
    displayName: 'Org Large',
    description: 'Major expansion for power users',
    ...ORG_WORKSPACE_SPECS.ORG_LARGE,
    ...ORG_WORKSPACE_PRICING.ORG_LARGE,
  },
  ORG_XLARGE: {
    tier: 'ORG_XLARGE',
    displayName: 'Org XLarge',
    description: 'Maximum expansion for demanding workloads',
    ...ORG_WORKSPACE_SPECS.ORG_XLARGE,
    ...ORG_WORKSPACE_PRICING.ORG_XLARGE,
  },
};

// ===========================================
// ALL TIERS (Ordered for display)
// ===========================================

export const ALL_ORG_BOOSTER_TIERS: OrgWorkspaceBoosterTier[] = [
  'ORG_MICRO',
  'ORG_SMALL',
  'ORG_MEDIUM',
  'ORG_LARGE',
  'ORG_XLARGE',
];

// ===========================================
// HELPER FUNCTIONS
// ===========================================

// Order of org plans from lowest to highest
const ORG_PLAN_ORDER: OrgPlanType[] = ['ORG_FREE', 'ORG_STARTER', 'ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS', 'ORG_ENTERPRISE'];

/**
 * Get the minimum required plan for a specific booster tier
 * Returns null if available to all plans (including ORG_FREE)
 */
export function getMinRequiredPlanForBooster(tier: OrgWorkspaceBoosterTier): OrgPlanType | null {
  for (const plan of ORG_PLAN_ORDER) {
    if (ALLOWED_ORG_BOOSTERS_BY_PLAN[plan]?.includes(tier)) {
      return plan === 'ORG_FREE' ? null : plan;
    }
  }
  return 'ORG_ENTERPRISE'; // Default to highest if not found
}

/**
 * Check if an org plan can purchase a specific booster tier
 */
export function canOrgPurchaseBooster(plan: OrgPlanType, tier: OrgWorkspaceBoosterTier): boolean {
  return ALLOWED_ORG_BOOSTERS_BY_PLAN[plan]?.includes(tier) ?? false;
}

/**
 * Calculate total pool resources from base pool + purchased boosters
 */
export function calculateTotalOrgPool(
  basePool: { ramMb: number | null; cpuCores: number | null; storageMb: number | null },
  purchasedBoosters: OrgWorkspaceBoosterTier[]
): { ramMb: number; cpuCores: number; storageMb: number } {
  const baseRam = basePool.ramMb ?? 0;
  const baseCpu = basePool.cpuCores ?? 0;
  const baseStorage = basePool.storageMb ?? 0;

  const boosterRam = purchasedBoosters.reduce(
    (sum, tier) => sum + ORG_WORKSPACE_SPECS[tier].ramMb,
    0
  );
  const boosterCpu = purchasedBoosters.reduce(
    (sum, tier) => sum + ORG_WORKSPACE_SPECS[tier].cpuCores,
    0
  );
  const boosterStorage = purchasedBoosters.reduce(
    (sum, tier) => sum + ORG_WORKSPACE_SPECS[tier].storageMb,
    0
  );

  return {
    ramMb: baseRam + boosterRam,
    cpuCores: baseCpu + boosterCpu,
    storageMb: baseStorage + boosterStorage,
  };
}

/**
 * Format org workspace resources for display
 */
export function formatOrgWorkspaceResources(specs: OrgWorkspaceSpecs): string {
  const ramGb = specs.ramMb / 1024;
  const storageGb = specs.storageMb / 1024;
  return `${ramGb}GB RAM, ${specs.cpuCores} CPU, ${storageGb.toFixed(0)}GB Storage`;
}

/**
 * Format price for display
 */
export function formatOrgBoosterPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}
