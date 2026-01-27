"use strict";
/**
 * Stripe Service
 *
 * Handles all Stripe-related operations for billing.
 * Context-aware: uses org's customer if in org context, user's customer otherwise.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeService = void 0;
const prisma_1 = require("@/lib/prisma");
const org_plans_1 = require("@/shared/constants/org-plans");
const plans_1 = require("@/shared/constants/plans");
const stripe_1 = __importDefault(require("stripe"));
// Lazy-initialized Stripe client
// Will be created on first use after env vars are loaded
let stripe = null;
/**
 * Helper to get Stripe client or throw if not configured
 * Lazy initialization ensures env vars are loaded by dotenv first
 */
function getStripe() {
    if (!stripe) {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.');
        }
        stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
    }
    return stripe;
}
class StripeService {
    /**
     * Get or create Stripe customer for current context
     * Uses org's customer if in org context, user's customer otherwise
     */
    async getOrCreateCustomer(ctx) {
        if (ctx.isOrgContext() && ctx.organizationId) {
            // Org context: use org's Stripe customer
            const org = await prisma_1.prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: {
                    stripeCustomerId: true,
                    name: true,
                    memberships: {
                        where: { userId: ctx.userId },
                        include: { user: { select: { email: true } } },
                    },
                },
            });
            if (!org) {
                throw new Error('Organization not found');
            }
            if (org.stripeCustomerId) {
                return org.stripeCustomerId;
            }
            // Get billing email from the user making the request
            const billingEmail = org.memberships[0]?.user.email;
            if (!billingEmail) {
                throw new Error('No billing email found for organization');
            }
            // Create new Stripe customer for org
            const customer = await getStripe().customers.create({
                email: billingEmail,
                name: org.name,
                metadata: {
                    type: 'organization',
                    organizationId: ctx.organizationId,
                },
            });
            // Store customer ID
            await prisma_1.prisma.organization.update({
                where: { id: ctx.organizationId },
                data: { stripeCustomerId: customer.id },
            });
            return customer.id;
        }
        else {
            // Personal context: use user's Stripe customer
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: ctx.userId },
                select: { stripeCustomerId: true, email: true, name: true },
            });
            if (!user) {
                throw new Error('User not found');
            }
            if (user.stripeCustomerId) {
                return user.stripeCustomerId;
            }
            // Create new Stripe customer for user
            const customer = await getStripe().customers.create({
                email: user.email,
                name: user.name ?? undefined,
                metadata: {
                    type: 'user',
                    userId: ctx.userId,
                },
            });
            // Store customer ID
            await prisma_1.prisma.user.update({
                where: { id: ctx.userId },
                data: { stripeCustomerId: customer.id },
            });
            return customer.id;
        }
    }
    /**
     * Create a Stripe checkout session for a plan upgrade
     */
    async createCheckoutSession(ctx, plan, successUrl, cancelUrl) {
        // Validate plan can be purchased via Stripe
        if (!(0, plans_1.hasStripePrice)(plan)) {
            throw new Error(`Plan ${plan} cannot be purchased via Stripe checkout`);
        }
        const priceId = (0, plans_1.getPriceId)(plan);
        if (!priceId) {
            throw new Error(`Stripe price ID not configured for plan ${plan}`);
        }
        const customerId = await this.getOrCreateCustomer(ctx);
        // Prepare metadata
        const metadata = {
            plan,
            userId: ctx.userId,
        };
        if (ctx.isOrgContext() && ctx.organizationId) {
            metadata.organizationId = ctx.organizationId;
        }
        // Create checkout session
        const session = await getStripe().checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            subscription_data: {
                metadata,
            },
            metadata,
        });
        // Create or update subscription record
        await this.ensureSubscription(ctx);
        if (!session.url) {
            throw new Error('Failed to create checkout session URL');
        }
        return session.url;
    }
    /**
     * Create a Stripe billing portal session
     */
    async createPortalSession(ctx, returnUrl) {
        const customerId = await this.getOrCreateCustomer(ctx);
        const session = await getStripe().billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        return session.url;
    }
    /**
     * Get current subscription info for context
     */
    async getSubscriptionInfo(ctx) {
        const isOrgContext = ctx.isOrgContext() && ctx.organizationId;
        const subscription = isOrgContext
            ? await prisma_1.prisma.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
            })
            : await prisma_1.prisma.subscription.findUnique({
                where: { userId: ctx.userId },
            });
        // Default to appropriate free tier based on context
        const planStr = subscription?.plan ?? (isOrgContext ? 'ORG_FREE' : 'FREE');
        // Get limits from the appropriate plan constants based on context
        if (isOrgContext) {
            const orgPlan = planStr;
            const orgLimits = org_plans_1.ORG_PLAN_LIMITS[orgPlan] || org_plans_1.ORG_PLAN_LIMITS.ORG_FREE;
            return {
                id: subscription?.id ?? '',
                plan: orgPlan,
                status: subscription?.stripeStatus ?? 'none',
                currentPeriodEnd: subscription?.currentPeriodEnd ?? undefined,
                cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
                limits: {
                    gateways: orgLimits.sharedGateways,
                    plugins: orgLimits.sharedPlugins,
                    executionsPerMonth: orgLimits.executionsPerMonth,
                    aiTokensPerMonth: orgLimits.sharedAiTokensPerMonth,
                    workspace: orgLimits.pool.ramMb !== null ? {
                        ramMb: orgLimits.pool.ramMb,
                        cpuCores: orgLimits.pool.cpuCores ?? 0,
                        storageMb: orgLimits.pool.storageMb ?? 0,
                    } : null,
                },
            };
        }
        // User context - use regular plan limits
        const userPlan = planStr;
        const limits = (0, plans_1.getPlanLimits)(userPlan);
        return {
            id: subscription?.id ?? '',
            plan: userPlan,
            status: subscription?.stripeStatus ?? 'none',
            currentPeriodEnd: subscription?.currentPeriodEnd ?? undefined,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
            limits: {
                gateways: limits.gateways,
                plugins: limits.plugins,
                executionsPerMonth: limits.executionsPerMonth,
                aiTokensPerMonth: limits.aiTokensPerMonth,
                workspace: limits.workspace,
            },
        };
    }
    /**
     * Ensure a subscription record exists for the context
     * Creates one if it doesn't exist
     */
    async ensureSubscription(ctx) {
        if (ctx.isOrgContext() && ctx.organizationId) {
            const existing = await prisma_1.prisma.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
            });
            if (!existing) {
                await prisma_1.prisma.subscription.create({
                    data: {
                        organizationId: ctx.organizationId,
                        plan: 'ORG_FREE',
                    },
                });
            }
        }
        else {
            const existing = await prisma_1.prisma.subscription.findUnique({
                where: { userId: ctx.userId },
            });
            if (!existing) {
                await prisma_1.prisma.subscription.create({
                    data: {
                        userId: ctx.userId,
                        plan: 'FREE',
                    },
                });
            }
        }
    }
    /**
     * Get the raw Stripe subscription object
     */
    async getStripeSubscription(subscriptionId) {
        try {
            return await getStripe().subscriptions.retrieve(subscriptionId);
        }
        catch {
            return null;
        }
    }
    /**
     * Cancel a subscription at period end
     */
    async cancelSubscription(ctx) {
        const subscription = ctx.isOrgContext() && ctx.organizationId
            ? await prisma_1.prisma.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
            })
            : await prisma_1.prisma.subscription.findUnique({
                where: { userId: ctx.userId },
            });
        if (!subscription?.stripeSubscriptionId) {
            throw new Error('No active subscription found');
        }
        // Cancel at period end (not immediate)
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        // Update local record
        await prisma_1.prisma.subscription.update({
            where: { id: subscription.id },
            data: { cancelAtPeriodEnd: true },
        });
    }
    /**
     * Resume a cancelled subscription
     */
    async resumeSubscription(ctx) {
        const subscription = ctx.isOrgContext() && ctx.organizationId
            ? await prisma_1.prisma.subscription.findUnique({
                where: { organizationId: ctx.organizationId },
            })
            : await prisma_1.prisma.subscription.findUnique({
                where: { userId: ctx.userId },
            });
        if (!subscription?.stripeSubscriptionId) {
            throw new Error('No active subscription found');
        }
        // Remove cancellation
        await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: false,
        });
        // Update local record
        await prisma_1.prisma.subscription.update({
            where: { id: subscription.id },
            data: { cancelAtPeriodEnd: false },
        });
    }
}
exports.stripeService = new StripeService();
//# sourceMappingURL=stripe.service.js.map