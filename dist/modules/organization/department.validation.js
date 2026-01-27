"use strict";
/**
 * Department Validation Schemas
 *
 * Zod schemas for validating department-related API requests.
 *
 * @module modules/organization/department.validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberQuotasSchema = exports.deptQuotasSchema = exports.updateDeptMemberSchema = exports.addDeptMemberSchema = exports.updateDeptSchema = exports.createDeptSchema = void 0;
const zod_1 = require("zod");
// ===========================================
// Department Schemas
// ===========================================
exports.createDeptSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(100, "Name must be at most 100 characters")
        .trim(),
    description: zod_1.z
        .string()
        .max(500, "Description must be at most 500 characters")
        .trim()
        .optional(),
});
exports.updateDeptSchema = zod_1.z
    .object({
    name: zod_1.z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(100, "Name must be at most 100 characters")
        .trim()
        .optional(),
    description: zod_1.z
        .string()
        .max(500, "Description must be at most 500 characters")
        .trim()
        .nullish(),
    isActive: zod_1.z.boolean().optional(),
})
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
});
// ===========================================
// Member Schemas
// ===========================================
exports.addDeptMemberSchema = zod_1.z.object({
    userId: zod_1.z.string().cuid("Invalid user ID"),
    role: zod_1.z.enum(["MANAGER", "MEMBER"]).default("MEMBER"),
});
exports.updateDeptMemberSchema = zod_1.z
    .object({
    role: zod_1.z.enum(["MANAGER", "MEMBER"]).optional(),
    maxWorkflows: zod_1.z.number().int().min(0).nullish(),
    maxPlugins: zod_1.z.number().int().min(0).nullish(),
})
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided",
});
// ===========================================
// Quota Schemas
// ===========================================
exports.deptQuotasSchema = zod_1.z.object({
    maxWorkflows: zod_1.z.number().int().min(0).nullish(),
    maxPlugins: zod_1.z.number().int().min(0).nullish(),
    maxApiCalls: zod_1.z.number().int().min(0).nullish(),
    maxStorage: zod_1.z.number().int().min(0).nullish(), // bytes
});
exports.memberQuotasSchema = zod_1.z.object({
    maxWorkflows: zod_1.z.number().int().min(0).nullish(),
    maxPlugins: zod_1.z.number().int().min(0).nullish(),
});
//# sourceMappingURL=department.validation.js.map