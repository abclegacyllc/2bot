/**
 * Billing Types
 * 
 * Type definitions for the billing module
 */

import type { PlanType } from '@/shared/constants/plans';

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
  plan: PlanType;
  status: StripeStatus | 'none';
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  limits: {
    gateways: number;
    plugins: number;
    executionsPerDay: number;
    aiTokensPerMonth: number;
    ramMb: number;
    storageMb: number;
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
