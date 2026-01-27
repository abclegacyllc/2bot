/**
 * Workspace Add-Ons Configuration
 * 
 * Kubernetes-optimized workspace tiers with separated pricing for easy adjustment.
 * 
 * For FREE/STARTER: Enables workspace mode (unlimited executions)
 * For PRO+: Expands existing workspace resources (STACKING mode)
 * 
 * PRICING NOTES:
 * - Prices are in CENTS (e.g., 500 = $5.00)
 * - Yearly price typically = monthly * 10 (2 months free)
 * - Adjust WORKSPACE_PRICING below when your infrastructure costs change
 * - Specs in WORKSPACE_SPECS are Kubernetes-optimized (power-of-2 RAM)
 */

import type { PlanType, WorkspaceResources } from './plans';

// ===========================================
// Type Definitions
// ===========================================

export type WorkspaceAddonTier = 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';

export interface WorkspaceSpecs {
  ramMb: number;
  cpuCores: number;
  storageMb: number;
}

export interface WorkspacePricing {
  priceMonthly: number;  // cents
  priceYearly: number;   // cents
}

export interface WorkspaceAddon extends WorkspaceSpecs, WorkspacePricing {
  tier: WorkspaceAddonTier;
  description: string;
  displayName: string;
}

// ===========================================
// SPECS CONFIGURATION (Kubernetes-Optimized)
// ===========================================
// Power-of-2 RAM for optimal K8s bin-packing
// Standard CPU ratios for predictable scheduling
// These specs are infrastructure-aligned, change rarely

export const WORKSPACE_SPECS: Record<WorkspaceAddonTier, WorkspaceSpecs> = {
  MICRO: {
    ramMb: 1024,      // 1GB - fits 14 pods per 16GB node
    cpuCores: 0.5,
    storageMb: 10240, // 10GB
  },
  SMALL: {
    ramMb: 2048,      // 2GB - fits 7 pods per 16GB node
    cpuCores: 1,
    storageMb: 20480, // 20GB
  },
  MEDIUM: {
    ramMb: 4096,      // 4GB - fits 3 pods per 16GB node
    cpuCores: 2,
    storageMb: 40960, // 40GB
  },
  LARGE: {
    ramMb: 8192,      // 8GB - fits 1-2 pods per 16GB node
    cpuCores: 4,
    storageMb: 81920, // 80GB
  },
  XLARGE: {
    ramMb: 16384,     // 16GB - dedicated node
    cpuCores: 8,
    storageMb: 153600, // 150GB
  },
};

// ===========================================
// PRICING CONFIGURATION (Easy to Change!)
// ===========================================
// Adjust these prices based on your infrastructure costs.
// When you get cheaper servers, update prices here!
// Formula: Your cost + margin = price
// Yearly = Monthly * 10 (gives 2 months free)

export const WORKSPACE_PRICING: Record<WorkspaceAddonTier, WorkspacePricing> = {
  MICRO: {
    priceMonthly: 500,    // $5/mo
    priceYearly: 5000,    // $50/yr (2 months free)
  },
  SMALL: {
    priceMonthly: 900,    // $9/mo
    priceYearly: 9000,    // $90/yr
  },
  MEDIUM: {
    priceMonthly: 1500,   // $15/mo
    priceYearly: 15000,   // $150/yr
  },
  LARGE: {
    priceMonthly: 2900,   // $29/mo
    priceYearly: 29000,   // $290/yr
  },
  XLARGE: {
    priceMonthly: 4900,   // $49/mo
    priceYearly: 49000,   // $490/yr
  },
};

// ===========================================
// TIER RESTRICTIONS BY PLAN
// ===========================================
// Controls which add-ons each plan can purchase

export const ALLOWED_ADDONS_BY_PLAN: Record<PlanType, WorkspaceAddonTier[]> = {
  FREE: ['MICRO', 'SMALL'],                           // Limited options
  STARTER: ['MICRO', 'SMALL', 'MEDIUM'],              // More options
  PRO: ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'],       // All options
  BUSINESS: ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'],  // All options
  ENTERPRISE: ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'], // All + custom
};

// ===========================================
// COMBINED WORKSPACE ADD-ONS (Generated)
// ===========================================
// Combines specs + pricing + metadata

export const WORKSPACE_ADDONS: Record<WorkspaceAddonTier, WorkspaceAddon> = {
  MICRO: {
    tier: 'MICRO',
    displayName: 'Micro',
    description: 'Light automations and testing',
    ...WORKSPACE_SPECS.MICRO,
    ...WORKSPACE_PRICING.MICRO,
  },
  SMALL: {
    tier: 'SMALL',
    displayName: 'Small',
    description: 'Basic automation workloads',
    ...WORKSPACE_SPECS.SMALL,
    ...WORKSPACE_PRICING.SMALL,
  },
  MEDIUM: {
    tier: 'MEDIUM',
    displayName: 'Medium',
    description: 'Standard production workloads',
    ...WORKSPACE_SPECS.MEDIUM,
    ...WORKSPACE_PRICING.MEDIUM,
  },
  LARGE: {
    tier: 'LARGE',
    displayName: 'Large',
    description: 'Heavy automation and processing',
    ...WORKSPACE_SPECS.LARGE,
    ...WORKSPACE_PRICING.LARGE,
  },
  XLARGE: {
    tier: 'XLARGE',
    displayName: 'Extra Large',
    description: 'Maximum power for enterprise workloads',
    ...WORKSPACE_SPECS.XLARGE,
    ...WORKSPACE_PRICING.XLARGE,
  },
};

// ===========================================
// Helper Arrays
// ===========================================

export const ALL_ADDON_TIERS: WorkspaceAddonTier[] = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

// Ordered by size (for UI display)
export const ADDON_TIERS_ORDERED: WorkspaceAddonTier[] = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

// ===========================================
// Helper Functions
// ===========================================

/**
 * Check if a plan can purchase a specific add-on tier
 */
export function canPurchaseAddon(plan: PlanType, tier: WorkspaceAddonTier): boolean {
  return ALLOWED_ADDONS_BY_PLAN[plan]?.includes(tier) ?? false;
}

// Order of plans from lowest to highest
const PLAN_ORDER: PlanType[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

/**
 * Get the minimum required plan for a specific add-on tier
 * Returns null if available to all plans (including FREE)
 */
export function getMinRequiredPlanForAddon(tier: WorkspaceAddonTier): PlanType | null {
  for (const plan of PLAN_ORDER) {
    if (ALLOWED_ADDONS_BY_PLAN[plan]?.includes(tier)) {
      return plan === 'FREE' ? null : plan;
    }
  }
  return 'ENTERPRISE'; // Default to highest if not found
}

/**
 * Get allowed add-on tiers for a plan
 */
export function getAllowedAddonsForPlan(plan: PlanType): WorkspaceAddonTier[] {
  return ALLOWED_ADDONS_BY_PLAN[plan] ?? [];
}

/**
 * Calculate total workspace resources from plan + add-ons (STACKING mode)
 */
export function calculateTotalWorkspace(
  planWorkspace: WorkspaceResources | null,
  addons: WorkspaceAddonTier[]
): WorkspaceResources {
  const total: WorkspaceResources = {
    ramMb: planWorkspace?.ramMb ?? 0,
    cpuCores: planWorkspace?.cpuCores ?? 0,
    storageMb: planWorkspace?.storageMb ?? 0,
  };

  for (const addonTier of addons) {
    const addon = WORKSPACE_ADDONS[addonTier];
    total.ramMb += addon.ramMb;
    total.cpuCores += addon.cpuCores;
    total.storageMb += addon.storageMb;
  }

  return total;
}

/**
 * Check if user has workspace execution enabled (via plan or add-on)
 */
export function hasWorkspaceEnabled(
  planWorkspace: WorkspaceResources | null,
  addons: WorkspaceAddonTier[]
): boolean {
  return planWorkspace !== null || addons.length > 0;
}

/**
 * Calculate monthly price for selected add-ons
 */
export function calculateAddonsPrice(addons: WorkspaceAddonTier[], yearly: boolean = false): number {
  return addons.reduce((total, tier) => {
    const pricing = WORKSPACE_PRICING[tier];
    return total + (yearly ? pricing.priceYearly : pricing.priceMonthly);
  }, 0);
}

/**
 * Get add-on tier by name (case-insensitive)
 */
export function getAddonTier(tierName: string): WorkspaceAddonTier | null {
  const normalized = tierName.toUpperCase() as WorkspaceAddonTier;
  return ALL_ADDON_TIERS.includes(normalized) ? normalized : null;
}

/**
 * Format workspace resources for display
 */
export function formatWorkspaceResources(resources: WorkspaceResources): string {
  const ram = resources.ramMb >= 1024 
    ? `${(resources.ramMb / 1024).toFixed(0)}GB RAM`
    : `${resources.ramMb}MB RAM`;
  const cpu = resources.cpuCores >= 1 
    ? `${resources.cpuCores} CPU${resources.cpuCores > 1 ? 's' : ''}`
    : `${resources.cpuCores} vCPU`;
  const storage = resources.storageMb >= 1024
    ? `${(resources.storageMb / 1024).toFixed(0)}GB Storage`
    : `${resources.storageMb}MB Storage`;
  
  return `${ram}, ${cpu}, ${storage}`;
}

/**
 * Format price for display (cents to dollars)
 */
export function formatPrice(cents: number, yearly: boolean = false): string {
  const dollars = cents / 100;
  const suffix = yearly ? '/yr' : '/mo';
  return `$${dollars.toFixed(0)}${suffix}`;
}

/**
 * Get workspace tier display info for UI
 */
export function getWorkspaceTierDisplay(tier: WorkspaceAddonTier): {
  name: string;
  specs: string;
  price: string;
  priceYearly: string;
} {
  const addon = WORKSPACE_ADDONS[tier];
  return {
    name: addon.displayName,
    specs: formatWorkspaceResources(addon),
    price: formatPrice(addon.priceMonthly),
    priceYearly: formatPrice(addon.priceYearly, true),
  };
}

/**
 * Get all workspace tiers for display in UI
 */
export function getAllWorkspaceTiersForDisplay() {
  return ADDON_TIERS_ORDERED.map(tier => ({
    tier,
    ...getWorkspaceTierDisplay(tier),
    addon: WORKSPACE_ADDONS[tier],
  }));
}
