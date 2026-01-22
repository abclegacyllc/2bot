/**
 * Stripe Webhook Handler
 *
 * Handles incoming webhook events from Stripe.
 * Updates subscription status on payment events.
 *
 * @module server/routes/stripe-webhook
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { OrgPlanType } from '@/shared/constants/org-plans';
import type { PlanType } from '@/shared/constants/plans';
import { STRIPE_PRICES } from '@/shared/constants/plans';

const webhookLogger = logger.child({ module: 'stripe-webhook' });

/**
 * Map a plan string to OrgPlan enum value
 * Stripe metadata may contain PlanType or OrgPlanType strings
 */
function toOrgPlan(plan: string | undefined): OrgPlanType {
  // If it's already an org plan, return it
  if (plan?.startsWith('ORG_')) {
    return plan as OrgPlanType;
  }
  
  // Map user plans to corresponding org plans
  const mapping: Record<string, OrgPlanType> = {
    'FREE': 'ORG_STARTER',
    'STARTER': 'ORG_STARTER',
    'PRO': 'ORG_PRO',
    'BUSINESS': 'ORG_BUSINESS',
    'ENTERPRISE': 'ORG_ENTERPRISE',
  };
  
  return mapping[plan ?? ''] ?? 'ORG_STARTER';
}

// Initialize Stripe client conditionally
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const router = Router();

// ===========================================
// Webhook Endpoint
// ===========================================

/**
 * POST /api/webhooks/stripe
 * Handles Stripe webhook events
 * 
 * Note: This endpoint needs raw body for signature verification.
 * It should be mounted BEFORE express.json() middleware or with
 * express.raw() middleware specifically for this route.
 */
router.post(
  '/',
  async (req: Request, res: Response) => {
    // Guard: Check if Stripe is configured
    if (!stripe) {
      webhookLogger.warn('Stripe webhook received but Stripe is not configured');
      return res.status(503).json({ error: 'Stripe is not configured' });
    }

    const sig = req.headers['stripe-signature'] as string;

    if (!sig) {
      webhookLogger.warn('Missing stripe-signature header');
      return res.status(400).json({ error: 'Missing signature' });
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      webhookLogger.warn('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(503).json({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      const error = err as Error;
      webhookLogger.error({ err: error.message }, 'Webhook signature verification failed');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    webhookLogger.info({ type: event.type, id: event.id }, 'Received Stripe webhook event');

    try {
      await handleStripeEvent(event);
      return res.json({ received: true });
    } catch (err) {
      const error = err as Error;
      webhookLogger.error({ err: error.message, eventType: event.type }, 'Webhook handler error');
      return res.status(500).json({ error: 'Webhook handler error' });
    }
  }
);

// ===========================================
// Event Handlers
// ===========================================

/**
 * Main event router
 */
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }

    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCreated(subscription);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdated(subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentSucceeded(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }

    default:
      webhookLogger.debug({ type: event.type }, 'Unhandled event type');
  }
}

/**
 * Handle checkout.session.completed
 * Called when a customer completes the checkout flow
 */
async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  webhookLogger.info({ sessionId: session.id }, 'Processing checkout completion');

  const { userId, organizationId, plan } = session.metadata || {};

  if (!session.subscription) {
    webhookLogger.warn({ sessionId: session.id }, 'No subscription in checkout session');
    return;
  }

  // Get subscription details from Stripe
  // Note: stripe is guaranteed to be non-null here since webhook handler guards it
  const stripeSubscription = await stripe!.subscriptions.retrieve(
    session.subscription as string
  );

  const priceId = stripeSubscription.items.data[0]?.price.id ?? null;
  
  // Calculate period dates from billing_cycle_anchor and subscription items
  const billingAnchor = stripeSubscription.billing_cycle_anchor;
  const startDate = stripeSubscription.start_date;
  
  const updateData = {
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: priceId,
    stripeStatus: stripeSubscription.status,
    plan: (plan as PlanType) || 'FREE',
    currentPeriodStart: startDate ? new Date(startDate * 1000) : null,
    currentPeriodEnd: billingAnchor ? new Date(billingAnchor * 1000) : null,
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
  };

  if (organizationId) {
    // Update org subscription + org.plan
    // Map PlanType to OrgPlan for organizations
    const orgPlan = toOrgPlan(plan);
    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { organizationId },
        update: updateData,
        create: {
          organizationId,
          ...updateData,
        },
      }),
      prisma.organization.update({
        where: { id: organizationId },
        data: { plan: orgPlan },
      }),
    ]);
    webhookLogger.info({ organizationId, plan: orgPlan }, 'Updated organization subscription');
  } else if (userId) {
    // Update user subscription + user.plan
    await prisma.$transaction([
      prisma.subscription.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          ...updateData,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { plan: plan as PlanType },
      }),
    ]);
    webhookLogger.info({ userId, plan }, 'Updated user subscription');
  }
}

/**
 * Handle customer.subscription.created
 * Called when a new subscription is created
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
  webhookLogger.info(
    { subscriptionId: subscription.id },
    'Processing subscription created'
  );
  // Most creation logic is handled in checkout.session.completed
  // This is a backup handler
}

/**
 * Handle customer.subscription.updated
 * Called when a subscription is updated (upgrade, downgrade, payment method change)
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  webhookLogger.info(
    { subscriptionId: subscription.id, status: subscription.status },
    'Processing subscription update'
  );

  const dbSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!dbSubscription) {
    webhookLogger.warn(
      { subscriptionId: subscription.id },
      'Subscription not found in database'
    );
    return;
  }

  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const plan = priceId 
    ? (Object.entries(STRIPE_PRICES).find(
        ([, id]) => id === priceId
      )?.[0] as PlanType ?? 'FREE')
    : 'FREE';

  // Calculate period dates
  const billingAnchor = subscription.billing_cycle_anchor;
  const startDate = subscription.start_date;

  // Update subscription record
  await prisma.subscription.update({
    where: { id: dbSubscription.id },
    data: {
      stripeStatus: subscription.status,
      plan,
      currentPeriodStart: startDate ? new Date(startDate * 1000) : null,
      currentPeriodEnd: billingAnchor ? new Date(billingAnchor * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Also update user/org plan field
  if (dbSubscription.organizationId) {
    const orgPlan = toOrgPlan(plan);
    await prisma.organization.update({
      where: { id: dbSubscription.organizationId },
      data: { plan: orgPlan },
    });
    webhookLogger.info(
      { organizationId: dbSubscription.organizationId, plan: orgPlan },
      'Updated organization plan'
    );
  } else if (dbSubscription.userId) {
    await prisma.user.update({
      where: { id: dbSubscription.userId },
      data: { plan },
    });
    webhookLogger.info(
      { userId: dbSubscription.userId, plan },
      'Updated user plan'
    );
  }
}

/**
 * Handle customer.subscription.deleted
 * Called when a subscription is canceled/deleted
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  webhookLogger.info(
    { subscriptionId: subscription.id },
    'Processing subscription deletion'
  );

  const dbSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!dbSubscription) {
    webhookLogger.warn(
      { subscriptionId: subscription.id },
      'Subscription not found in database'
    );
    return;
  }

  // Reset to FREE plan
  await prisma.subscription.update({
    where: { id: dbSubscription.id },
    data: {
      stripeStatus: 'canceled',
      plan: 'FREE',
      stripeSubscriptionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
    },
  });

  // Reset user/org plan
  if (dbSubscription.organizationId) {
    await prisma.organization.update({
      where: { id: dbSubscription.organizationId },
      data: { plan: 'ORG_STARTER' },
    });
    webhookLogger.info(
      { organizationId: dbSubscription.organizationId },
      'Reset organization to ORG_STARTER plan'
    );
  } else if (dbSubscription.userId) {
    await prisma.user.update({
      where: { id: dbSubscription.userId },
      data: { plan: 'FREE' },
    });
    webhookLogger.info(
      { userId: dbSubscription.userId },
      'Reset user to FREE plan'
    );
  }
}

/**
 * Handle invoice.payment_succeeded
 * Called when a payment is successful
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  webhookLogger.info(
    { invoiceId: invoice.id, amount: invoice.amount_paid },
    'Payment succeeded'
  );
  // Payment success is typically handled by subscription events
  // This can be used for additional logging or notifications
}

/**
 * Handle invoice.payment_failed
 * Called when a payment fails
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  webhookLogger.warn(
    { invoiceId: invoice.id, customerId: invoice.customer },
    'Payment failed'
  );

  // Find the subscription from the invoice parent
  // In Stripe SDK v20+, subscription is accessed via parent.subscription_details
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === 'string' 
    ? subscriptionRef 
    : subscriptionRef?.id;
    
  if (subscriptionId) {
    const dbSubscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: {
        user: { select: { email: true } },
        organization: { 
          select: { 
            name: true,
            memberships: {
              where: { role: 'ORG_OWNER' },
              include: { user: { select: { email: true } } },
            },
          },
        },
      },
    });

    if (dbSubscription) {
      // Update status to past_due
      await prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: { stripeStatus: 'past_due' },
      });

      // TODO: Send email notification about failed payment
      const email = dbSubscription.user?.email ||
        dbSubscription.organization?.memberships[0]?.user.email;
      
      if (email) {
        webhookLogger.info(
          { email },
          'Should send payment failed notification email'
        );
      }
    }
  }
}

export default router;