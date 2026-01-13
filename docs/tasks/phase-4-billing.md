# Phase 4: Billing & Workspace

> **Goal:** Implement Stripe billing and basic workspace container isolation
> **Estimated Sessions:** 10-12
> **Prerequisites:** Phase 3 complete

---

## 📋 Task Overview

| ID | Task | Status | Session |
|----|------|--------|---------|
| 4.1.1 | Create Subscription model | ⬜ | - |
| 4.1.2 | Create billing types + constants | ⬜ | - |
| 4.1.3 | Create Stripe service | ⬜ | - |
| 4.1.4 | Create Stripe webhook handler | ⬜ | - |
| 4.2.1 | Create checkout endpoint | ⬜ | - |
| 4.2.2 | Create billing portal endpoint | ⬜ | - |
| 4.2.3 | Create subscription status endpoint | ⬜ | - |
| 4.3.1 | Create billing settings page | ⬜ | - |
| 4.3.2 | Create plan selection UI | ⬜ | - |
| 4.3.3 | Create subscription status component | ⬜ | - |
| 4.4.1 | Create workspace Dockerfile | ⬜ | - |
| 4.4.2 | Create workspace orchestrator | ⬜ | - |
| 4.4.3 | Create workspace status endpoint | ⬜ | - |
| 4.4.4 | Create resource limits by plan | ⬜ | - |
| 4.5.1 | Create workspace status UI | ⬜ | - |

---

## 📝 Detailed Tasks

### Task 4.1.1: Create Subscription Model

**Session Type:** Database
**Estimated Time:** 20 minutes
**Prerequisites:** Phase 3 complete

#### Schema:
```prisma
model Subscription {
  id                  String    @id @default(cuid())
  userId              String    @unique
  
  // Stripe data
  stripeSubscriptionId String?  @unique
  stripePriceId       String?
  stripeStatus        String?   // active, canceled, past_due, etc.
  
  // Plan info
  plan                PlanType  @default(FREE)
  
  // Billing period
  currentPeriodStart  DateTime?
  currentPeriodEnd    DateTime?
  cancelAtPeriodEnd   Boolean   @default(false)
  
  // Timestamps
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  // Relations
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([stripeSubscriptionId])
  @@index([stripeStatus])
}

// Also add to User model:
// subscription Subscription?
```

#### Done Criteria:
- [ ] Migration applied
- [ ] Subscription table exists
- [ ] Relation to User working

---

### Task 4.1.2: Create Billing Types + Constants

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 4.1.1 complete

#### Deliverables:
- [ ] src/modules/billing/billing.types.ts
- [ ] Enhance src/shared/constants/plans.ts (from Phase 1.5)

#### Constants:
```typescript
// Enhance existing PLAN_LIMITS from Phase 1.5 with Stripe price IDs:
export const STRIPE_PRICES = {
  FREE: null,
  STARTER: process.env.STRIPE_PRICE_STARTER!,
  PRO: process.env.STRIPE_PRICE_PRO!,
  BUSINESS: process.env.STRIPE_PRICE_BUSINESS!,
  ENTERPRISE: null, // Custom pricing
} as const;

export const PLAN_PRICES = {
  FREE: 0,
  STARTER: 9,
  PRO: 29,
  BUSINESS: 79,
  ENTERPRISE: null, // Custom
} as const;

// Re-export from Phase 1.5
export { PLAN_LIMITS, getPlanLimits, canDoAction } from '@/shared/constants/plans';
```

#### Done Criteria:
- [ ] Stripe price IDs configured
- [ ] Plan definitions complete
- [ ] Integrates with Phase 1.5 plan constants
- [ ] Type-safe plan access

---

### Task 4.1.3: Create Stripe Service

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.1.2 complete

#### Deliverables:
- [ ] src/modules/billing/stripe.service.ts

#### Methods:
```typescript
class StripeService {
  // Customer management
  async createCustomer(user: User): Promise<string> // returns customerId
  async getCustomer(customerId: string): Promise<Stripe.Customer>
  
  // Checkout
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> // returns checkout URL
  
  // Portal
  async createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<string> // returns portal URL
  
  // Subscription
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription>
  async cancelSubscription(subscriptionId: string): Promise<void>
  
  // Webhook handling
  async handleWebhookEvent(event: Stripe.Event): Promise<void>
}
```

#### Done Criteria:
- [ ] Stripe SDK configured
- [ ] Can create customers
- [ ] Can create checkout sessions
- [ ] Can create portal sessions

---

### Task 4.1.4: Create Stripe Webhook Handler

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.1.3 complete

#### Deliverables:
- [ ] POST /api/webhooks/stripe
- [ ] Handle subscription events
- [ ] Update local database

#### Events to Handle:
```typescript
switch (event.type) {
  case 'checkout.session.completed':
    // Create/update subscription
    break
  case 'customer.subscription.updated':
    // Update subscription status
    break
  case 'customer.subscription.deleted':
    // Cancel subscription
    break
  case 'invoice.payment_failed':
    // Handle failed payment
    break
}
```

#### Done Criteria:
- [ ] Webhook signature verified
- [ ] Subscription created on checkout complete
- [ ] Status updated on subscription changes
- [ ] User plan updated in database

---

### Task 4.2.1: Create Checkout Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 4.1.4 complete

#### Deliverables:
- [ ] POST /api/billing/create-checkout

#### Request:
```typescript
{
  plan: 'PRO'
}
```

#### Response:
```typescript
{
  url: 'https://checkout.stripe.com/...'
}
```

#### Done Criteria:
- [ ] Creates Stripe customer if not exists
- [ ] Returns checkout URL
- [ ] Proper error handling

---

### Task 4.2.2: Create Billing Portal Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 4.2.1 complete

#### Deliverables:
- [ ] POST /api/billing/create-portal

#### Response:
```typescript
{
  url: 'https://billing.stripe.com/...'
}
```

#### Done Criteria:
- [ ] Returns portal URL
- [ ] User can manage subscription

---

### Task 4.2.3: Create Subscription Status Endpoint

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 4.2.2 complete

#### Deliverables:
- [ ] GET /api/billing/subscription

#### Response:
```typescript
{
  plan: 'PRO',
  status: 'active',
  currentPeriodEnd: '2026-02-12T00:00:00Z',
  cancelAtPeriodEnd: false,
  limits: { ... }
}
```

#### Done Criteria:
- [ ] Returns current subscription
- [ ] Includes plan limits
- [ ] Works for free users too

---

### Task 4.3.1: Create Billing Settings Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.2.3 complete

#### Deliverables:
- [ ] src/app/(dashboard)/settings/billing/page.tsx
- [ ] Current plan display
- [ ] Upgrade/manage buttons

#### Done Criteria:
- [ ] Shows current plan
- [ ] Shows usage vs limits
- [ ] Upgrade button for free users
- [ ] Manage button for paid users

---

### Task 4.3.2: Create Plan Selection UI

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.3.1 complete

#### Deliverables:
- [ ] src/components/billing/plan-selector.tsx
- [ ] Plan comparison cards
- [ ] Price display

#### Done Criteria:
- [ ] Shows Free vs Pro
- [ ] Highlights current plan
- [ ] Shows features/limits
- [ ] Select triggers checkout

---

### Task 4.3.3: Create Subscription Status Component

**Session Type:** Frontend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 4.3.2 complete

#### Deliverables:
- [ ] src/components/billing/subscription-status.tsx
- [ ] Status badge
- [ ] Next billing date
- [ ] Cancel warning if canceling

#### Done Criteria:
- [ ] Shows subscription status
- [ ] Shows renewal date
- [ ] Warning if canceling/past due

---

### Task 4.4.1: Create Workspace Dockerfile

**Session Type:** Infrastructure
**Estimated Time:** 30 minutes
**Prerequisites:** Task 4.1.2 complete

#### Deliverables:
- [ ] workspace-runtime/Dockerfile
- [ ] Base image with Node.js
- [ ] Gateway worker entry point
- [ ] Plugin runtime entry point

#### Dockerfile:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies for gateways
# Copy runtime code
# Setup PM2 for process management

ENTRYPOINT ["pm2-runtime", "start", "ecosystem.config.js"]
```

#### Done Criteria:
- [ ] Image builds successfully
- [ ] Can start with resource limits
- [ ] PM2 manages processes

---

### Task 4.4.2: Create Workspace Orchestrator

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 4.4.1 complete

#### Deliverables:
- [ ] src/modules/workspace/workspace.service.ts
- [ ] Docker container management
- [ ] Resource limit enforcement

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';
import { PLAN_LIMITS } from '@/shared/constants/plans';

class WorkspaceService {
  async startWorkspace(ctx: ServiceContext): Promise<WorkspaceInfo>
  async stopWorkspace(ctx: ServiceContext): Promise<void>
  async restartWorkspace(ctx: ServiceContext): Promise<void>
  async getWorkspaceStatus(ctx: ServiceContext): Promise<WorkspaceStatus>
  
  // Use ctx.userPlan to determine limits
  private getResourceLimits(ctx: ServiceContext): ResourceLimits {
    const planLimits = PLAN_LIMITS[ctx.userPlan];
    return {
      memory: `${planLimits.ramMb}m`,
      cpus: '0.5', // Adjust per plan
    };
  }
  
  private createContainer(ctx: ServiceContext, limits: ResourceLimits): Promise<string>
}
}

interface ResourceLimits {
  memoryMb: number
  cpuPercent: number
  storageMb: number
}
```

#### Done Criteria:
- [ ] Can start container for user
- [ ] Applies correct resource limits
- [ ] Can stop/restart container
- [ ] Returns container status

---

### Task 4.4.3: Create Workspace Status Endpoint

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 4.4.2 complete

#### Deliverables:
- [ ] GET /api/workspace/status
- [ ] POST /api/workspace/start
- [ ] POST /api/workspace/stop

#### Status Response:
```typescript
{
  status: 'running' | 'stopped' | 'starting',
  containerId: string,
  resources: {
    ramUsedMb: number,
    ramLimitMb: number,
    cpuPercent: number
  },
  uptime: number // seconds
}
```

#### Done Criteria:
- [ ] Returns accurate status
- [ ] Can start/stop workspace
- [ ] Shows resource usage

---

### Task 4.4.4: Create Resource Limits by Plan

**Session Type:** Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 4.4.3 complete

#### Deliverables:
- [ ] Plan-based limit enforcement
- [ ] Limit check middleware
- [ ] Upgrade prompts when limit hit

#### Implementation:
```typescript
// Middleware to check limits
async function checkPlanLimit(
  userId: string,
  resource: 'gateways' | 'plugins' | 'executions'
): Promise<boolean>

// Usage in gateway creation
if (!await checkPlanLimit(userId, 'gateways')) {
  throw new PlanLimitError('Gateway limit reached. Upgrade to Pro.')
}
```

#### Done Criteria:
- [ ] Gateway limit enforced
- [ ] Plugin limit enforced
- [ ] Execution limit tracked
- [ ] Clear error messages

---

### Task 4.5.1: Create Workspace Status UI

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 4.4.3 complete

#### Deliverables:
- [ ] src/components/workspace/workspace-status.tsx
- [ ] Resource usage bars
- [ ] Start/stop buttons

#### Features:
```
- RAM usage bar (256MB / 256MB)
- CPU usage indicator
- Status badge (Running/Stopped)
- Start/Stop/Restart buttons
- Uptime display
```

#### Done Criteria:
- [ ] Shows real resource usage
- [ ] Can control workspace
- [ ] Updates in real-time (polling)

---

## ✅ Phase 4 Completion Checklist

- [ ] Stripe integration working
- [ ] Checkout flow complete
- [ ] Billing portal accessible
- [ ] Subscription status tracked
- [ ] Webhooks handling events
- [ ] Workspace containers running
- [ ] Resource limits enforced
- [ ] Plan limits enforced
- [ ] Billing UI complete

**When complete:** Update CURRENT-STATE.md and proceed to Phase 5
