# Phase 5: Billing System

> **Goal:** Implement Stripe billing with subscriptions for users and organizations
> **Estimated Sessions:** 6-8
> **Prerequisites:** Phase 4 complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Billing Setup** ||||
| 5.1.1 | Create Subscription model | ✅ | User + Org support |
| 5.1.2 | Create billing types + constants | ✅ | Stripe price IDs |
| 5.1.3 | Create Stripe service | ✅ | Conditional init for safety |
| 5.1.4 | Create Stripe webhook handler | ✅ | With null guard |
| **Billing Endpoints** ||||
| 5.2.1 | Create checkout endpoint | ✅ | Backend + Next.js proxy |
| 5.2.2 | Create billing portal endpoint | ✅ | Backend + Next.js proxy |
| 5.2.3 | Create subscription status endpoint | ✅ | Backend + Next.js proxy |
| **Billing UI** ||||
| 5.3.1 | Create billing settings page | ✅ | SWR + Alert component |
| 5.3.2 | Create plan selection UI | ✅ | Plan cards + upgrade flow |
| 5.3.3 | Create subscription status component | ✅ | Badge + alerts |
| **Workspace Limits (Optional)** ||||
| 5.4.1 | Create resource limits by plan | ✅ | plan-limits.ts + error handling |
| 5.4.2 | Create limit check middleware | ✅ | Gateway + Plugin services |

---

## 📝 Detailed Tasks

---

## 💳 Billing Strategy

### Billing Model: **Context-Based Subscription**

```
┌─────────────────────────────────────────────────────────────┐
│                    PERSONAL CONTEXT                         │
│  User → User.subscription → Personal limits                 │
│  Billing page shows: User's plan                            │
│  Upgrade goes to: User's Stripe customer                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ORGANIZATION CONTEXT                     │
│  Organization → Organization.subscription → Shared limits   │
│  Billing page shows: Org's plan (ADMIN+ only)               │
│  Upgrade goes to: Org's Stripe customer                     │
│                                                             │
│  User.plan is IGNORED when in org context                   │
└─────────────────────────────────────────────────────────────┘
```

### Plan Resolution (Already in Phase 4)

```typescript
// Token already contains effective plan from activeContext
interface TokenPayload {
  activeContext: {
    type: 'personal' | 'organization';
    plan: PlanType;  // ← Already resolved!
  };
}

// ServiceContext.effectivePlan is the right plan
// No additional logic needed in billing service
```

---

### Task 5.1.1: Create Subscription Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Phase 4 complete

#### Schema:
```prisma
model Subscription {
  id                   String    @id @default(cuid())
  
  // Owner: either user OR organization (mutually exclusive)
  userId               String?   @unique @map("user_id")
  organizationId       String?   @unique @map("organization_id")
  
  // Stripe data
  stripeCustomerId     String?   @unique @map("stripe_customer_id")
  stripeSubscriptionId String?   @unique @map("stripe_subscription_id")
  stripePriceId        String?   @map("stripe_price_id")
  stripeStatus         String?   @map("stripe_status") // active, canceled, past_due, etc.
  
  // Plan info (denormalized for quick access)
  plan                 PlanType  @default(FREE)
  
  // Billing period
  currentPeriodStart   DateTime? @map("current_period_start")
  currentPeriodEnd     DateTime? @map("current_period_end")
  cancelAtPeriodEnd    Boolean   @default(false) @map("cancel_at_period_end")
  
  // Timestamps
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")
  
  // Relations
  user                 User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization         Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  @@index([stripeSubscriptionId])
  @@index([stripeStatus])
  @@map("subscriptions")
}
```

#### Update User + Organization Models:
```prisma
model User {
  // Add relation
  subscription    Subscription?
}

model Organization {
  // Add relation
  subscription    Subscription?
}
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Subscription table exists
- [ ] Supports both user and organization subscriptions
- [ ] Only one subscription per user/org

---

### Task 5.1.2: Create Billing Types + Constants

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 5.1.1 complete

#### Deliverables:
- [ ] src/modules/billing/billing.types.ts
- [ ] Enhance src/shared/constants/plans.ts

#### Types:
```typescript
// src/modules/billing/billing.types.ts

export interface SubscriptionInfo {
  id: string;
  plan: PlanType;
  status: StripeStatus | 'none';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
}

export interface CheckoutRequest {
  plan: PlanType;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  url: string;
}

export interface PortalResponse {
  url: string;
}

export type StripeStatus = 
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'unpaid';
```

#### Constants:
```typescript
// Enhance existing plans.ts

export const STRIPE_PRICES: Record<PlanType, string | null> = {
  FREE: null,
  STARTER: process.env.STRIPE_PRICE_STARTER!,
  PRO: process.env.STRIPE_PRICE_PRO!,
  BUSINESS: process.env.STRIPE_PRICE_BUSINESS!,
  ENTERPRISE: null, // Custom pricing
};

export const PLAN_PRICES: Record<PlanType, number | null> = {
  FREE: 0,
  STARTER: 9,
  PRO: 29,
  BUSINESS: 79,
  ENTERPRISE: null, // Custom
};

export function getPriceId(plan: PlanType): string | null {
  return STRIPE_PRICES[plan];
}

export function canUpgradeTo(currentPlan: PlanType, targetPlan: PlanType): boolean {
  const order: PlanType[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];
  return order.indexOf(targetPlan) > order.indexOf(currentPlan);
}
```

#### Done Criteria:
- [ ] Types defined
- [ ] Stripe price IDs configured
- [ ] Plan pricing defined
- [ ] Upgrade logic implemented

---

### Task 5.1.3: Create Stripe Service

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 5.1.2 complete

#### Deliverables:
- [ ] src/modules/billing/stripe.service.ts

#### Methods:
```typescript
import Stripe from 'stripe';
import { ServiceContext } from '@/shared/types/context';
import { PlanType, STRIPE_PRICES, getPlanLimits } from '@/shared/constants/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

class StripeService {
  /**
   * Get or create Stripe customer for current context
   * Uses org's customer if in org context, user's customer otherwise
   */
  async getOrCreateCustomer(ctx: ServiceContext): Promise<string> {
    if (ctx.isOrgContext()) {
      // Org context: use org's Stripe customer
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        include: { subscription: true },
      });
      
      if (org?.subscription?.stripeCustomerId) {
        return org.subscription.stripeCustomerId;
      }
      
      // Create new customer for org
      const customer = await stripe.customers.create({
        metadata: {
          organizationId: ctx.organizationId!,
          type: 'organization',
        },
      });
      
      // Save to subscription (create if not exists)
      await prisma.subscription.upsert({
        where: { organizationId: ctx.organizationId },
        create: {
          organizationId: ctx.organizationId,
          stripeCustomerId: customer.id,
        },
        update: {
          stripeCustomerId: customer.id,
        },
      });
      
      return customer.id;
    } else {
      // Personal context: use user's Stripe customer
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        include: { subscription: true },
      });
      
      if (user?.subscription?.stripeCustomerId) {
        return user.subscription.stripeCustomerId;
      }
      
      const customer = await stripe.customers.create({
        email: user!.email,
        metadata: {
          userId: ctx.userId,
          type: 'user',
        },
      });
      
      await prisma.subscription.upsert({
        where: { userId: ctx.userId },
        create: {
          userId: ctx.userId,
          stripeCustomerId: customer.id,
        },
        update: {
          stripeCustomerId: customer.id,
        },
      });
      
      return customer.id;
    }
  }

  /**
   * Create checkout session for plan upgrade
   */
  async createCheckoutSession(
    ctx: ServiceContext,
    plan: PlanType,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const priceId = STRIPE_PRICES[plan];
    if (!priceId) {
      throw new Error(`No price configured for plan: ${plan}`);
    }
    
    const customerId = await this.getOrCreateCustomer(ctx);
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: ctx.userId,
        organizationId: ctx.organizationId ?? '',
        contextType: ctx.contextType,
        plan,
      },
    });
    
    return session.url!;
  }

  /**
   * Create billing portal session
   */
  async createPortalSession(
    ctx: ServiceContext,
    returnUrl: string
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(ctx);
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    return session.url;
  }

  /**
   * Get current subscription info
   */
  async getSubscriptionInfo(ctx: ServiceContext): Promise<SubscriptionInfo> {
    const subscription = ctx.isOrgContext()
      ? await prisma.subscription.findUnique({
          where: { organizationId: ctx.organizationId },
        })
      : await prisma.subscription.findUnique({
          where: { userId: ctx.userId },
        });
    
    return {
      id: subscription?.id ?? '',
      plan: subscription?.plan ?? 'FREE',
      status: (subscription?.stripeStatus as StripeStatus) ?? 'none',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? undefined,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      limits: getPlanLimits(subscription?.plan ?? 'FREE'),
    };
  }

  /**
   * Handle Stripe webhook event
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    // Implementation in Task 5.1.4
  }
}

export const stripeService = new StripeService();
```

#### Done Criteria:
- [ ] Stripe SDK configured
- [ ] Customer creation works (user + org)
- [ ] Checkout session creation works
- [ ] Portal session creation works
- [ ] Subscription info retrieval works

---

### Task 5.1.4: Create Stripe Webhook Handler

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 5.1.3 complete

#### Deliverables:
- [ ] POST /api/webhooks/stripe
- [ ] Handle subscription events

#### Implementation:
```typescript
// src/server/routes/webhook.routes.ts
import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Raw body parser for Stripe signature verification
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    
    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return res.status(400).send('Webhook Error');
    }
    
    try {
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error('Webhook handler error:', err);
      res.status(500).send('Webhook handler error');
    }
  }
);

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
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
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
    }
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const { userId, organizationId, plan } = session.metadata!;
  
  // Get subscription details
  const stripeSubscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );
  
  const updateData = {
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: stripeSubscription.items.data[0].price.id,
    stripeStatus: stripeSubscription.status,
    plan: plan as PlanType,
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
  };
  
  if (organizationId) {
    // Update org subscription + org.plan
    await prisma.$transaction([
      prisma.subscription.update({
        where: { organizationId },
        data: updateData,
      }),
      prisma.organization.update({
        where: { id: organizationId },
        data: { plan: plan as PlanType },
      }),
    ]);
  } else {
    // Update user subscription + user.plan
    await prisma.$transaction([
      prisma.subscription.update({
        where: { userId },
        data: updateData,
      }),
      prisma.user.update({
        where: { id: userId },
        data: { plan: plan as PlanType },
      }),
    ]);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const dbSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  
  if (!dbSubscription) return;
  
  // Determine plan from price
  const priceId = subscription.items.data[0].price.id;
  const plan = Object.entries(STRIPE_PRICES).find(
    ([_, id]) => id === priceId
  )?.[0] as PlanType ?? 'FREE';
  
  await prisma.subscription.update({
    where: { id: dbSubscription.id },
    data: {
      stripeStatus: subscription.status,
      plan,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
  
  // Also update user/org plan field
  if (dbSubscription.organizationId) {
    await prisma.organization.update({
      where: { id: dbSubscription.organizationId },
      data: { plan },
    });
  } else if (dbSubscription.userId) {
    await prisma.user.update({
      where: { id: dbSubscription.userId },
      data: { plan },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const dbSubscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  
  if (!dbSubscription) return;
  
  // Reset to FREE plan
  await prisma.subscription.update({
    where: { id: dbSubscription.id },
    data: {
      stripeStatus: 'canceled',
      plan: 'FREE',
      stripeSubscriptionId: null,
    },
  });
  
  if (dbSubscription.organizationId) {
    await prisma.organization.update({
      where: { id: dbSubscription.organizationId },
      data: { plan: 'FREE' },
    });
  } else if (dbSubscription.userId) {
    await prisma.user.update({
      where: { id: dbSubscription.userId },
      data: { plan: 'FREE' },
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Could send email notification
  console.log('Payment failed for invoice:', invoice.id);
}

export default router;
```

#### Done Criteria:
- [ ] Webhook signature verified
- [ ] checkout.session.completed handled
- [ ] subscription.updated handled
- [ ] subscription.deleted handled
- [ ] User/org plan updated on subscription changes

---

### Task 5.2.1: Create Checkout Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 5.1.4 complete

#### Deliverables:
- [ ] POST /api/billing/checkout

#### Implementation:
```typescript
// src/server/routes/billing.routes.ts

router.post('/checkout', requireAuth, async (req, res) => {
  const ctx = createServiceContext(req.user, req);
  const { plan } = checkoutSchema.parse(req.body);
  
  // Validate can upgrade
  if (!canUpgradeTo(ctx.effectivePlan, plan)) {
    throw new BadRequestError('Cannot upgrade to this plan');
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const successUrl = `${baseUrl}/settings/billing?success=true`;
  const cancelUrl = `${baseUrl}/settings/billing?canceled=true`;
  
  const url = await stripeService.createCheckoutSession(
    ctx,
    plan,
    successUrl,
    cancelUrl
  );
  
  res.json({ url });
});
```

#### Done Criteria:
- [ ] Creates checkout session
- [ ] Returns checkout URL
- [ ] Validates upgrade path
- [ ] Uses correct context (user/org)

---

### Task 5.2.2: Create Billing Portal Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 5.2.1 complete

#### Deliverables:
- [ ] POST /api/billing/portal

#### Implementation:
```typescript
router.post('/portal', requireAuth, async (req, res) => {
  const ctx = createServiceContext(req.user, req);
  
  // Check if user has permission (for org billing)
  if (ctx.isOrgContext()) {
    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(ctx.orgRole!)) {
      throw new ForbiddenError('Only admins can manage billing');
    }
  }
  
  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`;
  const url = await stripeService.createPortalSession(ctx, returnUrl);
  
  res.json({ url });
});
```

#### Done Criteria:
- [ ] Returns portal URL
- [ ] Checks org permissions
- [ ] User can manage subscription

---

### Task 5.2.3: Create Subscription Status Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 5.2.2 complete

#### Deliverables:
- [ ] GET /api/billing/subscription

#### Implementation:
```typescript
router.get('/subscription', requireAuth, async (req, res) => {
  const ctx = createServiceContext(req.user, req);
  
  const info = await stripeService.getSubscriptionInfo(ctx);
  
  res.json(info);
});
```

#### Response:
```typescript
{
  id: "sub_123",
  plan: "PRO",
  status: "active",
  currentPeriodEnd: "2026-02-14T00:00:00Z",
  cancelAtPeriodEnd: false,
  limits: {
    maxGateways: 10,
    maxPlugins: 25,
    maxExecutionsPerDay: 10000,
    ramMb: 1024,
    // ...
  }
}
```

#### Done Criteria:
- [ ] Returns current subscription
- [ ] Includes plan limits
- [ ] Works for free users (plan: FREE, status: none)
- [ ] Uses correct context (user/org)

---

### Task 5.3.1: Create Billing Settings Page

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 5.2.3 complete

#### Deliverables:
- [ ] src/app/(dashboard)/settings/billing/page.tsx

#### Implementation:
```tsx
'use client';

import { useAuth } from '@/lib/auth-context';
import useSWR from 'swr';

export default function BillingPage() {
  const { context } = useAuth();
  const { data: subscription, isLoading } = useSWR('/api/billing/subscription');
  
  // For org context, only ADMIN+ can see billing
  if (context.type === 'organization') {
    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(context.orgRole!)) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Contact your organization admin for billing information.
          </p>
        </div>
      );
    }
  }
  
  if (isLoading) return <BillingSkeleton />;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">
          {context.type === 'organization' 
            ? `Manage billing for ${context.organizationName}`
            : 'Manage your personal subscription'
          }
        </p>
      </div>
      
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{subscription.plan}</p>
              <p className="text-sm text-muted-foreground">
                {subscription.status === 'active' && subscription.currentPeriodEnd && (
                  <>Renews on {formatDate(subscription.currentPeriodEnd)}</>
                )}
                {subscription.status === 'none' && 'Free forever'}
                {subscription.cancelAtPeriodEnd && (
                  <span className="text-yellow-500">
                    Cancels on {formatDate(subscription.currentPeriodEnd)}
                  </span>
                )}
              </p>
            </div>
            
            {subscription.plan === 'FREE' ? (
              <Button onClick={() => router.push('/settings/billing/upgrade')}>
                Upgrade
              </Button>
            ) : (
              <Button variant="outline" onClick={handleManageBilling}>
                Manage Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Plan Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <LimitItem 
              label="Gateways" 
              current={usage.gateways} 
              max={subscription.limits.maxGateways} 
            />
            <LimitItem 
              label="Plugins" 
              current={usage.plugins} 
              max={subscription.limits.maxPlugins} 
            />
            <LimitItem 
              label="Daily Executions" 
              current={usage.executionsToday} 
              max={subscription.limits.maxExecutionsPerDay} 
            />
            <LimitItem 
              label="RAM" 
              current={usage.ramUsedMb} 
              max={subscription.limits.ramMb} 
              unit="MB"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LimitItem({ label, current, max, unit = '' }) {
  const percentage = (current / max) * 100;
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>{current} / {max} {unit}</span>
      </div>
      <Progress value={percentage} />
    </div>
  );
}
```

#### Done Criteria:
- [ ] Shows current plan
- [ ] Shows subscription status
- [ ] Shows plan limits with usage
- [ ] Upgrade button for free users
- [ ] Manage button for paid users
- [ ] Respects org context

---

### Task 5.3.2: Create Plan Selection UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 5.3.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/settings/billing/upgrade/page.tsx
- [ ] src/components/billing/plan-card.tsx

#### Implementation:
```tsx
const PLANS = [
  {
    id: 'STARTER',
    name: 'Starter',
    price: 9,
    description: 'For solo creators',
    features: [
      '3 gateways',
      '10 plugins',
      '1,000 executions/day',
      '512MB RAM',
      'Email support',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 29,
    description: 'For power users',
    popular: true,
    features: [
      '10 gateways',
      'Unlimited plugins',
      '10,000 executions/day',
      '1GB RAM',
      'Priority support',
    ],
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    price: 79,
    description: 'For small teams',
    features: [
      '25 gateways',
      'Unlimited plugins',
      '50,000 executions/day',
      '2GB RAM',
      'Dedicated support',
      'Team features',
    ],
  },
];

export default function UpgradePage() {
  const { context } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleUpgrade = async (plan: string) => {
    setLoading(true);
    const { url } = await fetch('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }).then(r => r.json());
    
    window.location.href = url;
  };
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-muted-foreground">
          {context.type === 'organization'
            ? `Upgrade ${context.organizationName}`
            : 'Upgrade your personal workspace'
          }
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-6">
        {PLANS.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={context.plan === plan.id}
            onSelect={() => handleUpgrade(plan.id)}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan, current, onSelect, loading }) {
  return (
    <Card className={cn(
      plan.popular && 'border-primary shadow-lg',
      current && 'bg-muted'
    )}>
      {plan.popular && (
        <div className="bg-primary text-primary-foreground text-center py-1 text-sm">
          Most Popular
        </div>
      )}
      
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold">${plan.price}</span>
          <span className="text-muted-foreground">/month</span>
        </div>
      </CardHeader>
      
      <CardContent>
        <ul className="space-y-2">
          {plan.features.map(feature => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      
      <CardFooter>
        <Button 
          className="w-full"
          variant={current ? 'outline' : 'default'}
          disabled={current || loading}
          onClick={onSelect}
        >
          {current ? 'Current Plan' : 'Select Plan'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

#### Done Criteria:
- [ ] Shows all plans with prices
- [ ] Highlights current plan
- [ ] Popular badge on PRO
- [ ] Select triggers checkout
- [ ] Loading state while redirecting

---

### Task 5.3.3: Create Subscription Status Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 5.3.2 complete

#### Deliverables:
- [ ] src/components/billing/subscription-badge.tsx
- [ ] Use in dashboard header/sidebar

#### Implementation:
```tsx
'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';

export function SubscriptionBadge() {
  const { context } = useAuth();
  const { data: subscription } = useSWR('/api/billing/subscription');
  
  if (!subscription) return null;
  
  const statusColors: Record<string, string> = {
    active: 'bg-green-500',
    past_due: 'bg-yellow-500',
    canceled: 'bg-red-500',
    none: 'bg-gray-500',
  };
  
  return (
    <Badge className={cn('text-white', statusColors[subscription.status])}>
      {subscription.plan}
    </Badge>
  );
}

export function SubscriptionAlert() {
  const { data: subscription } = useSWR('/api/billing/subscription');
  
  if (!subscription) return null;
  
  if (subscription.status === 'past_due') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Payment Failed</AlertTitle>
        <AlertDescription>
          Please update your payment method to continue using the service.
          <Button variant="link" onClick={handleManageBilling}>
            Update Payment
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  
  if (subscription.cancelAtPeriodEnd) {
    return (
      <Alert variant="warning">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Subscription Ending</AlertTitle>
        <AlertDescription>
          Your {subscription.plan} subscription will end on{' '}
          {formatDate(subscription.currentPeriodEnd)}.
          <Button variant="link" onClick={handleManageBilling}>
            Reactivate
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  
  return null;
}
```

#### Done Criteria:
- [ ] Shows plan badge
- [ ] Shows status alerts (past_due, canceling)
- [ ] Links to billing portal

---

### Task 5.4.1: Create Resource Limits by Plan (Optional)

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 5.3.3 complete

#### Deliverables:
- [ ] src/lib/plan-limits.ts
- [ ] Limit checking utilities

#### Implementation:
```typescript
// src/lib/plan-limits.ts

import { ServiceContext } from '@/shared/types/context';
import { getPlanLimits } from '@/shared/constants/plans';
import { prisma } from './prisma';

export async function checkGatewayLimit(ctx: ServiceContext): Promise<{
  allowed: boolean;
  current: number;
  max: number;
}> {
  const limits = getPlanLimits(ctx.effectivePlan);
  
  const filter = ctx.isOrgContext()
    ? { organizationId: ctx.organizationId }
    : { userId: ctx.userId, organizationId: null };
  
  const count = await prisma.gateway.count({ where: filter });
  
  return {
    allowed: count < limits.maxGateways,
    current: count,
    max: limits.maxGateways,
  };
}

export async function checkPluginLimit(ctx: ServiceContext): Promise<{
  allowed: boolean;
  current: number;
  max: number;
}> {
  const limits = getPlanLimits(ctx.effectivePlan);
  
  const filter = ctx.isOrgContext()
    ? { organizationId: ctx.organizationId }
    : { userId: ctx.userId, organizationId: null };
  
  const count = await prisma.userPlugin.count({ where: filter });
  
  return {
    allowed: count < limits.maxPlugins,
    current: count,
    max: limits.maxPlugins,
  };
}

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public resource: string,
    public current: number,
    public max: number
  ) {
    super(message);
    this.name = 'PlanLimitError';
  }
}
```

#### Done Criteria:
- [ ] Gateway limit check function
- [ ] Plugin limit check function
- [ ] Returns current/max for UI

---

### Task 5.4.2: Create Limit Check Middleware (Optional)

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 5.4.1 complete

#### Deliverables:
- [ ] Apply limit checks in gateway/plugin creation

#### Implementation:
```typescript
// In gateway.service.ts
async create(ctx: ServiceContext, data: CreateGatewayRequest): Promise<Gateway> {
  // Check plan limit
  const limit = await checkGatewayLimit(ctx);
  if (!limit.allowed) {
    throw new PlanLimitError(
      `Gateway limit reached (${limit.current}/${limit.max}). Upgrade your plan.`,
      'gateways',
      limit.current,
      limit.max
    );
  }
  
  // ... create gateway
}

// In plugin.service.ts
async install(ctx: ServiceContext, pluginId: string): Promise<UserPlugin> {
  const limit = await checkPluginLimit(ctx);
  if (!limit.allowed) {
    throw new PlanLimitError(
      `Plugin limit reached (${limit.current}/${limit.max}). Upgrade your plan.`,
      'plugins',
      limit.current,
      limit.max
    );
  }
  
  // ... install plugin
}
```

#### API Error Response:
```typescript
// Error handler returns structured error
{
  error: 'PlanLimitError',
  message: 'Gateway limit reached (3/3). Upgrade your plan.',
  resource: 'gateways',
  current: 3,
  max: 3,
  upgradeUrl: '/settings/billing/upgrade'
}
```

#### Done Criteria:
- [ ] Gateway creation checks limit
- [ ] Plugin installation checks limit
- [ ] Error includes upgrade info
- [ ] Frontend shows upgrade prompt

---

## ✅ Phase 5 Completion Checklist

### Billing Setup
- [ ] Subscription model created
- [ ] Stripe service working
- [ ] Webhook handler working
- [ ] Plan sync on subscription changes

### Billing Endpoints
- [ ] Checkout endpoint working
- [ ] Portal endpoint working
- [ ] Subscription status endpoint working

### Billing UI
- [ ] Billing settings page complete
- [ ] Plan selection UI complete
- [ ] Subscription badge/alerts working

### Limits (Optional)
- [ ] Gateway limit enforced
- [ ] Plugin limit enforced
- [ ] Clear upgrade prompts

### Integration
- [ ] Works for personal context
- [ ] Works for organization context
- [ ] Plan syncs between Stripe and DB
- [ ] Webhooks update plan correctly

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Billing Setup | 4 | 115 min |
| Billing Endpoints | 3 | 50 min |
| Billing UI | 3 | 85 min |
| Limits (Optional) | 2 | 45 min |
| **Total** | **12** | **~5 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 6 (Launch)
