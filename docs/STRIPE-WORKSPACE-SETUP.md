# Stripe Product Setup: Workspace Add-ons

This document provides instructions for setting up Stripe products for workspace add-ons and organization pool boosters.

## Overview

2Bot uses two types of workspace products:

1. **Individual Workspace Add-ons** - For personal accounts (MICRO, SMALL, MEDIUM, LARGE, XLARGE)
2. **Organization Pool Boosters** - For organization accounts (BOOSTER_SMALL, BOOSTER_MEDIUM, BOOSTER_LARGE)

All products should be set up as **recurring subscriptions** with both monthly and yearly pricing.

---

## Individual Workspace Add-ons

These add-ons allow individual users to:
- Unlock unlimited executions (FREE/STARTER users)
- Stack additional compute resources on top of included workspace (PRO+ users)

### Product Setup

Create the following products in Stripe Dashboard → Products:

| Product ID (Suggested) | Display Name | Description | Monthly Price | Yearly Price |
|------------------------|--------------|-------------|---------------|--------------|
| `workspace_addon_micro` | Workspace MICRO | 1GB RAM, 0.5 CPU, 10GB Storage | $5.00 | $50.00 |
| `workspace_addon_small` | Workspace SMALL | 2GB RAM, 1 CPU, 20GB Storage | $9.00 | $90.00 |
| `workspace_addon_medium` | Workspace MEDIUM | 4GB RAM, 2 CPU, 40GB Storage | $15.00 | $150.00 |
| `workspace_addon_large` | Workspace LARGE | 8GB RAM, 4 CPU, 80GB Storage | $29.00 | $290.00 |
| `workspace_addon_xlarge` | Workspace XLARGE | 16GB RAM, 8 CPU, 150GB Storage | $49.00 | $490.00 |

### Price IDs

After creating products, note the Price IDs and add them to your environment configuration or constants:

```typescript
// src/shared/constants/stripe-products.ts

export const WORKSPACE_ADDON_PRICE_IDS = {
  MICRO: {
    monthly: 'price_xxxxx', // Replace with actual Stripe Price ID
    yearly: 'price_xxxxx',
  },
  SMALL: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  MEDIUM: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  LARGE: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  XLARGE: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
} as const;
```

### Stripe Metadata

Add these metadata fields to each product for easy identification:

```json
{
  "product_type": "workspace_addon",
  "tier": "MICRO", // or SMALL, MEDIUM, LARGE, XLARGE
  "ram_mb": "1024",
  "cpu_cores": "0.5",
  "storage_mb": "10240"
}
```

---

## Organization Pool Boosters

These boosters allow organizations to expand their shared compute pool.
Formula: 2x RAM, 2x CPU, 3x Storage, 2x Cost compared to user add-ons.

**Note:** `ORG_FREE` plan cannot purchase boosters - must upgrade first.

### Product Setup

Create the following products:

| Product ID (Suggested) | Display Name | Description | Monthly Price | Yearly Price |
|------------------------|--------------|-------------|---------------|--------------|
| `org_pool_booster_micro` | Org Micro | +2GB RAM, +1 CPU, +30GB Storage | $10.00 | $100.00 |
| `org_pool_booster_small` | Org Small | +4GB RAM, +2 CPU, +60GB Storage | $18.00 | $180.00 |
| `org_pool_booster_medium` | Org Medium | +8GB RAM, +4 CPU, +120GB Storage | $30.00 | $300.00 |
| `org_pool_booster_large` | Org Large | +16GB RAM, +8 CPU, +240GB Storage | $58.00 | $580.00 |
| `org_pool_booster_xlarge` | Org XLarge | +32GB RAM, +16 CPU, +450GB Storage | $98.00 | $980.00 |

### Price IDs

```typescript
// src/shared/constants/stripe-products.ts

export const ORG_POOL_BOOSTER_PRICE_IDS = {
  ORG_MICRO: {
    monthly: 'price_xxxxx', // Replace with actual Stripe Price ID
    yearly: 'price_xxxxx',
  },
  ORG_SMALL: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  ORG_MEDIUM: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  ORG_LARGE: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
  ORG_XLARGE: {
    monthly: 'price_xxxxx',
    yearly: 'price_xxxxx',
  },
} as const;
```

### Stripe Metadata

```json
{
  "product_type": "org_pool_booster",
  "booster_tier": "ORG_MICRO", // or ORG_SMALL, ORG_MEDIUM, ORG_LARGE, ORG_XLARGE
  "ram_mb": "2048",
  "cpu_cores": "1",
  "storage_mb": "30720"
}
```

---

## Stripe Checkout Integration

### API Endpoint: /api/billing/workspace-addon

This endpoint handles individual workspace add-on purchases:

```typescript
// Pseudo-code for checkout session creation

import Stripe from 'stripe';
import { WORKSPACE_ADDON_PRICE_IDS } from '@/shared/constants/stripe-products';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createWorkspaceAddonCheckout(userId: string, tier: string, interval: 'month' | 'year') {
  const priceId = WORKSPACE_ADDON_PRICE_IDS[tier][interval === 'month' ? 'monthly' : 'yearly'];
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId, // Get from user
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing/workspace?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing/workspace?canceled=true`,
    metadata: {
      user_id: userId,
      addon_tier: tier,
    },
  });

  return session.url;
}
```

### API Endpoint: /api/billing/org-workspace-booster

This endpoint handles organization pool booster purchases:

```typescript
// Pseudo-code for checkout session creation

import Stripe from 'stripe';
import { ORG_POOL_BOOSTER_PRICE_IDS } from '@/shared/constants/stripe-products';

async function createOrgBoosterCheckout(
  orgId: string, 
  packId: string, 
  interval: 'month' | 'year'
) {
  const priceId = ORG_POOL_BOOSTER_PRICE_IDS[packId][interval === 'month' ? 'monthly' : 'yearly'];
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: orgStripeCustomerId, // Get from organization
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/organization/billing/workspace?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/organization/billing/workspace?canceled=true`,
    metadata: {
      organization_id: orgId,
      booster_id: packId,
    },
  });

  return session.url;
}
```

---

## Webhook Handling

### Subscription Created/Updated

When a workspace add-on or booster subscription is created/updated:

```typescript
// Handle checkout.session.completed or customer.subscription.updated

async function handleWorkspaceSubscription(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata;
  
  if (metadata.addon_tier) {
    // Individual workspace add-on
    await prisma.userWorkspaceAddon.upsert({
      where: { 
        userId_tier: { 
          userId: metadata.user_id, 
          tier: metadata.addon_tier 
        }
      },
      update: { 
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      },
      create: {
        userId: metadata.user_id,
        tier: metadata.addon_tier,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      },
    });
  } else if (metadata.booster_id) {
    // Organization pool booster
    await prisma.orgPoolBooster.upsert({
      where: { 
        organizationId_boosterId: { 
          organizationId: metadata.organization_id, 
          boosterId: metadata.booster_id 
        }
      },
      update: { 
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      },
      create: {
        organizationId: metadata.organization_id,
        boosterId: metadata.booster_id,
        status: subscription.status,
        stripeSubscriptionId: subscription.id,
      },
    });
  }
}
```

### Subscription Canceled

```typescript
async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const metadata = subscription.metadata;
  
  if (metadata.addon_tier) {
    await prisma.userWorkspaceAddon.update({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: 'canceled' },
    });
  } else if (metadata.booster_id) {
    await prisma.orgPoolBooster.update({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: 'canceled' },
    });
  }
}
```

---

## Database Schema

Add these models to your Prisma schema if not already present:

```prisma
// Individual user workspace add-ons
model UserWorkspaceAddon {
  id                   String   @id @default(cuid())
  userId               String
  tier                 String   // MICRO, SMALL, MEDIUM, LARGE, XLARGE
  status               String   // active, canceled, past_due
  stripeSubscriptionId String?  @unique
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, tier])
  @@index([userId])
}

// Organization pool boosters
model OrgPoolBooster {
  id                   String       @id @default(cuid())
  organizationId       String
  boosterId            String       // BOOSTER_SMALL, BOOSTER_MEDIUM, BOOSTER_LARGE
  status               String       // active, canceled, past_due
  stripeSubscriptionId String?      @unique
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, boosterId])
  @@index([organizationId])
}
```

---

## Testing

### Test Mode Products

Create test mode products in Stripe with the same structure. Use test Price IDs during development.

### Test Card Numbers

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Webhook Testing

Use Stripe CLI to forward webhooks during local development:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

---

## Environment Variables

Ensure these are set:

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Pricing Reference

### Individual Workspace Add-ons (Synced with workspace-addons.ts)

| Tier | RAM | CPU | Storage | Monthly | Yearly (17% off) |
|------|-----|-----|---------|---------|------------------|
| MICRO | 1 GB | 0.5 | 10 GB | $5 | $50 |
| SMALL | 2 GB | 1 | 20 GB | $9 | $90 |
| MEDIUM | 4 GB | 2 | 40 GB | $15 | $150 |
| LARGE | 8 GB | 4 | 80 GB | $29 | $290 |
| XLARGE | 16 GB | 8 | 150 GB | $49 | $490 |

### Organization Pool Boosters (Synced with org-workspace-addons.ts)

Formula: 2x RAM, 2x CPU, 3x Storage, 2x Cost compared to user add-ons.

| Tier | RAM | CPU | Storage | Monthly | Yearly (17% off) |
|------|-----|-----|---------|---------|------------------|
| ORG_MICRO | +2 GB | +1 | +30 GB | $10 | $100 |
| ORG_SMALL | +4 GB | +2 | +60 GB | $18 | $180 |
| ORG_MEDIUM | +8 GB | +4 | +120 GB | $30 | $300 |
| ORG_LARGE | +16 GB | +8 | +240 GB | $58 | $580 |
| ORG_XLARGE | +32 GB | +16 | +450 GB | $98 | $980 |

### Organization Plans with Included Pools

| Plan | Pool Tier | RAM | CPU | Storage | Executions | Monthly |
|------|-----------|-----|-----|---------|------------|---------|
| ORG_FREE | NONE | - | - | - | 1,000/mo | $0 |
| ORG_STARTER | TEAM | 4 GB | 2 | 20 GB | Unlimited | $49 |
| ORG_GROWTH | GROWTH | 8 GB | 4 | 50 GB | Unlimited | $99 |
| ORG_PRO | PRO | 16 GB | 8 | 100 GB | Unlimited | $199 |
| ORG_BUSINESS | BUSINESS | 32 GB | 16 | 250 GB | Unlimited | $399 |
| ORG_ENTERPRISE | CUSTOM | Custom | Custom | Custom | Unlimited | Custom |

---

## Next Steps

1. [ ] Create products in Stripe Dashboard (Test Mode)
2. [ ] Copy Price IDs to environment/constants
3. [ ] Create `/api/billing/workspace-addon` endpoint
4. [ ] Create `/api/billing/org-workspace-booster` endpoint
5. [ ] Update webhook handler for new subscription types
6. [ ] Add Prisma models and run migration
7. [ ] Test checkout flow end-to-end
8. [ ] Create products in Stripe Dashboard (Live Mode)
9. [ ] Update production environment variables
