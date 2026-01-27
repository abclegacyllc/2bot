/**
 * Organization Billing Routes
 *
 * API endpoints for organization subscription management and billing.
 * All routes at /api/orgs/:orgId/billing/* for organization billing.
 *
 * @module server/routes/org-billing
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { stripeService } from '@/modules/billing';
import type { OrgPlanType } from '@/shared/constants/org-plans';
import { ORG_PLAN_STRIPE_PRICES, ORG_PLAN_UPGRADE_PATHS } from '@/shared/constants/org-plans';
import { BadRequestError, ValidationError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext, type ServiceContext } from '@/shared/types/context';

import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { requireOrgAdmin, requireOrgMember } from '../middleware/org-auth';

export const orgBillingRouter = Router({ mergeParams: true });

// ===========================================
// Validation Schemas
// ===========================================

const checkoutSchema = z.object({
  plan: z.enum(['ORG_GROWTH', 'ORG_PRO', 'ORG_ENTERPRISE'] as const),
});

const workspaceBoosterSchema = z.object({
  tier: z.enum(['WS_STARTER', 'WS_PRO', 'WS_TEAM'] as const),
  quantity: z.number().min(1).max(100).optional().default(1),
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Extract and validate path parameter as string
 */
function getPathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new BadRequestError(`Missing path parameter: ${name}`);
  }
  return value;
}

/**
 * Helper to create organization ServiceContext from Express request
 */
function getOrgContext(req: Request, orgId: string): ServiceContext {
  if (!req.user) {
    throw new BadRequestError('User not authenticated');
  }

  const memberRole = req.orgMembership?.role;

  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'organization',
        organizationId: orgId,
        orgRole: memberRole,
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      requestId: req.headers['x-request-id'] as string | undefined,
    }
  );
}

/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(
  error: { issues: Array<{ path: readonly (string | number | symbol)[]; message: string }> }
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }
  return errors;
}

/**
 * Check if org can upgrade to target plan
 */
function canOrgUpgradeTo(currentPlan: OrgPlanType, targetPlan: OrgPlanType): boolean {
  const allowedTargets = ORG_PLAN_UPGRADE_PATHS[currentPlan] || [];
  return allowedTargets.includes(targetPlan);
}

/**
 * Check if org plan has a Stripe price
 */
function hasOrgStripePrice(plan: OrgPlanType): boolean {
  return !!ORG_PLAN_STRIPE_PRICES[plan];
}

// ===========================================
// Routes
// ===========================================

/**
 * GET /api/orgs/:orgId/billing/subscription
 * Get organization subscription status
 */
orgBillingRouter.get(
  '/subscription',
  requireAuth,
  requireOrgMember,
  asyncHandler(async (req: Request, res: Response) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    // Use existing stripeService method - it already supports org context
    const info = await stripeService.getSubscriptionInfo(ctx);

    res.json({
      success: true,
      data: info,
    });
  })
);

/**
 * POST /api/orgs/:orgId/billing/checkout
 * Create a Stripe checkout session for org plan upgrade
 */
orgBillingRouter.post(
  '/checkout',
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ url: string }>>) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    // Parse and validate request body
    const parseResult = checkoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }

    const { plan } = parseResult.data;

    // Validate plan can be purchased via Stripe
    if (!hasOrgStripePrice(plan)) {
      throw new BadRequestError(`Plan ${plan} cannot be purchased via checkout`);
    }

    // Get org's current plan and validate upgrade path
    const orgInfo = await stripeService.getSubscriptionInfo(ctx);
    const currentPlan = (orgInfo.plan as OrgPlanType) || 'ORG_FREE';

    if (!canOrgUpgradeTo(currentPlan, plan)) {
      throw new BadRequestError(
        `Cannot upgrade from ${currentPlan} to ${plan}. ` +
        `You can only upgrade to a higher tier plan.`
      );
    }

    // Create checkout session with org-specific URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/organizations/billing?success=true`;
    const cancelUrl = `${baseUrl}/organizations/billing?canceled=true`;

    // Map org plan to a PlanType for the existing method
    // For now, org plans need to be handled separately
    // TODO: Extend stripeService to handle OrgPlanType directly
    const url = await stripeService.createCheckoutSession(
      ctx,
      plan as unknown as import('@/shared/constants/plans').PlanType,
      successUrl,
      cancelUrl
    );

    res.json({
      success: true,
      data: { url },
    });
  })
);

/**
 * POST /api/orgs/:orgId/billing/portal
 * Create a Stripe billing portal session for org
 */
orgBillingRouter.post(
  '/portal',
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ url: string }>>) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/organizations/billing`;
    const url = await stripeService.createPortalSession(ctx, returnUrl);

    res.json({
      success: true,
      data: { url },
    });
  })
);

/**
 * POST /api/orgs/:orgId/billing/workspace
 * Purchase workspace booster for org
 * TODO: Implement workspace booster checkout flow
 */
orgBillingRouter.post(
  '/workspace',
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ url: string }>>) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    // Parse and validate request body
    const parseResult = workspaceBoosterSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }

    const { tier, quantity } = parseResult.data;

    // TODO: Implement workspace booster checkout
    // For now, return a placeholder response
    throw new BadRequestError(
      `Workspace booster checkout not yet implemented. ` +
      `Requested: ${quantity}x ${tier} for org ${orgId}`
    );
  })
);

/**
 * POST /api/orgs/:orgId/billing/cancel
 * Cancel organization subscription at period end
 */
orgBillingRouter.post(
  '/cancel',
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    await stripeService.cancelSubscription(ctx);

    res.json({
      success: true,
      data: { message: 'Organization subscription will be canceled at the end of the billing period' },
    });
  })
);

/**
 * POST /api/orgs/:orgId/billing/resume
 * Resume a canceled organization subscription
 */
orgBillingRouter.post(
  '/resume',
  requireAuth,
  requireOrgAdmin,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);

    await stripeService.resumeSubscription(ctx);

    res.json({
      success: true,
      data: { message: 'Organization subscription cancellation has been reversed' },
    });
  })
);
