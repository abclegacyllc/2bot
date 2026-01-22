/**
 * Organization Plan Constants Tests
 * 
 * Tests for org plan type definitions, limits, and helper functions
 * All org plans use WORKSPACE execution mode with unlimited executions.
 * 
 * @module shared/constants/__tests__/org-plans.test
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  type OrgPlanType,
  type OrgPlanLimits,
  
  // Plan Arrays
  ALL_ORG_PLAN_TYPES,
  PAID_ORG_PLAN_TYPES,
  
  // Plan Order
  ORG_PLAN_ORDER,
  
  // Functions
  isHigherOrgPlan,
  isAtLeastOrgPlan,
  getOrgPlanLimits,
  orgPlanHasFeature,
  isOrgLimitExceeded,
  getOrgRemainingCapacity,
  calculateExtraSeatsPrice,
  formatOrgPoolResources,
  
  // Limits
  ORG_PLAN_LIMITS,
} from '../org-plans';

// ===========================================
// ORG_PLAN_LIMITS Tests
// ===========================================

describe('ORG_PLAN_LIMITS', () => {
  it('has all 5 org plan types', () => {
    expect(ALL_ORG_PLAN_TYPES).toHaveLength(5);
    expect(ALL_ORG_PLAN_TYPES).toContain('ORG_STARTER');
    expect(ALL_ORG_PLAN_TYPES).toContain('ORG_GROWTH');
    expect(ALL_ORG_PLAN_TYPES).toContain('ORG_PRO');
    expect(ALL_ORG_PLAN_TYPES).toContain('ORG_BUSINESS');
    expect(ALL_ORG_PLAN_TYPES).toContain('ORG_ENTERPRISE');
  });

  it('all org plans use WORKSPACE execution mode', () => {
    for (const plan of ALL_ORG_PLAN_TYPES) {
      expect(ORG_PLAN_LIMITS[plan].executionMode).toBe('WORKSPACE');
    }
  });

  it('all org plans have unlimited executions', () => {
    for (const plan of ALL_ORG_PLAN_TYPES) {
      expect(ORG_PLAN_LIMITS[plan].executionsPerMonth).toBeNull();
    }
  });

  it('has increasing shared gateway limits per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.sharedGateways).toBe(5);
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.sharedGateways).toBe(15);
    expect(ORG_PLAN_LIMITS.ORG_PRO.sharedGateways).toBe(50);
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.sharedGateways).toBe(150);
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.sharedGateways).toBe(-1); // unlimited
  });

  it('has increasing shared workflow limits per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.sharedWorkflows).toBe(25);
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.sharedWorkflows).toBe(75);
    expect(ORG_PLAN_LIMITS.ORG_PRO.sharedWorkflows).toBe(250);
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.sharedWorkflows).toBe(1000);
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.sharedWorkflows).toBe(-1); // unlimited
  });

  it('has increasing AI token budgets per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.sharedAiTokensPerMonth).toBe(500000);
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.sharedAiTokensPerMonth).toBe(2000000);
    expect(ORG_PLAN_LIMITS.ORG_PRO.sharedAiTokensPerMonth).toBe(10000000);
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.sharedAiTokensPerMonth).toBe(50000000);
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.sharedAiTokensPerMonth).toBe(-1); // unlimited
  });

  it('has increasing seat allocations per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.seats.included).toBe(5);
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.seats.included).toBe(15);
    expect(ORG_PLAN_LIMITS.ORG_PRO.seats.included).toBe(40);
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.seats.included).toBe(100);
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.seats.included).toBe(-1); // unlimited
  });

  it('has decreasing extra seat prices per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.seats.extraPricePerSeat).toBe(1000); // $10
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.seats.extraPricePerSeat).toBe(700);   // $7
    expect(ORG_PLAN_LIMITS.ORG_PRO.seats.extraPricePerSeat).toBe(500);      // $5
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.seats.extraPricePerSeat).toBe(300); // $3
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.seats.extraPricePerSeat).toBe(0); // included
  });

  it('has correct department limits per tier', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.departments).toBe(3);
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.departments).toBe(10);
    expect(ORG_PLAN_LIMITS.ORG_PRO.departments).toBe(25);
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.departments).toBeNull(); // unlimited
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.departments).toBeNull(); // unlimited
  });

  it('has correct workspace pool resources', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.pool).toEqual({
      ramMb: 4096,
      cpuCores: 2,
      storageMb: 20480,
    });
    
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.pool).toEqual({
      ramMb: 32768,
      cpuCores: 16,
      storageMb: 256000,
    });
    
    // Enterprise has custom resources
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.pool.ramMb).toBeNull();
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.pool.cpuCores).toBeNull();
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.pool.storageMb).toBeNull();
  });

  it('has correct pricing tiers', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.priceMonthly).toBe(4900);  // $49
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.priceMonthly).toBe(9900);   // $99
    expect(ORG_PLAN_LIMITS.ORG_PRO.priceMonthly).toBe(19900);     // $199
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.priceMonthly).toBe(39900); // $399
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.priceMonthly).toBeNull(); // custom
  });
});

// ===========================================
// Feature Tests
// ===========================================

describe('orgPlanHasFeature', () => {
  describe('SSO feature', () => {
    it('SSO not available on starter/growth', () => {
      expect(orgPlanHasFeature('ORG_STARTER', 'sso')).toBe(false);
      expect(orgPlanHasFeature('ORG_GROWTH', 'sso')).toBe(false);
    });

    it('SSO available on pro and above', () => {
      expect(orgPlanHasFeature('ORG_PRO', 'sso')).toBe(true);
      expect(orgPlanHasFeature('ORG_BUSINESS', 'sso')).toBe(true);
      expect(orgPlanHasFeature('ORG_ENTERPRISE', 'sso')).toBe(true);
    });
  });

  describe('custom branding feature', () => {
    it('custom branding not on starter', () => {
      expect(orgPlanHasFeature('ORG_STARTER', 'customBranding')).toBe(false);
    });

    it('custom branding available on growth and above', () => {
      expect(orgPlanHasFeature('ORG_GROWTH', 'customBranding')).toBe(true);
      expect(orgPlanHasFeature('ORG_PRO', 'customBranding')).toBe(true);
      expect(orgPlanHasFeature('ORG_BUSINESS', 'customBranding')).toBe(true);
      expect(orgPlanHasFeature('ORG_ENTERPRISE', 'customBranding')).toBe(true);
    });
  });

  describe('priority support feature', () => {
    it('priority support not on starter/growth', () => {
      expect(orgPlanHasFeature('ORG_STARTER', 'prioritySupport')).toBe(false);
      expect(orgPlanHasFeature('ORG_GROWTH', 'prioritySupport')).toBe(false);
    });

    it('priority support available on pro and above', () => {
      expect(orgPlanHasFeature('ORG_PRO', 'prioritySupport')).toBe(true);
      expect(orgPlanHasFeature('ORG_BUSINESS', 'prioritySupport')).toBe(true);
      expect(orgPlanHasFeature('ORG_ENTERPRISE', 'prioritySupport')).toBe(true);
    });
  });

  describe('dedicated database feature', () => {
    it('dedicated db not on lower tiers', () => {
      expect(orgPlanHasFeature('ORG_STARTER', 'dedicatedDatabase')).toBe(false);
      expect(orgPlanHasFeature('ORG_GROWTH', 'dedicatedDatabase')).toBe(false);
      expect(orgPlanHasFeature('ORG_PRO', 'dedicatedDatabase')).toBe(false);
    });

    it('dedicated db available on business and enterprise', () => {
      expect(orgPlanHasFeature('ORG_BUSINESS', 'dedicatedDatabase')).toBe(true);
      expect(orgPlanHasFeature('ORG_ENTERPRISE', 'dedicatedDatabase')).toBe(true);
    });
  });

  describe('audit logs feature', () => {
    it('audit logs available on all plans', () => {
      for (const plan of ALL_ORG_PLAN_TYPES) {
        expect(orgPlanHasFeature(plan, 'auditLogs')).toBe(true);
      }
    });
  });

  describe('API access feature', () => {
    it('API access available on all plans', () => {
      for (const plan of ALL_ORG_PLAN_TYPES) {
        expect(orgPlanHasFeature(plan, 'apiAccess')).toBe(true);
      }
    });
  });
});

// ===========================================
// ORG_PLAN_ORDER Tests
// ===========================================

describe('ORG_PLAN_ORDER', () => {
  it('orders plans correctly', () => {
    expect(ORG_PLAN_ORDER.ORG_STARTER).toBe(0);
    expect(ORG_PLAN_ORDER.ORG_GROWTH).toBe(1);
    expect(ORG_PLAN_ORDER.ORG_PRO).toBe(2);
    expect(ORG_PLAN_ORDER.ORG_BUSINESS).toBe(3);
    expect(ORG_PLAN_ORDER.ORG_ENTERPRISE).toBe(4);
  });

  it('reflects increasing value', () => {
    expect(ORG_PLAN_ORDER.ORG_STARTER).toBeLessThan(ORG_PLAN_ORDER.ORG_GROWTH);
    expect(ORG_PLAN_ORDER.ORG_GROWTH).toBeLessThan(ORG_PLAN_ORDER.ORG_PRO);
    expect(ORG_PLAN_ORDER.ORG_PRO).toBeLessThan(ORG_PLAN_ORDER.ORG_BUSINESS);
    expect(ORG_PLAN_ORDER.ORG_BUSINESS).toBeLessThan(ORG_PLAN_ORDER.ORG_ENTERPRISE);
  });
});

// ===========================================
// Plan Comparison Functions Tests
// ===========================================

describe('isHigherOrgPlan', () => {
  it('returns true when first plan is higher', () => {
    expect(isHigherOrgPlan('ORG_GROWTH', 'ORG_STARTER')).toBe(true);
    expect(isHigherOrgPlan('ORG_PRO', 'ORG_STARTER')).toBe(true);
    expect(isHigherOrgPlan('ORG_ENTERPRISE', 'ORG_BUSINESS')).toBe(true);
  });

  it('returns false when first plan is lower or equal', () => {
    expect(isHigherOrgPlan('ORG_STARTER', 'ORG_GROWTH')).toBe(false);
    expect(isHigherOrgPlan('ORG_STARTER', 'ORG_STARTER')).toBe(false);
    expect(isHigherOrgPlan('ORG_PRO', 'ORG_ENTERPRISE')).toBe(false);
  });
});

describe('isAtLeastOrgPlan', () => {
  it('returns true when user has required plan or higher', () => {
    expect(isAtLeastOrgPlan('ORG_STARTER', 'ORG_STARTER')).toBe(true);
    expect(isAtLeastOrgPlan('ORG_GROWTH', 'ORG_STARTER')).toBe(true);
    expect(isAtLeastOrgPlan('ORG_PRO', 'ORG_GROWTH')).toBe(true);
    expect(isAtLeastOrgPlan('ORG_ENTERPRISE', 'ORG_BUSINESS')).toBe(true);
  });

  it('returns false when user has lower plan', () => {
    expect(isAtLeastOrgPlan('ORG_STARTER', 'ORG_GROWTH')).toBe(false);
    expect(isAtLeastOrgPlan('ORG_GROWTH', 'ORG_PRO')).toBe(false);
    expect(isAtLeastOrgPlan('ORG_BUSINESS', 'ORG_ENTERPRISE')).toBe(false);
  });
});

// ===========================================
// getOrgPlanLimits Tests
// ===========================================

describe('getOrgPlanLimits', () => {
  it('returns correct limits for each plan', () => {
    for (const plan of ALL_ORG_PLAN_TYPES) {
      const limits = getOrgPlanLimits(plan);
      expect(limits).toBe(ORG_PLAN_LIMITS[plan]);
    }
  });
});

// ===========================================
// Limit Checking Functions Tests
// ===========================================

describe('isOrgLimitExceeded', () => {
  it('returns false when under limit', () => {
    expect(isOrgLimitExceeded(0, 10)).toBe(false);
    expect(isOrgLimitExceeded(5, 10)).toBe(false);
    expect(isOrgLimitExceeded(9, 10)).toBe(false);
  });

  it('returns true when at or over limit', () => {
    expect(isOrgLimitExceeded(10, 10)).toBe(true);
    expect(isOrgLimitExceeded(15, 10)).toBe(true);
  });

  it('returns false for unlimited resources', () => {
    expect(isOrgLimitExceeded(0, -1)).toBe(false);
    expect(isOrgLimitExceeded(1000, -1)).toBe(false);
    expect(isOrgLimitExceeded(999999, -1)).toBe(false);
  });
});

describe('getOrgRemainingCapacity', () => {
  it('returns remaining count for limited resources', () => {
    expect(getOrgRemainingCapacity(0, 10)).toBe(10);
    expect(getOrgRemainingCapacity(5, 10)).toBe(5);
    expect(getOrgRemainingCapacity(9, 10)).toBe(1);
  });

  it('returns 0 when at or over limit', () => {
    expect(getOrgRemainingCapacity(10, 10)).toBe(0);
    expect(getOrgRemainingCapacity(15, 10)).toBe(0);
  });

  it('returns -1 for unlimited resources', () => {
    expect(getOrgRemainingCapacity(0, -1)).toBe(-1);
    expect(getOrgRemainingCapacity(1000, -1)).toBe(-1);
  });
});

// ===========================================
// Pricing Calculation Tests
// ===========================================

describe('calculateExtraSeatsPrice', () => {
  it('calculates monthly extra seat price correctly', () => {
    // ORG_STARTER: $10/seat
    expect(calculateExtraSeatsPrice('ORG_STARTER', 1)).toBe(1000);
    expect(calculateExtraSeatsPrice('ORG_STARTER', 5)).toBe(5000);
    
    // ORG_PRO: $5/seat
    expect(calculateExtraSeatsPrice('ORG_PRO', 1)).toBe(500);
    expect(calculateExtraSeatsPrice('ORG_PRO', 10)).toBe(5000);
  });

  it('calculates yearly extra seat price with 2 months free', () => {
    // Yearly = monthly * 10 (2 months free)
    expect(calculateExtraSeatsPrice('ORG_STARTER', 1, true)).toBe(10000);
    expect(calculateExtraSeatsPrice('ORG_STARTER', 5, true)).toBe(50000);
    expect(calculateExtraSeatsPrice('ORG_PRO', 10, true)).toBe(50000);
  });

  it('returns 0 for enterprise (seats included)', () => {
    expect(calculateExtraSeatsPrice('ORG_ENTERPRISE', 100)).toBe(0);
    expect(calculateExtraSeatsPrice('ORG_ENTERPRISE', 100, true)).toBe(0);
  });
});

// ===========================================
// Formatting Functions Tests
// ===========================================

describe('formatOrgPoolResources', () => {
  it('formats pool resources in readable format', () => {
    const starterPool = ORG_PLAN_LIMITS.ORG_STARTER.pool;
    const formatted = formatOrgPoolResources(starterPool);
    expect(formatted).toBe('4GB RAM, 2 CPUs, 20GB Storage');
  });

  it('formats single CPU correctly', () => {
    const result = formatOrgPoolResources({
      ramMb: 1024,
      cpuCores: 1,
      storageMb: 1024,
    });
    expect(result).toBe('1GB RAM, 1 CPU, 1GB Storage');
  });

  it('formats MB values correctly', () => {
    const result = formatOrgPoolResources({
      ramMb: 512,
      cpuCores: 0.5,
      storageMb: 500,
    });
    expect(result).toBe('512MB RAM, 0.5 CPU, 500MB Storage');
  });

  it('returns custom message for null values', () => {
    const enterprisePool = ORG_PLAN_LIMITS.ORG_ENTERPRISE.pool;
    expect(formatOrgPoolResources(enterprisePool)).toBe('Custom resources');
  });
});

// ===========================================
// PAID_ORG_PLAN_TYPES Tests
// ===========================================

describe('PAID_ORG_PLAN_TYPES', () => {
  it('includes all plans except enterprise', () => {
    expect(PAID_ORG_PLAN_TYPES).toHaveLength(4);
    expect(PAID_ORG_PLAN_TYPES).toContain('ORG_STARTER');
    expect(PAID_ORG_PLAN_TYPES).toContain('ORG_GROWTH');
    expect(PAID_ORG_PLAN_TYPES).toContain('ORG_PRO');
    expect(PAID_ORG_PLAN_TYPES).toContain('ORG_BUSINESS');
    expect(PAID_ORG_PLAN_TYPES).not.toContain('ORG_ENTERPRISE');
  });

  it('all paid plans have defined pricing', () => {
    for (const plan of PAID_ORG_PLAN_TYPES) {
      expect(ORG_PLAN_LIMITS[plan].priceMonthly).not.toBeNull();
      expect(ORG_PLAN_LIMITS[plan].priceYearly).not.toBeNull();
    }
  });
});

// ===========================================
// Display Information Tests
// ===========================================

describe('display information', () => {
  it('all plans have display name and description', () => {
    for (const plan of ALL_ORG_PLAN_TYPES) {
      const limits = ORG_PLAN_LIMITS[plan];
      expect(limits.displayName).toBeTruthy();
      expect(limits.description).toBeTruthy();
      expect(typeof limits.displayName).toBe('string');
      expect(typeof limits.description).toBe('string');
    }
  });

  it('has expected display names', () => {
    expect(ORG_PLAN_LIMITS.ORG_STARTER.displayName).toBe('Starter');
    expect(ORG_PLAN_LIMITS.ORG_GROWTH.displayName).toBe('Growth');
    expect(ORG_PLAN_LIMITS.ORG_PRO.displayName).toBe('Professional');
    expect(ORG_PLAN_LIMITS.ORG_BUSINESS.displayName).toBe('Business');
    expect(ORG_PLAN_LIMITS.ORG_ENTERPRISE.displayName).toBe('Enterprise');
  });
});
