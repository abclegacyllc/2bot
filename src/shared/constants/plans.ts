// Plan Definitions for V1 (Free + Pro)

export type PlanType = "FREE" | "PRO";

export interface PlanLimits {
  gateways: number;
  plugins: number;
  messagesPerDay: number;
  aiRequestsPerDay: number;
  storageGb: number;
  webhooks: number;
}

export interface Plan {
  id: PlanType;
  name: string;
  description: string;
  price: {
    monthly: number;
    yearly: number;
  };
  limits: PlanLimits;
  features: string[];
  isPopular?: boolean;
}

/**
 * V1 Plans - Free and Pro only
 */
export const PLANS: Record<PlanType, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    description: "Perfect for getting started",
    price: {
      monthly: 0,
      yearly: 0,
    },
    limits: {
      gateways: 1,
      plugins: 1,
      messagesPerDay: 100,
      aiRequestsPerDay: 10,
      storageGb: 1,
      webhooks: 1,
    },
    features: [
      "1 Telegram Bot",
      "1 Plugin",
      "100 messages/day",
      "10 AI requests/day",
      "Community support",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "For power users and small teams",
    price: {
      monthly: 29,
      yearly: 290,
    },
    limits: {
      gateways: 5,
      plugins: 10,
      messagesPerDay: 10000,
      aiRequestsPerDay: 1000,
      storageGb: 10,
      webhooks: 10,
    },
    features: [
      "5 Telegram Bots",
      "10 Plugins",
      "10,000 messages/day",
      "1,000 AI requests/day",
      "Priority support",
      "Analytics dashboard",
      "Custom webhooks",
    ],
    isPopular: true,
  },
} as const;

/**
 * Get plan by ID
 */
export function getPlan(planId: PlanType): Plan {
  return PLANS[planId];
}

/**
 * Check if a plan has a specific limit
 */
export function checkLimit(planId: PlanType, resource: keyof PlanLimits, current: number): boolean {
  const plan = getPlan(planId);
  return current < plan.limits[resource];
}
