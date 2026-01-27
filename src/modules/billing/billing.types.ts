/**
 * Billing Types
 * 
 * Type definitions for the billing module
 */

import type { OrgPlanType } from '@/shared/constants/org-plans';
import type { PlanType, WorkspaceResources } from '@/shared/constants/plans';

// ===========================================
// Stripe Status Types
// ===========================================

export type StripeStatus = 
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'unpaid';

// ===========================================
// Subscription Info
// ===========================================

export interface SubscriptionInfo {
  id: string;
  plan: PlanType | OrgPlanType;  // Can be user plan or org plan
  status: StripeStatus | 'none';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  limits: {
    gateways: number;
    plugins: number;
    executionsPerMonth: number | null;  // null = unlimited
    aiTokensPerMonth: number;
    workspace: WorkspaceResources | null;  // null = not included
  };
}

// ===========================================
// Checkout Types
// ===========================================

export interface CheckoutRequest {
  plan: PlanType;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResponse {
  url: string;
}

// ===========================================
// Portal Types
// ===========================================

export interface PortalResponse {
  url: string;
}

// ===========================================
// Webhook Types
// ===========================================

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
}

// ===========================================
// Customer Types
// ===========================================

export interface CustomerInfo {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}
