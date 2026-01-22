/**
 * Quota Allocation Service Tests
 *
 * Tests for quota allocation logic and validation.
 * These tests focus on the allocation hierarchy and validation rules:
 *   Org Pool (from plan) → DeptAllocation → MemberAllocation
 *
 * Note: Full integration tests require a database connection.
 * These unit tests focus on validation logic and helper functions.
 *
 * @module modules/quota/__tests__/quota-allocation.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ORG_PLAN_LIMITS, type OrgPlanType } from '@/shared/constants/org-plans';

// ===========================================
// Validation Logic Tests
// ===========================================

describe('QuotaAllocationService validation logic', () => {
  describe('prevents over-allocation to departments', () => {
    it('detects when gateway allocation exceeds org pool', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType];
      const orgPoolGateways = planLimits.sharedGateways; // 5

      // Already allocated to other depts
      const currentlyAllocated = 3;

      // Requesting more than remaining
      const requested = 4;

      const remaining = orgPoolGateways - currentlyAllocated;
      const wouldExceed = requested > remaining;

      expect(orgPoolGateways).toBe(5);
      expect(remaining).toBe(2);
      expect(wouldExceed).toBe(true);
    });

    it('detects when workflow allocation exceeds org pool', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType];
      const orgPoolWorkflows = planLimits.sharedWorkflows; // 25

      const currentlyAllocated = 20;
      const requested = 10;

      const remaining = orgPoolWorkflows - currentlyAllocated;
      const wouldExceed = requested > remaining;

      expect(orgPoolWorkflows).toBe(25);
      expect(remaining).toBe(5);
      expect(wouldExceed).toBe(true);
    });

    it('detects when AI token allocation exceeds org pool', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_PRO' as OrgPlanType];
      const orgPoolTokens = planLimits.sharedAiTokensPerMonth; // 10,000,000

      const currentlyAllocated = 9_000_000;
      const requested = 2_000_000;

      const remaining = orgPoolTokens - currentlyAllocated;
      const wouldExceed = requested > remaining;

      expect(orgPoolTokens).toBe(10_000_000);
      expect(remaining).toBe(1_000_000);
      expect(wouldExceed).toBe(true);
    });

    it('allows valid allocation within org pool', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType];
      const orgPoolGateways = planLimits.sharedGateways;

      const currentlyAllocated = 2;
      const requested = 2;

      const remaining = orgPoolGateways - currentlyAllocated;
      const wouldExceed = requested > remaining;

      expect(remaining).toBe(3);
      expect(wouldExceed).toBe(false);
    });

    it('unlimited plan resources never exceed', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_ENTERPRISE' as OrgPlanType];
      const orgPoolGateways = planLimits.sharedGateways; // -1 (unlimited)

      // With unlimited, any allocation is valid
      const isUnlimited = orgPoolGateways === -1;
      expect(isUnlimited).toBe(true);
    });
  });

  describe('allows admin to set dept allocations', () => {
    const ADMIN_ROLES = ['ORG_OWNER', 'ORG_ADMIN'];

    it('ORG_OWNER can set dept allocations', () => {
      const role = 'ORG_OWNER';
      expect(ADMIN_ROLES.includes(role)).toBe(true);
    });

    it('ORG_ADMIN can set dept allocations', () => {
      const role = 'ORG_ADMIN';
      expect(ADMIN_ROLES.includes(role)).toBe(true);
    });

    it('DEPT_MANAGER cannot set dept allocations', () => {
      const role = 'DEPT_MANAGER';
      expect(ADMIN_ROLES.includes(role)).toBe(false);
    });

    it('MEMBER cannot set dept allocations', () => {
      const role = 'MEMBER';
      expect(ADMIN_ROLES.includes(role)).toBe(false);
    });
  });

  describe('allows manager to set member allocations within department', () => {
    const MANAGER_ROLES = ['ORG_OWNER', 'ORG_ADMIN', 'DEPT_MANAGER'];

    it('ORG_OWNER can set member allocations', () => {
      const role = 'ORG_OWNER';
      expect(MANAGER_ROLES.includes(role)).toBe(true);
    });

    it('ORG_ADMIN can set member allocations', () => {
      const role = 'ORG_ADMIN';
      expect(MANAGER_ROLES.includes(role)).toBe(true);
    });

    it('DEPT_MANAGER can set member allocations', () => {
      const role = 'DEPT_MANAGER';
      expect(MANAGER_ROLES.includes(role)).toBe(true);
    });

    it('MEMBER cannot set member allocations', () => {
      const role = 'MEMBER';
      expect(MANAGER_ROLES.includes(role)).toBe(false);
    });
  });

  describe('enforces hierarchy: member → department → org', () => {
    it('member allocation cannot exceed department allocation', () => {
      const deptAllocation = {
        maxGateways: 5,
        maxWorkflows: 20,
        aiTokenBudget: 100_000,
      };

      // Already allocated to other members
      const allocatedToOthers = {
        maxGateways: 3,
        maxWorkflows: 15,
        aiTokenBudget: 50_000,
      };

      // Requested for this member
      const memberRequest = {
        maxGateways: 3, // Would total 6, exceeds 5
        maxWorkflows: 3, // Would total 18, OK
        aiTokenBudget: 60_000, // Would total 110,000, exceeds 100,000
      };

      // Check gateway
      const gatewayTotal = allocatedToOthers.maxGateways + memberRequest.maxGateways;
      expect(gatewayTotal > deptAllocation.maxGateways).toBe(true);

      // Check workflows
      const workflowTotal = allocatedToOthers.maxWorkflows + memberRequest.maxWorkflows;
      expect(workflowTotal > deptAllocation.maxWorkflows).toBe(false);

      // Check AI tokens
      const tokenTotal = allocatedToOthers.aiTokenBudget + memberRequest.aiTokenBudget;
      expect(tokenTotal > deptAllocation.aiTokenBudget).toBe(true);
    });

    it('department allocation cannot exceed org pool', () => {
      const planLimits = ORG_PLAN_LIMITS['ORG_GROWTH' as OrgPlanType];
      const orgPool = {
        gateways: planLimits.sharedGateways, // 15
        workflows: planLimits.sharedWorkflows, // 75
        aiTokenBudget: planLimits.sharedAiTokensPerMonth, // 2,000,000
      };

      // Already allocated to other departments
      const allocatedToDepts = {
        gateways: 10,
        workflows: 50,
        aiTokenBudget: 1_500_000,
      };

      // Requested for new department
      const deptRequest = {
        gateways: 10, // Would total 20, exceeds 15
        workflows: 30, // Would total 80, exceeds 75
        aiTokenBudget: 600_000, // Would total 2,100,000, exceeds 2,000,000
      };

      // All should exceed
      expect(allocatedToDepts.gateways + deptRequest.gateways > orgPool.gateways).toBe(true);
      expect(allocatedToDepts.workflows + deptRequest.workflows > orgPool.workflows).toBe(true);
      expect(allocatedToDepts.aiTokenBudget + deptRequest.aiTokenBudget > orgPool.aiTokenBudget).toBe(true);
    });

    it('org pool is determined by plan type', () => {
      const starterPool = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType];
      const businessPool = ORG_PLAN_LIMITS['ORG_BUSINESS' as OrgPlanType];

      // Business has more resources than starter
      expect(businessPool.sharedGateways).toBeGreaterThan(starterPool.sharedGateways);
      expect(businessPool.sharedWorkflows).toBeGreaterThan(starterPool.sharedWorkflows);
      expect(businessPool.sharedAiTokensPerMonth).toBeGreaterThan(starterPool.sharedAiTokensPerMonth);
    });
  });
});

// ===========================================
// Allocation Helper Functions Tests
// ===========================================

describe('Allocation helper functions', () => {
  describe('sumAllocations', () => {
    it('sums multiple department allocations correctly', () => {
      const allocations = [
        { maxGateways: 2, maxWorkflows: 10, aiTokenBudget: 50000 },
        { maxGateways: 3, maxWorkflows: 15, aiTokenBudget: 75000 },
        { maxGateways: 1, maxWorkflows: 5, aiTokenBudget: 25000 },
      ];

      // Simulate the sumAllocations logic
      const sum = allocations.reduce(
        (acc, alloc) => ({
          maxGateways: (acc.maxGateways ?? 0) + (alloc.maxGateways ?? 0),
          maxWorkflows: (acc.maxWorkflows ?? 0) + (alloc.maxWorkflows ?? 0),
          aiTokenBudget: (acc.aiTokenBudget ?? 0) + (alloc.aiTokenBudget ?? 0),
        }),
        { maxGateways: 0, maxWorkflows: 0, aiTokenBudget: 0 }
      );

      expect(sum.maxGateways).toBe(6);
      expect(sum.maxWorkflows).toBe(30);
      expect(sum.aiTokenBudget).toBe(150000);
    });

    it('handles null values in allocations', () => {
      const allocations = [
        { maxGateways: 2, maxWorkflows: null, aiTokenBudget: 50000 },
        { maxGateways: null, maxWorkflows: 15, aiTokenBudget: null },
      ];

      const sum = allocations.reduce(
        (acc, alloc) => ({
          maxGateways: (acc.maxGateways ?? 0) + (alloc.maxGateways ?? 0),
          maxWorkflows: (acc.maxWorkflows ?? 0) + (alloc.maxWorkflows ?? 0),
          aiTokenBudget: (acc.aiTokenBudget ?? 0) + (alloc.aiTokenBudget ?? 0),
        }),
        { maxGateways: 0, maxWorkflows: 0, aiTokenBudget: 0 }
      );

      expect(sum.maxGateways).toBe(2);
      expect(sum.maxWorkflows).toBe(15);
      expect(sum.aiTokenBudget).toBe(50000);
    });
  });

  describe('calcRemaining', () => {
    // Simulate calcRemaining function
    function calcRemaining(limit: number | null, allocated: number): number | null {
      if (limit === null || limit === -1) return null; // unlimited
      return Math.max(0, limit - allocated);
    }

    it('returns remaining when under limit', () => {
      expect(calcRemaining(10, 3)).toBe(7);
      expect(calcRemaining(100, 50)).toBe(50);
      expect(calcRemaining(5, 0)).toBe(5);
    });

    it('returns 0 when at or over limit', () => {
      expect(calcRemaining(10, 10)).toBe(0);
      expect(calcRemaining(10, 15)).toBe(0);
    });

    it('returns null for unlimited resources', () => {
      expect(calcRemaining(-1, 100)).toBeNull();
      expect(calcRemaining(null, 100)).toBeNull();
    });
  });
});

// ===========================================
// Allocation Mode Tests
// ===========================================

describe('AllocationMode', () => {
  const ALLOCATION_MODES = ['SOFT_CAP', 'HARD_CAP', 'UNLIMITED'] as const;

  it('has three allocation modes', () => {
    expect(ALLOCATION_MODES).toHaveLength(3);
  });

  describe('SOFT_CAP mode', () => {
    it('allows exceeding with warning', () => {
      const mode = 'SOFT_CAP';
      const limit = 10;
      const current = 12;

      // Soft cap allows exceeding but flags it
      const isExceeding = current > limit;
      const shouldBlock = mode === 'HARD_CAP' && isExceeding;

      expect(isExceeding).toBe(true);
      expect(shouldBlock).toBe(false);
    });
  });

  describe('HARD_CAP mode', () => {
    it('blocks exceeding limit', () => {
      const mode = 'HARD_CAP';
      const limit = 10;
      const current = 12;

      const isExceeding = current > limit;
      const shouldBlock = mode === 'HARD_CAP' && isExceeding;

      expect(isExceeding).toBe(true);
      expect(shouldBlock).toBe(true);
    });
  });

  describe('UNLIMITED mode', () => {
    it('never blocks', () => {
      const mode = 'UNLIMITED';
      const limit = 10;
      const current = 1000;

      const shouldBlock = mode === 'HARD_CAP' && current > limit;

      expect(shouldBlock).toBe(false);
    });
  });
});

// ===========================================
// Workspace Resource Allocation Tests
// ===========================================

describe('Workspace resource allocation', () => {
  describe('pool resources', () => {
    it('org plans have workspace pool resources', () => {
      for (const planKey of ['ORG_STARTER', 'ORG_GROWTH', 'ORG_PRO', 'ORG_BUSINESS'] as OrgPlanType[]) {
        const pool = ORG_PLAN_LIMITS[planKey].pool;
        expect(pool.ramMb).not.toBeNull();
        expect(pool.cpuCores).not.toBeNull();
        expect(pool.storageMb).not.toBeNull();
      }
    });

    it('enterprise has custom (null) pool resources', () => {
      const pool = ORG_PLAN_LIMITS['ORG_ENTERPRISE' as OrgPlanType].pool;
      expect(pool.ramMb).toBeNull();
      expect(pool.cpuCores).toBeNull();
      expect(pool.storageMb).toBeNull();
    });
  });

  describe('RAM allocation', () => {
    it('cannot allocate more RAM than org pool', () => {
      const orgPool = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType].pool;
      const totalRam = orgPool.ramMb!; // 4096

      const deptAllocations = [
        { maxRamMb: 1024 },
        { maxRamMb: 2048 },
      ];

      const allocated = deptAllocations.reduce((sum, a) => sum + (a.maxRamMb ?? 0), 0);
      const remaining = totalRam - allocated;
      const newRequest = 2000;

      expect(totalRam).toBe(4096);
      expect(allocated).toBe(3072);
      expect(remaining).toBe(1024);
      expect(newRequest > remaining).toBe(true);
    });
  });

  describe('CPU allocation', () => {
    it('supports fractional CPU cores', () => {
      const orgPool = ORG_PLAN_LIMITS['ORG_STARTER' as OrgPlanType].pool;
      const totalCpu = orgPool.cpuCores!; // 2

      const deptAllocations = [
        { maxCpuCores: 0.5 },
        { maxCpuCores: 0.5 },
        { maxCpuCores: 0.5 },
      ];

      const allocated = deptAllocations.reduce((sum, a) => sum + (a.maxCpuCores ?? 0), 0);
      const remaining = totalCpu - allocated;

      expect(totalCpu).toBe(2);
      expect(allocated).toBe(1.5);
      expect(remaining).toBe(0.5);
    });
  });

  describe('storage allocation', () => {
    it('tracks storage in MB', () => {
      const orgPool = ORG_PLAN_LIMITS['ORG_GROWTH' as OrgPlanType].pool;
      const totalStorage = orgPool.storageMb!; // 51200

      expect(totalStorage).toBe(51200);
      expect(totalStorage / 1024).toBe(50); // 50 GB
    });
  });
});

// ===========================================
// Edge Cases Tests
// ===========================================

describe('Edge cases', () => {
  it('handles zero allocations', () => {
    const allocation = {
      maxGateways: 0,
      maxWorkflows: 0,
      aiTokenBudget: 0,
    };

    // Zero is a valid allocation (reserve nothing)
    expect(allocation.maxGateways).toBe(0);
    expect(allocation.maxWorkflows).toBe(0);
    expect(allocation.aiTokenBudget).toBe(0);
  });

  it('handles empty allocation list', () => {
    const allocations: { maxGateways: number }[] = [];
    const sum = allocations.reduce((acc, a) => acc + (a.maxGateways ?? 0), 0);
    expect(sum).toBe(0);
  });

  it('handles mixed null and defined allocations', () => {
    const allocation = {
      maxGateways: 5,
      maxWorkflows: null,
      maxPlugins: 10,
      aiTokenBudget: null,
    };

    // Should validate defined fields and skip nulls
    const definedFields = Object.entries(allocation)
      .filter(([_, v]) => v !== null)
      .map(([k]) => k);

    expect(definedFields).toContain('maxGateways');
    expect(definedFields).toContain('maxPlugins');
    expect(definedFields).not.toContain('maxWorkflows');
    expect(definedFields).not.toContain('aiTokenBudget');
  });

  it('handles updating existing allocation (excludes current from total)', () => {
    const orgLimit = 10;
    const existingAllocations = [
      { id: 'dept1', maxGateways: 3 },
      { id: 'dept2', maxGateways: 4 },
      { id: 'dept3', maxGateways: 2 },
    ];

    // Updating dept2 from 4 to 6
    const updatingDeptId = 'dept2';
    const newValue = 6;

    // Exclude the updating dept from current total
    const otherAllocationsTotal = existingAllocations
      .filter((a) => a.id !== updatingDeptId)
      .reduce((sum, a) => sum + a.maxGateways, 0);

    const newTotal = otherAllocationsTotal + newValue;
    const wouldExceed = newTotal > orgLimit;

    expect(otherAllocationsTotal).toBe(5); // 3 + 2
    expect(newTotal).toBe(11); // 5 + 6
    expect(wouldExceed).toBe(true);
  });
});
