/**
 * Workspace Add-Ons Configuration
 * 
 * For FREE/STARTER: Enables workspace mode (unlimited executions)
 * For PRO+: Expands existing workspace resources
 */

import type { WorkspaceResources } from './plans';

// ===========================================
// Type Definitions
// ===========================================

export type WorkspaceAddonTier = 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'XLARGE';

export interface WorkspaceAddon {
  tier: WorkspaceAddonTier;
  ramMb: number;
  cpuCores: number;
  storageMb: number;
  priceMonthly: number;  // cents
  priceYearly: number;   // cents
  description: string;
}

// ===========================================
// Workspace Add-On Tiers
// ===========================================

export const WORKSPACE_ADDONS: Record<WorkspaceAddonTier, WorkspaceAddon> = {
  MICRO: {
    tier: 'MICRO',
    ramMb: 256,
    cpuCores: 0.25,
    storageMb: 1024,
    priceMonthly: 300,   // $3
    priceYearly: 3000,   // $30
    description: 'Basic workspace for light usage',
  },
  SMALL: {
    tier: 'SMALL',
    ramMb: 512,
    cpuCores: 0.5,
    storageMb: 2048,
    priceMonthly: 500,   // $5
    priceYearly: 5000,   // $50
    description: 'Good for simple automations',
  },
  MEDIUM: {
    tier: 'MEDIUM',
    ramMb: 1024,
    cpuCores: 1,
    storageMb: 5120,
    priceMonthly: 1000,  // $10
    priceYearly: 10000,  // $100
    description: 'Ideal for medium workloads',
  },
  LARGE: {
    tier: 'LARGE',
    ramMb: 2048,
    cpuCores: 2,
    storageMb: 10240,
    priceMonthly: 2000,  // $20
    priceYearly: 20000,  // $200
    description: 'For heavy automations',
  },
  XLARGE: {
    tier: 'XLARGE',
    ramMb: 4096,
    cpuCores: 4,
    storageMb: 25600,
    priceMonthly: 4000,  // $40
    priceYearly: 40000,  // $400
    description: 'Maximum power for enterprise workloads',
  },
};

// ===========================================
// Helper Arrays
// ===========================================

export const ALL_ADDON_TIERS: WorkspaceAddonTier[] = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'XLARGE'];

// ===========================================
// Helper Functions
// ===========================================

/**
 * Calculate total workspace resources from plan + add-ons
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
    const addon = WORKSPACE_ADDONS[tier];
    return total + (yearly ? addon.priceYearly : addon.priceMonthly);
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
    ? `${(resources.ramMb / 1024).toFixed(1)}GB RAM`
    : `${resources.ramMb}MB RAM`;
  const cpu = resources.cpuCores >= 1 
    ? `${resources.cpuCores} CPU${resources.cpuCores > 1 ? 's' : ''}`
    : `${resources.cpuCores} CPU`;
  const storage = resources.storageMb >= 1024
    ? `${(resources.storageMb / 1024).toFixed(1)}GB Storage`
    : `${resources.storageMb}MB Storage`;
  
  return `${ram}, ${cpu}, ${storage}`;
}
