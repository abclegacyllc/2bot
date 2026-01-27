"use strict";
/**
 * Organization Billing Routes
 *
 * API endpoints for organization subscription management and billing.
 * All routes at /api/orgs/:orgId/billing/* for organization billing.
 *
 * @module server/routes/org-billing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgBillingRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const billing_1 = require("@/modules/billing");
const org_plans_1 = require("@/shared/constants/org-plans");
const errors_1 = require("@/shared/errors");
const context_1 = require("@/shared/types/context");
const auth_1 = require("../middleware/auth");
const error_handler_1 = require("../middleware/error-handler");
const org_auth_1 = require("../middleware/org-auth");
exports.orgBillingRouter = (0, express_1.Router)({ mergeParams: true });
// ===========================================
// Validation Schemas
// ===========================================
const checkoutSchema = zod_1.z.object({
    plan: zod_1.z.enum(['ORG_GROWTH', 'ORG_PRO', 'ORG_ENTERPRISE']),
});
const workspaceBoosterSchema = zod_1.z.object({
    tier: zod_1.z.enum(['WS_STARTER', 'WS_PRO', 'WS_TEAM']),
    quantity: zod_1.z.number().min(1).max(100).optional().default(1),
});
// ===========================================
// Helper Functions
// ===========================================
/**
 * Extract and validate path parameter as string
 */
function getPathParam(req, name) {
    const value = req.params[name];
    if (typeof value !== "string" || !value) {
        throw new errors_1.BadRequestError(`Missing path parameter: ${name}`);
    }
    return value;
}
/**
 * Helper to create organization ServiceContext from Express request
 */
function getOrgContext(req, orgId) {
    if (!req.user) {
        throw new errors_1.BadRequestError('User not authenticated');
    }
    const memberRole = req.orgMembership?.role;
    return (0, context_1.createServiceContext)({
        userId: req.user.id,
        role: req.user.role,
        plan: req.user.plan,
        activeContext: {
            type: 'organization',
            organizationId: orgId,
            orgRole: memberRole,
            plan: req.user.plan,
        },
    }, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
    });
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
/**
 * Check if org can upgrade to target plan
 */
function canOrgUpgradeTo(currentPlan, targetPlan) {
    const allowedTargets = org_plans_1.ORG_PLAN_UPGRADE_PATHS[currentPlan] || [];
    return allowedTargets.includes(targetPlan);
}
/**
 * Check if org plan has a Stripe price
 */
function hasOrgStripePrice(plan) {
    return !!org_plans_1.ORG_PLAN_STRIPE_PRICES[plan];
}
// ===========================================
// Routes
// ===========================================
/**
 * GET /api/orgs/:orgId/billing/subscription
 * Get organization subscription status
 */
exports.orgBillingRouter.get('/subscription', auth_1.requireAuth, org_auth_1.requireOrgMember, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    // Use existing stripeService method - it already supports org context
    const info = await billing_1.stripeService.getSubscriptionInfo(ctx);
    res.json({
        success: true,
        data: info,
    });
}));
/**
 * POST /api/orgs/:orgId/billing/checkout
 * Create a Stripe checkout session for org plan upgrade
 */
exports.orgBillingRouter.post('/checkout', auth_1.requireAuth, org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    // Parse and validate request body
    const parseResult = checkoutSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }
    const { plan } = parseResult.data;
    // Validate plan can be purchased via Stripe
    if (!hasOrgStripePrice(plan)) {
        throw new errors_1.BadRequestError(`Plan ${plan} cannot be purchased via checkout`);
    }
    // Get org's current plan and validate upgrade path
    const orgInfo = await billing_1.stripeService.getSubscriptionInfo(ctx);
    const currentPlan = orgInfo.plan || 'ORG_FREE';
    if (!canOrgUpgradeTo(currentPlan, plan)) {
        throw new errors_1.BadRequestError(`Cannot upgrade from ${currentPlan} to ${plan}. ` +
            `You can only upgrade to a higher tier plan.`);
    }
    // Create checkout session with org-specific URLs
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/dashboard/organizations/billing?success=true`;
    const cancelUrl = `${baseUrl}/dashboard/organizations/billing?canceled=true`;
    // Map org plan to a PlanType for the existing method
    // For now, org plans need to be handled separately
    // TODO: Extend stripeService to handle OrgPlanType directly
    const url = await billing_1.stripeService.createCheckoutSession(ctx, plan, successUrl, cancelUrl);
    res.json({
        success: true,
        data: { url },
    });
}));
/**
 * POST /api/orgs/:orgId/billing/portal
 * Create a Stripe billing portal session for org
 */
exports.orgBillingRouter.post('/portal', auth_1.requireAuth, org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/organizations/billing`;
    const url = await billing_1.stripeService.createPortalSession(ctx, returnUrl);
    res.json({
        success: true,
        data: { url },
    });
}));
/**
 * POST /api/orgs/:orgId/billing/workspace
 * Purchase workspace booster for org
 * TODO: Implement workspace booster checkout flow
 */
exports.orgBillingRouter.post('/workspace', auth_1.requireAuth, org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    // Parse and validate request body
    const parseResult = workspaceBoosterSchema.safeParse(req.body);
    if (!parseResult.success) {
        throw new errors_1.ValidationError('Validation failed', formatZodErrors(parseResult.error));
    }
    const { tier, quantity } = parseResult.data;
    // TODO: Implement workspace booster checkout
    // For now, return a placeholder response
    throw new errors_1.BadRequestError(`Workspace booster checkout not yet implemented. ` +
        `Requested: ${quantity}x ${tier} for org ${orgId}`);
}));
/**
 * POST /api/orgs/:orgId/billing/cancel
 * Cancel organization subscription at period end
 */
exports.orgBillingRouter.post('/cancel', auth_1.requireAuth, org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    await billing_1.stripeService.cancelSubscription(ctx);
    res.json({
        success: true,
        data: { message: 'Organization subscription will be canceled at the end of the billing period' },
    });
}));
/**
 * POST /api/orgs/:orgId/billing/resume
 * Resume a canceled organization subscription
 */
exports.orgBillingRouter.post('/resume', auth_1.requireAuth, org_auth_1.requireOrgAdmin, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const orgId = getPathParam(req, 'orgId');
    const ctx = getOrgContext(req, orgId);
    await billing_1.stripeService.resumeSubscription(ctx);
    res.json({
        success: true,
        data: { message: 'Organization subscription cancellation has been reversed' },
    });
}));
//# sourceMappingURL=org-billing.js.map