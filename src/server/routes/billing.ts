/**
 * Billing Routes
 *
 * API endpoints for subscription management and billing.
 * Context-aware: uses org's billing if in org context, user's billing otherwise.
 *
 * @module server/routes/billing
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { stripeService } from '@/modules/billing';
import type { PlanType } from '@/shared/constants/plans';
import { canUpgradeTo, hasStripePrice } from '@/shared/constants/plans';
import { BadRequestError, ForbiddenError, ValidationError } from '@/shared/errors';
import type { ApiResponse } from '@/shared/types';
import { createServiceContext } from '@/shared/types/context';

import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';

export const billingRouter = Router();

// ===========================================
// Validation Schemas
// ===========================================

const checkoutSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS'] as const),
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Helper to create ServiceContext from Express request
 */
function getServiceContext(req: Request) {
  if (!req.user) {
    throw new BadRequestError('User not authenticated');
  }

  // Use token payload if available (contains activeContext from JWT)
  if (req.tokenPayload) {
    return createServiceContext(
      {
        userId: req.tokenPayload.userId,
        role: req.tokenPayload.role,
        plan: req.tokenPayload.plan,
        activeContext: req.tokenPayload.activeContext,
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'] as string | undefined,
      }
    );
  }

  // Fallback: create personal context from user object
  return createServiceContext(
    {
      userId: req.user.id,
      role: req.user.role,
      plan: req.user.plan,
      activeContext: {
        type: 'personal',
        plan: req.user.plan,
      },
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
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

// ===========================================
// Routes
// ===========================================

/**
 * POST /api/billing/checkout
 * Create a Stripe checkout session for plan upgrade
 */
billingRouter.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ url: string }>>) => {
    const ctx = getServiceContext(req);

    // Parse and validate request body
    const parseResult = checkoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }

    const { plan } = parseResult.data;

    // Validate plan can be purchased via Stripe
    if (!hasStripePrice(plan)) {
      throw new BadRequestError(`Plan ${plan} cannot be purchased via checkout`);
    }

    // Validate upgrade path
    if (!canUpgradeTo(ctx.effectivePlan, plan)) {
      throw new BadRequestError(
        `Cannot upgrade from ${ctx.effectivePlan} to ${plan}. ` +
        `You can only upgrade to a higher tier plan.`
      );
    }

    // Check permissions for org billing
    if (ctx.isOrgContext()) {
      if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
        throw new ForbiddenError('Only organization owners and admins can manage billing');
      }
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/dashboard/settings/billing?success=true`;
    const cancelUrl = `${baseUrl}/dashboard/settings/billing?canceled=true`;

    const url = await stripeService.createCheckoutSession(
      ctx,
      plan as PlanType,
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
 * POST /api/billing/portal
 * Create a Stripe billing portal session
 */
billingRouter.post(
  '/portal',
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ url: string }>>) => {
    const ctx = getServiceContext(req);

    // Check permissions for org billing
    if (ctx.isOrgContext()) {
      if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
        throw new ForbiddenError('Only organization owners and admins can manage billing');
      }
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings/billing`;
    const url = await stripeService.createPortalSession(ctx, returnUrl);

    res.json({
      success: true,
      data: { url },
    });
  })
);

/**
 * GET /api/billing/subscription
 * Get current subscription status
 */
billingRouter.get(
  '/subscription',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const ctx = getServiceContext(req);

    const info = await stripeService.getSubscriptionInfo(ctx);

    res.json({
      success: true,
      data: info,
    });
  })
);

/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
billingRouter.post(
  '/cancel',
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    const ctx = getServiceContext(req);

    // Check permissions for org billing
    if (ctx.isOrgContext()) {
      if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
        throw new ForbiddenError('Only organization owners and admins can manage billing');
      }
    }

    await stripeService.cancelSubscription(ctx);

    res.json({
      success: true,
      data: { message: 'Subscription will be canceled at the end of the billing period' },
    });
  })
);

/**
 * POST /api/billing/resume
 * Resume a canceled subscription
 */
billingRouter.post(
  '/resume',
  requireAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse<{ message: string }>>) => {
    const ctx = getServiceContext(req);

    // Check permissions for org billing
    if (ctx.isOrgContext()) {
      if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
        throw new ForbiddenError('Only organization owners and admins can manage billing');
      }
    }

    await stripeService.resumeSubscription(ctx);

    res.json({
      success: true,
      data: { message: 'Subscription cancellation has been reversed' },
    });
  })
);
