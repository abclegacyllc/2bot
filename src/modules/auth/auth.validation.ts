import { z } from "zod";

/**
 * Password validation rules
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be less than 100 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Email validation
 */
const emailSchema = z.string().email("Invalid email address").toLowerCase().trim();

/**
 * Name validation
 */
const nameSchema = z
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
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
});

/**
 * Login request validation
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

/**
 * Forgot password request validation
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * Reset password request validation
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema,
});

/**
 * Change password request validation
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

/**
 * Update profile request validation
 */
export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  image: z.string().url("Invalid image URL").optional().nullable(),
});

/**
 * Email verification request validation
 */
export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// ===========================================
// Inferred Types from Schemas
// ===========================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ===========================================
// Validation Helper
// ===========================================

/**
 * Validate data against a schema and return typed result
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string[]> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Transform Zod errors into our error format
  const errors: Record<string, string[]> = {};
  for (const error of result.error.issues) {
    const path = error.path.join(".") || "root";
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(error.message);
  }

  return { success: false, errors };
}
