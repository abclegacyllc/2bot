"use strict";
/**
 * Billing Routes
 *
 * API endpoints for subscription management and billing.
 * Context-aware: uses org's billing if in org context, user's billing otherwise.
 *
 * @module server/routes/billing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const billing_1 = require("@/modules/billing");
const plans_1 = require("@/shared/constants/plans");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
exports.billingRouter = (0, express_1.Router)();
// ===========================================
// Validation Schemas
// ===========================================
const checkoutSchema = zod_1.z.object({
    plan: zod_1.z.enum(['STARTER', 'PRO', 'BUSINESS']),
});
// ===========================================
// Helper Functions
// ===========================================
/**
 * Helper to create ServiceContext from Express request
 * Phase 6.7: Token no longer contains activeContext - defaults to personal context
 * This route is deprecated - use /api/user/billing or /api/orgs/:orgId/billing
 */
function getServiceContext(req) {
    if (!req.user) {
        throw new errors_1.BadRequestError('User not authenticated');
    }
    // Phase 6.7: Token simplified - context determined by URL, not token
    return (0, context_1.createServiceContext)({
        userId: req.tokenPayload?.userId ?? req.user.id,
        role: req.tokenPayload?.role ?? req.user.role,
        plan: req.tokenPayload?.plan ?? req.user.plan,
    }, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
    }, 
    // Default to personal context for legacy routes
    { contextType: 'personal', effectivePlan: req.user.plan });
}
/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error) {
    const errors = {};
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
exports.billingRouter.post('/checkout', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Parse and validate request body
    const parseResult = checkoutSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }
    const { plan } = parseResult.data;
    // Validate plan can be purchased via Stripe
    if (!(0, plans_1.hasStripePrice)(plan)) {
        throw new errors_1.BadRequestError(`Plan ${plan} cannot be purchased via checkout`);
    }
    // Validate upgrade path
    if (!(0, plans_1.canUpgradeTo)(ctx.effectivePlan, plan)) {
        throw new errors_1.BadRequestError(`Cannot upgrade from ${ctx.effectivePlan} to ${plan}. ` +
            `You can only upgrade to a higher tier plan.`);
    }
    // Check permissions for org billing
    if (ctx.isOrgContext()) {
        if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
            throw new errors_1.ForbiddenError('Only organization owners and admins can manage billing');
        }
    }
    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/dashboard/billing?success=true`;
    const cancelUrl = `${baseUrl}/dashboard/billing?canceled=true`;
    const url = await billing_1.stripeService.createCheckoutSession(ctx, plan, successUrl, cancelUrl);
    res.json({
        success: true,
        data: { url },
    });
}));
/**
 * POST /api/billing/portal
 * Create a Stripe billing portal session
 */
exports.billingRouter.post('/portal', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Check permissions for org billing
    if (ctx.isOrgContext()) {
        if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
            throw new errors_1.ForbiddenError('Only organization owners and admins can manage billing');
        }
    }
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/billing`;
    const url = await billing_1.stripeService.createPortalSession(ctx, returnUrl);
    res.json({
        success: true,
        data: { url },
    });
}));
/**
 * GET /api/billing/subscription
 * Get current subscription status
 */
exports.billingRouter.get('/subscription', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    const info = await billing_1.stripeService.getSubscriptionInfo(ctx);
    res.json({
        success: true,
        data: info,
    });
}));
/**
 * POST /api/billing/cancel
 * Cancel subscription at period end
 */
exports.billingRouter.post('/cancel', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Check permissions for org billing
    if (ctx.isOrgContext()) {
        if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
            throw new errors_1.ForbiddenError('Only organization owners and admins can manage billing');
        }
    }
    await billing_1.stripeService.cancelSubscription(ctx);
    res.json({
        success: true,
        data: { message: 'Subscription will be canceled at the end of the billing period' },
    });
}));
/**
 * POST /api/billing/resume
 * Resume a canceled subscription
 */
exports.billingRouter.post('/resume', auth_1.requireAuth, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const ctx = getServiceContext(req);
    // Check permissions for org billing
    if (ctx.isOrgContext()) {
        if (!ctx.orgRole || !['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole)) {
            throw new errors_1.ForbiddenError('Only organization owners and admins can manage billing');
        }
    }
    await billing_1.stripeService.resumeSubscription(ctx);
    res.json({
        success: true,
        data: { message: 'Subscription cancellation has been reversed' },
    });
}));
//# sourceMappingURL=billing.js.map