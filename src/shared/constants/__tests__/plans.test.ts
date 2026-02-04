/**
 * Plan Constants Tests
 * 
 * Tests for plan type definitions, limits, and helper functions
 * 
 * @module shared/constants/__tests__/plans.test
 */

import { describe, expect, it } from 'vitest';
import {
    // Plan Arrays
    ALL_PLAN_TYPES,
    canChooseRegion,
    canDoAction,
    canDowngradeTo,
    canUpgradeTo,
    canUpgradeToIsolated,
    comparePlans,
    // Functions
    getExecutionMode,
    getPlanIsolationLevel,
    getPlanLimits,
    getPriceId,
    getRemainingQuota,
    getUpgradeOptions,
    hasDedicatedDb,
    hasStripePrice,
    hasWorkspaceByDefault,
    isAtLeastPlan,
    isHigherPlan,
    isPaidPlan,
    isUnlimited,
    PAID_PLAN_TYPES,
    // Limits
    PLAN_LIMITS,
    // Plan Order
    PLAN_ORDER,
    SERVERLESS_PLANS,
    WORKSPACE_PLANS
} from '../plans';

// ===========================================
// PLAN_LIMITS Tests
// ===========================================

describe('PLAN_LIMITS', () => {
  it('has all 5 plan types', () => {
    expect(ALL_PLAN_TYPES).toHaveLength(5);
    expect(ALL_PLAN_TYPES).toContain('FREE');
    expect(ALL_PLAN_TYPES).toContain('STARTER');
    expect(ALL_PLAN_TYPES).toContain('PRO');
    expect(ALL_PLAN_TYPES).toContain('BUSINESS');
    expect(ALL_PLAN_TYPES).toContain('ENTERPRISE');
  });

  it('has SERVERLESS mode for FREE and STARTER', () => {
    expect(SERVERLESS_PLANS).toContain('FREE');
    expect(SERVERLESS_PLANS).toContain('STARTER');
    expect(SERVERLESS_PLANS).toHaveLength(2);
    
    // Verify execution mode in limits
    expect(PLAN_LIMITS.FREE.executionMode).toBe('SERVERLESS');
    expect(PLAN_LIMITS.STARTER.executionMode).toBe('SERVERLESS');
  });

  it('has WORKSPACE mode for PRO, BUSINESS, ENTERPRISE', () => {
    expect(WORKSPACE_PLANS).toContain('PRO');
    expect(WORKSPACE_PLANS).toContain('BUSINESS');
    expect(WORKSPACE_PLANS).toContain('ENTERPRISE');
    expect(WORKSPACE_PLANS).toHaveLength(3);
    
    // Verify execution mode in limits
    expect(PLAN_LIMITS.PRO.executionMode).toBe('WORKSPACE');
    expect(PLAN_LIMITS.BUSINESS.executionMode).toBe('WORKSPACE');
    expect(PLAN_LIMITS.ENTERPRISE.executionMode).toBe('WORKSPACE');
  });

  it('has workflow run limits for serverless plans', () => {
    // Serverless plans should have workflow run limits
    expect(PLAN_LIMITS.FREE.workflowRunsPerMonth).toBe(500);
    expect(PLAN_LIMITS.STARTER.workflowRunsPerMonth).toBe(5000);
    
    // Should be numeric, not null
    expect(typeof PLAN_LIMITS.FREE.workflowRunsPerMonth).toBe('number');
    expect(typeof PLAN_LIMITS.STARTER.workflowRunsPerMonth).toBe('number');
  });

  it('has workspace resources for workspace plans', () => {
    // Workspace plans should have workspace resources
    expect(PLAN_LIMITS.PRO.workspace).not.toBeNull();
    expect(PLAN_LIMITS.BUSINESS.workspace).not.toBeNull();
    expect(PLAN_LIMITS.ENTERPRISE.workspace).not.toBeNull();
    
    // Serverless plans should not have workspace resources
    expect(PLAN_LIMITS.FREE.workspace).toBeNull();
    expect(PLAN_LIMITS.STARTER.workspace).toBeNull();
    
    // Check workspace resource structure (PRO gets SMALL tier: 2GB RAM, 1 CPU, 20GB storage)
    expect(PLAN_LIMITS.PRO.workspace).toEqual({
      ramMb: 2048,
      cpuCores: 1,
      storageMb: 20480,
    });
    
    // Check workspace plans have unlimited workflow runs
    expect(PLAN_LIMITS.PRO.workflowRunsPerMonth).toBeNull();
    expect(PLAN_LIMITS.BUSINESS.workflowRunsPerMonth).toBeNull();
    expect(PLAN_LIMITS.ENTERPRISE.workflowRunsPerMonth).toBeNull();
  });

  it('has increasing gateway limits per tier', () => {
    expect(PLAN_LIMITS.FREE.gateways).toBe(1);
    expect(PLAN_LIMITS.STARTER.gateways).toBe(3);
    expect(PLAN_LIMITS.PRO.gateways).toBe(10);
    expect(PLAN_LIMITS.BUSINESS.gateways).toBe(25);
    expect(PLAN_LIMITS.ENTERPRISE.gateways).toBe(-1); // unlimited
  });

  it('has increasing workflow limits per tier', () => {
    expect(PLAN_LIMITS.FREE.workflows).toBe(3);
    expect(PLAN_LIMITS.STARTER.workflows).toBe(10);
    expect(PLAN_LIMITS.PRO.workflows).toBe(50);
    expect(PLAN_LIMITS.BUSINESS.workflows).toBe(200);
    expect(PLAN_LIMITS.ENTERPRISE.workflows).toBe(-1); // unlimited
  });

  it('has enterprise features only for ENTERPRISE plan', () => {
    expect(PLAN_LIMITS.ENTERPRISE.dedicatedDb).toBe(true);
    expect(PLAN_LIMITS.ENTERPRISE.customRegion).toBe(true);
    expect(PLAN_LIMITS.ENTERPRISE.isolationLevel).toBe('DEDICATED');
    
    // Non-enterprise plans don't have dedicated db by default
    expect(PLAN_LIMITS.FREE.dedicatedDb).toBe(false);
    expect(PLAN_LIMITS.STARTER.dedicatedDb).toBe(false);
    expect(PLAN_LIMITS.PRO.dedicatedDb).toBe(false);
    expect(PLAN_LIMITS.BUSINESS.dedicatedDb).toBe(false);
  });

  it('has correct pricing tiers', () => {
    expect(PLAN_LIMITS.FREE.priceMonthly).toBe(0);
    expect(PLAN_LIMITS.STARTER.priceMonthly).toBe(900); // $9
    expect(PLAN_LIMITS.PRO.priceMonthly).toBe(2900); // $29
    expect(PLAN_LIMITS.BUSINESS.priceMonthly).toBe(7900); // $79
    expect(PLAN_LIMITS.ENTERPRISE.priceMonthly).toBeNull(); // custom
  });
});

// ===========================================
// getExecutionMode Tests
// ===========================================

describe('getExecutionMode', () => {
  it('returns SERVERLESS for FREE without addon', () => {
    expect(getExecutionMode('FREE', false)).toBe('SERVERLESS');
    expect(getExecutionMode('FREE')).toBe('SERVERLESS');
  });

  it('returns WORKSPACE for FREE with addon', () => {
    expect(getExecutionMode('FREE', true)).toBe('WORKSPACE');
  });

  it('returns SERVERLESS for STARTER without addon', () => {
    expect(getExecutionMode('STARTER', false)).toBe('SERVERLESS');
    expect(getExecutionMode('STARTER')).toBe('SERVERLESS');
  });

  it('returns WORKSPACE for STARTER with addon', () => {
    expect(getExecutionMode('STARTER', true)).toBe('WORKSPACE');
  });

  it('returns WORKSPACE for PRO', () => {
    expect(getExecutionMode('PRO')).toBe('WORKSPACE');
    expect(getExecutionMode('PRO', false)).toBe('WORKSPACE');
    expect(getExecutionMode('PRO', true)).toBe('WORKSPACE');
  });

  it('returns WORKSPACE for BUSINESS', () => {
    expect(getExecutionMode('BUSINESS')).toBe('WORKSPACE');
  });

  it('returns WORKSPACE for ENTERPRISE', () => {
    expect(getExecutionMode('ENTERPRISE')).toBe('WORKSPACE');
  });
});

// ===========================================
// hasWorkspaceByDefault Tests
// ===========================================

describe('hasWorkspaceByDefault', () => {
  it('returns false for FREE', () => {
    expect(hasWorkspaceByDefault('FREE')).toBe(false);
  });

  it('returns false for STARTER', () => {
    expect(hasWorkspaceByDefault('STARTER')).toBe(false);
  });

  it('returns true for PRO', () => {
    expect(hasWorkspaceByDefault('PRO')).toBe(true);
  });

  it('returns true for BUSINESS', () => {
    expect(hasWorkspaceByDefault('BUSINESS')).toBe(true);
  });

  it('returns true for ENTERPRISE', () => {
    expect(hasWorkspaceByDefault('ENTERPRISE')).toBe(true);
  });
});

// ===========================================
// PLAN_ORDER Tests
// ===========================================

describe('PLAN_ORDER', () => {
  it('orders plans correctly', () => {
    expect(PLAN_ORDER.FREE).toBe(0);
    expect(PLAN_ORDER.STARTER).toBe(1);
    expect(PLAN_ORDER.PRO).toBe(2);
    expect(PLAN_ORDER.BUSINESS).toBe(3);
    expect(PLAN_ORDER.ENTERPRISE).toBe(4);
  });

  it('reflects increasing value', () => {
    expect(PLAN_ORDER.FREE).toBeLessThan(PLAN_ORDER.STARTER);
    expect(PLAN_ORDER.STARTER).toBeLessThan(PLAN_ORDER.PRO);
    expect(PLAN_ORDER.PRO).toBeLessThan(PLAN_ORDER.BUSINESS);
    expect(PLAN_ORDER.BUSINESS).toBeLessThan(PLAN_ORDER.ENTERPRISE);
  });
});

// ===========================================
// Plan Comparison Functions Tests
// ===========================================

describe('isHigherPlan', () => {
  it('returns true when first plan is higher', () => {
    expect(isHigherPlan('STARTER', 'FREE')).toBe(true);
    expect(isHigherPlan('PRO', 'FREE')).toBe(true);
    expect(isHigherPlan('ENTERPRISE', 'BUSINESS')).toBe(true);
  });

  it('returns false when first plan is lower or equal', () => {
    expect(isHigherPlan('FREE', 'STARTER')).toBe(false);
    expect(isHigherPlan('FREE', 'FREE')).toBe(false);
    expect(isHigherPlan('PRO', 'ENTERPRISE')).toBe(false);
  });
});

describe('isAtLeastPlan', () => {
  it('returns true when user has required plan or higher', () => {
    expect(isAtLeastPlan('FREE', 'FREE')).toBe(true);
    expect(isAtLeastPlan('STARTER', 'FREE')).toBe(true);
    expect(isAtLeastPlan('PRO', 'STARTER')).toBe(true);
    expect(isAtLeastPlan('ENTERPRISE', 'BUSINESS')).toBe(true);
  });

  it('returns false when user has lower plan', () => {
    expect(isAtLeastPlan('FREE', 'STARTER')).toBe(false);
    expect(isAtLeastPlan('STARTER', 'PRO')).toBe(false);
    expect(isAtLeastPlan('BUSINESS', 'ENTERPRISE')).toBe(false);
  });
});

describe('comparePlans', () => {
  it('returns negative when first plan is lower', () => {
    expect(comparePlans('FREE', 'STARTER')).toBeLessThan(0);
    expect(comparePlans('STARTER', 'PRO')).toBeLessThan(0);
  });

  it('returns 0 when plans are equal', () => {
    expect(comparePlans('FREE', 'FREE')).toBe(0);
    expect(comparePlans('PRO', 'PRO')).toBe(0);
  });

  it('returns positive when first plan is higher', () => {
    expect(comparePlans('STARTER', 'FREE')).toBeGreaterThan(0);
    expect(comparePlans('ENTERPRISE', 'BUSINESS')).toBeGreaterThan(0);
  });
});

// ===========================================
// Upgrade/Downgrade Functions Tests
// ===========================================

describe('canUpgradeTo', () => {
  it('allows upgrading to higher plans', () => {
    expect(canUpgradeTo('FREE', 'STARTER')).toBe(true);
    expect(canUpgradeTo('FREE', 'PRO')).toBe(true);
    expect(canUpgradeTo('STARTER', 'BUSINESS')).toBe(true);
    expect(canUpgradeTo('BUSINESS', 'ENTERPRISE')).toBe(true);
  });

  it('prevents upgrading to same or lower plan', () => {
    expect(canUpgradeTo('FREE', 'FREE')).toBe(false);
    expect(canUpgradeTo('STARTER', 'FREE')).toBe(false);
    expect(canUpgradeTo('ENTERPRISE', 'BUSINESS')).toBe(false);
  });
});

describe('canDowngradeTo', () => {
  it('allows downgrading to lower plans', () => {
    expect(canDowngradeTo('STARTER', 'FREE')).toBe(true);
    expect(canDowngradeTo('PRO', 'STARTER')).toBe(true);
    expect(canDowngradeTo('ENTERPRISE', 'BUSINESS')).toBe(true);
  });

  it('prevents downgrading to same or higher plan', () => {
    expect(canDowngradeTo('FREE', 'FREE')).toBe(false);
    expect(canDowngradeTo('FREE', 'STARTER')).toBe(false);
    expect(canDowngradeTo('BUSINESS', 'ENTERPRISE')).toBe(false);
  });
});

describe('getUpgradeOptions', () => {
  it('returns all higher plans except ENTERPRISE', () => {
    const freeOptions = getUpgradeOptions('FREE');
    expect(freeOptions).toEqual(['STARTER', 'PRO', 'BUSINESS']);
  });

  it('returns remaining upgrade options for STARTER', () => {
    const starterOptions = getUpgradeOptions('STARTER');
    expect(starterOptions).toEqual(['PRO', 'BUSINESS']);
  });

  it('returns empty array for BUSINESS (ENTERPRISE is custom)', () => {
    const businessOptions = getUpgradeOptions('BUSINESS');
    expect(businessOptions).toEqual([]);
  });

  it('returns empty array for ENTERPRISE', () => {
    const enterpriseOptions = getUpgradeOptions('ENTERPRISE');
    expect(enterpriseOptions).toEqual([]);
  });
});

describe('isPaidPlan', () => {
  it('returns false for FREE', () => {
    expect(isPaidPlan('FREE')).toBe(false);
  });

  it('returns true for all other plans', () => {
    expect(isPaidPlan('STARTER')).toBe(true);
    expect(isPaidPlan('PRO')).toBe(true);
    expect(isPaidPlan('BUSINESS')).toBe(true);
    expect(isPaidPlan('ENTERPRISE')).toBe(true);
  });

  it('matches PAID_PLAN_TYPES array', () => {
    for (const plan of ALL_PLAN_TYPES) {
      if (plan === 'FREE') {
        expect(isPaidPlan(plan)).toBe(false);
        expect(PAID_PLAN_TYPES).not.toContain(plan);
      } else {
        expect(isPaidPlan(plan)).toBe(true);
        expect(PAID_PLAN_TYPES).toContain(plan);
      }
    }
  });
});

// ===========================================
// Limit Checking Functions Tests
// ===========================================

describe('getPlanLimits', () => {
  it('returns correct limits for each plan', () => {
    for (const plan of ALL_PLAN_TYPES) {
      const limits = getPlanLimits(plan);
      expect(limits).toBe(PLAN_LIMITS[plan]);
    }
  });
});

describe('canDoAction', () => {
  it('allows action when under limit', () => {
    expect(canDoAction('FREE', 'gateways', 0)).toBe(true);
    expect(canDoAction('STARTER', 'workflows', 5)).toBe(true);
  });

  it('prevents action when at or over limit', () => {
    expect(canDoAction('FREE', 'gateways', 1)).toBe(false);
    expect(canDoAction('FREE', 'gateways', 5)).toBe(false);
  });

  it('always allows action for unlimited resources', () => {
    expect(canDoAction('ENTERPRISE', 'gateways', 0)).toBe(true);
    expect(canDoAction('ENTERPRISE', 'gateways', 1000)).toBe(true);
    expect(canDoAction('ENTERPRISE', 'gateways', 999999)).toBe(true);
  });
});

describe('getRemainingQuota', () => {
  it('returns remaining count for limited resources', () => {
    expect(getRemainingQuota('FREE', 'gateways', 0)).toBe(1);
    expect(getRemainingQuota('STARTER', 'gateways', 1)).toBe(2);
    expect(getRemainingQuota('PRO', 'workflows', 25)).toBe(25);
  });

  it('returns 0 when at or over limit', () => {
    expect(getRemainingQuota('FREE', 'gateways', 1)).toBe(0);
    expect(getRemainingQuota('FREE', 'gateways', 10)).toBe(0);
  });

  it('returns -1 for unlimited resources', () => {
    expect(getRemainingQuota('ENTERPRISE', 'gateways', 0)).toBe(-1);
    expect(getRemainingQuota('ENTERPRISE', 'gateways', 1000)).toBe(-1);
  });
});

describe('isUnlimited', () => {
  it('returns false for FREE plan resources', () => {
    expect(isUnlimited('FREE', 'gateways')).toBe(false);
    expect(isUnlimited('FREE', 'workflows')).toBe(false);
    expect(isUnlimited('FREE', 'workflowRunsPerMonth')).toBe(false);
  });

  it('returns true for ENTERPRISE unlimited resources', () => {
    expect(isUnlimited('ENTERPRISE', 'gateways')).toBe(true);
    expect(isUnlimited('ENTERPRISE', 'workflows')).toBe(true);
    expect(isUnlimited('ENTERPRISE', 'plugins')).toBe(true);
    expect(isUnlimited('ENTERPRISE', 'creditsPerMonth')).toBe(true);
  });

  it('returns true for workspace plan workflow runs', () => {
    expect(isUnlimited('PRO', 'workflowRunsPerMonth')).toBe(true);
    expect(isUnlimited('BUSINESS', 'workflowRunsPerMonth')).toBe(true);
    expect(isUnlimited('ENTERPRISE', 'workflowRunsPerMonth')).toBe(true);
  });
});

// ===========================================
// Database Isolation Tests
// ===========================================

describe('getPlanIsolationLevel', () => {
  it('returns SHARED for lower tier plans', () => {
    expect(getPlanIsolationLevel('FREE')).toBe('SHARED');
    expect(getPlanIsolationLevel('STARTER')).toBe('SHARED');
    expect(getPlanIsolationLevel('PRO')).toBe('SHARED');
    expect(getPlanIsolationLevel('BUSINESS')).toBe('SHARED');
  });

  it('returns DEDICATED for ENTERPRISE', () => {
    expect(getPlanIsolationLevel('ENTERPRISE')).toBe('DEDICATED');
  });
});

describe('hasDedicatedDb', () => {
  it('returns false for non-enterprise plans', () => {
    expect(hasDedicatedDb('FREE')).toBe(false);
    expect(hasDedicatedDb('STARTER')).toBe(false);
    expect(hasDedicatedDb('PRO')).toBe(false);
    expect(hasDedicatedDb('BUSINESS')).toBe(false);
  });

  it('returns true for ENTERPRISE', () => {
    expect(hasDedicatedDb('ENTERPRISE')).toBe(true);
  });
});

describe('canUpgradeToIsolated', () => {
  it('returns true for BUSINESS plan', () => {
    expect(canUpgradeToIsolated('BUSINESS')).toBe(true);
  });

  it('returns false for plans that cannot upgrade', () => {
    expect(canUpgradeToIsolated('FREE')).toBe(false);
    expect(canUpgradeToIsolated('STARTER')).toBe(false);
  });
});

describe('canChooseRegion', () => {
  it('returns true only for ENTERPRISE', () => {
    expect(canChooseRegion('ENTERPRISE')).toBe(true);
  });

  it('returns false for other plans', () => {
    expect(canChooseRegion('FREE')).toBe(false);
    expect(canChooseRegion('STARTER')).toBe(false);
    expect(canChooseRegion('PRO')).toBe(false);
    expect(canChooseRegion('BUSINESS')).toBe(false);
  });
});

// ===========================================
// Stripe Price Tests
// ===========================================

describe('hasStripePrice', () => {
  it('returns false for FREE plan (never has Stripe price)', () => {
    expect(hasStripePrice('FREE')).toBe(false);
  });

  it('returns boolean for paid plans (depends on env vars)', () => {
    // These return false without env vars set
    expect(typeof hasStripePrice('STARTER')).toBe('boolean');
    expect(typeof hasStripePrice('PRO')).toBe('boolean');
    expect(typeof hasStripePrice('BUSINESS')).toBe('boolean');
    expect(typeof hasStripePrice('ENTERPRISE')).toBe('boolean');
  });

  it('is consistent with getPriceId', () => {
    // hasStripePrice should return true iff getPriceId returns non-null
    for (const plan of ALL_PLAN_TYPES) {
      const hasPriceResult = hasStripePrice(plan);
      const priceId = getPriceId(plan);
      expect(hasPriceResult).toBe(priceId !== null);
    }
  });
});

describe('getPriceId', () => {
  it('returns null for FREE plan', () => {
    expect(getPriceId('FREE')).toBeNull();
  });

  it('returns string or null for paid plans', () => {
    // Without env vars, returns null
    for (const plan of PAID_PLAN_TYPES) {
      const priceId = getPriceId(plan);
      expect(priceId === null || typeof priceId === 'string').toBe(true);
    }
  });
});
