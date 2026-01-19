/**
 * Stripe Service
 * 
 * Handles all Stripe-related operations for billing.
 * Context-aware: uses org's customer if in org context, user's customer otherwise.
 */

import { prisma } from '@/lib/prisma';
import type { PlanType } from '@/shared/constants/plans';
import {
    getPlanLimits,
    getPriceId,
    hasStripePrice,
} from '@/shared/constants/plans';
import type { ServiceContext } from '@/shared/types/context';
import Stripe from 'stripe';
import type { StripeStatus, SubscriptionInfo } from './billing.types';

// Lazy-initialized Stripe client
// Will be created on first use after env vars are loaded
let stripe: Stripe | null = null;

/**
 * Helper to get Stripe client or throw if not configured
 * Lazy initialization ensures env vars are loaded by dotenv first
 */
function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

class StripeService {
  /**
   * Get or create Stripe customer for current context
   * Uses org's customer if in org context, user's customer otherwise
   */
  async getOrCreateCustomer(ctx: ServiceContext): Promise<string> {
    if (ctx.isOrgContext() && ctx.organizationId) {
      // Org context: use org's Stripe customer
      const org = await prisma.organization.findUnique({
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
      await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { stripeCustomerId: customer.id },
      });

      return customer.id;
    } else {
      // Personal context: use user's Stripe customer
      const user = await prisma.user.findUnique({
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
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { stripeCustomerId: customer.id },
      });

      return customer.id;
    }
  }

  /**
   * Create a Stripe checkout session for a plan upgrade
   */
  async createCheckoutSession(
    ctx: ServiceContext,
    plan: PlanType,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    // Validate plan can be purchased via Stripe
    if (!hasStripePrice(plan)) {
      throw new Error(`Plan ${plan} cannot be purchased via Stripe checkout`);
    }

    const priceId = getPriceId(plan);
    if (!priceId) {
      throw new Error(`Stripe price ID not configured for plan ${plan}`);
    }

    const customerId = await this.getOrCreateCustomer(ctx);

    // Prepare metadata
    const metadata: Record<string, string> = {
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
  async createPortalSession(
    ctx: ServiceContext,
    returnUrl: string
  ): Promise<string> {
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
  async getSubscriptionInfo(ctx: ServiceContext): Promise<SubscriptionInfo> {
    const subscription = ctx.isOrgContext() && ctx.organizationId
      ? await prisma.subscription.findUnique({
          where: { organizationId: ctx.organizationId },
        })
      : await prisma.subscription.findUnique({
          where: { userId: ctx.userId },
        });

    const plan = subscription?.plan ?? 'FREE';
    const limits = getPlanLimits(plan);

    return {
      id: subscription?.id ?? '',
      plan,
      status: (subscription?.stripeStatus as StripeStatus) ?? 'none',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? undefined,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      limits: {
        gateways: limits.gateways,
        plugins: limits.plugins,
        executionsPerDay: limits.executionsPerDay,
        aiTokensPerMonth: limits.aiTokensPerMonth,
        ramMb: limits.ramMb,
        storageMb: limits.storageMb,
      },
    };
  }

  /**
   * Ensure a subscription record exists for the context
   * Creates one if it doesn't exist
   */
  private async ensureSubscription(ctx: ServiceContext): Promise<void> {
    if (ctx.isOrgContext() && ctx.organizationId) {
      const existing = await prisma.subscription.findUnique({
        where: { organizationId: ctx.organizationId },
      });

      if (!existing) {
        await prisma.subscription.create({
          data: {
            organizationId: ctx.organizationId,
            plan: 'FREE',
          },
        });
      }
    } else {
      const existing = await prisma.subscription.findUnique({
        where: { userId: ctx.userId },
      });

      if (!existing) {
        await prisma.subscription.create({
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
  async getStripeSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
    try {
      return await getStripe().subscriptions.retrieve(subscriptionId);
    } catch {
      return null;
    }
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscription(ctx: ServiceContext): Promise<void> {
    const subscription = ctx.isOrgContext() && ctx.organizationId
      ? await prisma.subscription.findUnique({
          where: { organizationId: ctx.organizationId },
        })
      : await prisma.subscription.findUnique({
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
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  /**
   * Resume a cancelled subscription
   */
  async resumeSubscription(ctx: ServiceContext): Promise<void> {
    const subscription = ctx.isOrgContext() && ctx.organizationId
      ? await prisma.subscription.findUnique({
          where: { organizationId: ctx.organizationId },
        })
      : await prisma.subscription.findUnique({
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
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });
  }
}

export const stripeService = new StripeService();
