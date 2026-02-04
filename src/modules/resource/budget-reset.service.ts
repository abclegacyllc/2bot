/**
 * Budget Reset Service
 * 
 * Handles monthly reset of credit budgets for departments and members.
 * Designed to be called by:
 * - External cron service (Vercel Cron, Railway Cron, etc.)
 * - Manual admin trigger
 * - Startup check (for missed resets)
 * 
 * @module modules/resource/budget-reset.service
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const resetLogger = logger.child({ module: "budget-reset" });

/**
 * Check if a reset is due based on the last reset time
 */
function isResetDue(lastReset: Date | null): boolean {
  if (!lastReset) {
    // Never reset = reset is due
    return true;
  }
  
  const now = new Date();
  const lastResetMonth = lastReset.getUTCMonth();
  const lastResetYear = lastReset.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();
  
  // Reset is due if we're in a different month
  return currentYear > lastResetYear || 
         (currentYear === lastResetYear && currentMonth > lastResetMonth);
}

class BudgetResetService {
  /**
   * Reset credit usage for all departments in an organization
   * 
   * This resets creditUsed to 0 and updates creditResetAt timestamp
   * for all department allocations in the org.
   */
  async resetOrgDeptCredits(orgId: string): Promise<{ 
    count: number; 
    skipped: number;
  }> {
    const now = new Date();
    
    // Get all department allocations for this org
    const deptAllocs = await prisma.deptAllocation.findMany({
      where: {
        department: { organizationId: orgId },
      },
      select: {
        id: true,
        departmentId: true,
        creditUsed: true,
        creditResetAt: true,
      },
    });
    
    let count = 0;
    let skipped = 0;
    
    for (const alloc of deptAllocs) {
      // Check if reset is due for this allocation
      if (!isResetDue(alloc.creditResetAt)) {
        skipped++;
        continue;
      }
      
      await prisma.deptAllocation.update({
        where: { id: alloc.id },
        data: {
          creditUsed: 0,
          creditResetAt: now,
        },
      });
      
      count++;
      
      resetLogger.debug({
        departmentId: alloc.departmentId,
        previousUsed: alloc.creditUsed,
      }, 'Reset department credit usage');
    }
    
    resetLogger.info({
      orgId,
      count,
      skipped,
    }, 'Reset organization department credits');
    
    return { count, skipped };
  }
  
  /**
   * Reset credit usage for all members in a department
   */
  async resetDeptMemberCredits(deptId: string): Promise<{
    count: number;
    skipped: number;
  }> {
    const now = new Date();
    
    // Get all member allocations for this department
    const memberAllocs = await prisma.memberAllocation.findMany({
      where: { departmentId: deptId },
      select: {
        id: true,
        userId: true,
        creditUsed: true,
        creditResetAt: true,
      },
    });
    
    let count = 0;
    let skipped = 0;
    
    for (const alloc of memberAllocs) {
      // Check if reset is due for this allocation
      if (!isResetDue(alloc.creditResetAt)) {
        skipped++;
        continue;
      }
      
      await prisma.memberAllocation.update({
        where: { id: alloc.id },
        data: {
          creditUsed: 0,
          creditResetAt: now,
        },
      });
      
      count++;
      
      resetLogger.debug({
        userId: alloc.userId,
        previousUsed: alloc.creditUsed,
      }, 'Reset member credit usage');
    }
    
    resetLogger.info({
      deptId,
      count,
      skipped,
    }, 'Reset department member credits');
    
    return { count, skipped };
  }
  
  /**
   * Reset all credit usage for an organization (depts + members)
   * This is the main method called by cron/admin
   */
  async resetAllOrgCredits(orgId: string): Promise<{
    departments: { count: number; skipped: number };
    members: { count: number; skipped: number };
  }> {
    // Reset departments first
    const deptResult = await this.resetOrgDeptCredits(orgId);
    
    // Get all departments in org
    const departments = await prisma.department.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    
    // Reset members for each department
    let memberCount = 0;
    let memberSkipped = 0;
    
    for (const dept of departments) {
      const result = await this.resetDeptMemberCredits(dept.id);
      memberCount += result.count;
      memberSkipped += result.skipped;
    }
    
    resetLogger.info({
      orgId,
      departments: deptResult,
      members: { count: memberCount, skipped: memberSkipped },
    }, 'Completed organization credit reset');
    
    return {
      departments: deptResult,
      members: { count: memberCount, skipped: memberSkipped },
    };
  }
  
  /**
   * Global reset - resets all organizations
   * Called by external cron on 1st of each month
   */
  async resetAllCredits(): Promise<{
    organizations: number;
    departments: number;
    members: number;
  }> {
    // Get all organizations
    const orgs = await prisma.organization.findMany({
      select: { id: true },
    });
    
    let totalDepts = 0;
    let totalMembers = 0;
    
    for (const org of orgs) {
      const result = await this.resetAllOrgCredits(org.id);
      totalDepts += result.departments.count;
      totalMembers += result.members.count;
    }
    
    resetLogger.info({
      organizations: orgs.length,
      departments: totalDepts,
      members: totalMembers,
    }, 'Completed global credit reset');
    
    return {
      organizations: orgs.length,
      departments: totalDepts,
      members: totalMembers,
    };
  }
  
  /**
   * Check if any resets are pending (for startup check)
   */
  async hasPendingResets(): Promise<boolean> {
    // Check if any allocation has a stale creditResetAt
    const staleAlloc = await prisma.deptAllocation.findFirst({
      where: {
        OR: [
          { creditResetAt: null },
          { creditResetAt: { lt: this.getMonthStart() } },
        ],
        creditUsed: { gt: 0 },
      },
    });
    
    return staleAlloc !== null;
  }
  
  /**
   * Get the start of the current month
   */
  private getMonthStart(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
}

// Export singleton
export const budgetResetService = new BudgetResetService();
