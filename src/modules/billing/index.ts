// Billing Module - Phase 5: Billing System
// Exports: billingTypes, stripeService

export const BILLING_MODULE = "billing" as const;

// Types
export * from "./billing.types";

// Service
export { stripeService } from "./stripe.service";
