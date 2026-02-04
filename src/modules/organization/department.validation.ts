/**
 * Department Validation Schemas
 *
 * Zod schemas for validating department-related API requests.
 *
 * @module modules/organization/department.validation
 */

import { z } from "zod";

// ===========================================
// Department Schemas
// ===========================================

export const createDeptSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters")
    .trim(),
  description: z
    .string()
    .max(500, "Description must be at most 500 characters")
    .trim()
    .optional(),
});

export const updateDeptSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters")
      .trim()
      .optional(),
    description: z
      .string()
      .max(500, "Description must be at most 500 characters")
      .trim()
      .nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ===========================================
// Member Schemas
// ===========================================

export const addDeptMemberSchema = z.object({
  userId: z.string().cuid("Invalid user ID"),
  role: z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
});

export const updateDeptMemberSchema = z
  .object({
    role: z.enum(["MANAGER", "MEMBER"]).optional(),
    // NOTE: Quota/allocation updates are handled separately via
    // allocationService.setMemberAllocation() with setMemberAllocationSchema
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

// ===========================================
// Legacy Quota Schemas - REMOVED
// ===========================================
// 
// deptQuotasSchema and memberQuotasSchema have been removed.
// Use the new 3-pool resource validation schemas instead:
// 
// import { 
//   setDeptAllocationSchema,
//   setMemberAllocationSchema 
// } from '@/modules/resource';
// 
// These provide full 3-pool validation:
//   - Automation: maxGateways, maxPlugins, maxWorkflows
//   - Workspace: ramMb, cpuCores, storageMb
//   - Budget: creditBudget
//

// ===========================================
// Export Types
// ===========================================

export type CreateDeptInput = z.infer<typeof createDeptSchema>;
export type UpdateDeptInput = z.infer<typeof updateDeptSchema>;
export type AddDeptMemberInput = z.infer<typeof addDeptMemberSchema>;
export type UpdateDeptMemberInput = z.infer<typeof updateDeptMemberSchema>;

// Legacy types removed - use types from @/modules/resource instead:
// - SetDeptAllocationInput (replaces DeptQuotasInput)
// - SetMemberAllocationInput (replaces MemberQuotasInput)
