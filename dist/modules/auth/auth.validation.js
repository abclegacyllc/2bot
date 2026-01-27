"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.switchContextSchema = exports.verifyEmailSchema = exports.updateProfileSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = void 0;
exports.validateSchema = validateSchema;
const zod_1 = require("zod");
/**
 * Password validation rules
 */
const passwordSchema = zod_1.z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number");
/**
 * Email validation
 */
const emailSchema = zod_1.z.string().email("Invalid email address").toLowerCase().trim();
/**
 * Name validation
 */
const nameSchema = zod_1.z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .trim();
// ===========================================
// Request Validation Schemas
// ===========================================
/**
 * Registration request validation
 */
exports.registerSchema = zod_1.z.object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema.optional(),
});
/**
 * Login request validation
 */
exports.loginSchema = zod_1.z.object({
    email: emailSchema,
    password: zod_1.z.string().min(1, "Password is required"),
});
/**
 * Forgot password request validation
 */
exports.forgotPasswordSchema = zod_1.z.object({
    email: emailSchema,
});
/**
 * Reset password request validation
 */
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Token is required"),
    password: passwordSchema,
});
/**
 * Change password request validation
 */
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
});
/**
 * Update profile request validation
 */
exports.updateProfileSchema = zod_1.z.object({
    name: nameSchema.optional(),
    image: zod_1.z.string().url("Invalid image URL").optional().nullable(),
});
/**
 * Email verification request validation
 */
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Token is required"),
});
/**
 * Context switching request validation (Phase 4)
 */
exports.switchContextSchema = zod_1.z
    .object({
    contextType: zod_1.z.enum(["personal", "organization"]),
    organizationId: zod_1.z.string().cuid("Invalid organization ID").optional(),
})
    .refine((data) => {
    // organizationId is required when contextType is 'organization'
    if (data.contextType === "organization" && !data.organizationId) {
        return false;
    }
    return true;
}, {
    message: "Organization ID is required when switching to organization context",
    path: ["organizationId"],
});
// ===========================================
// Validation Helper
// ===========================================
/**
 * Validate data against a schema and return typed result
 */
function validateSchema(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    // Transform Zod errors into our error format
    const errors = {};
    for (const error of result.error.issues) {
        const path = error.path.join(".") || "root";
        if (!errors[path]) {
            errors[path] = [];
        }
        errors[path].push(error.message);
    }
    return { success: false, errors };
}
//# sourceMappingURL=auth.validation.js.map