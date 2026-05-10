/**
 * Stripe Webhook Handler Tests
 *
 * Targets `handleStripeEvent` directly (signature verification is the
 * route handler's concern; here we focus on the dispatch table and
 * the per-event mutations).
 *
 * Fixtures use minimal-but-valid shapes — Stripe types are large, so
 * `as unknown as Stripe.Event` is the pragmatic cast at the boundary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// `vi.hoisted` runs *before* the hoisted vi.mock and import statements,
// so we can prime `process.env.STRIPE_SECRET_KEY` ahead of the
// stripe-webhook module's top-level `new Stripe(...)` call. Without
// this, the module would see no secret and `stripe` would be null
// — every handler early-returns and assertions fail mysteriously.
const { stripeRetrieveMock } = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_for_unit_tests";
  return { stripeRetrieveMock: vi.fn() };
});

vi.mock("stripe", () => {
  // Must be `function` (or `class`) for `new Stripe(...)` to work.
  const StripeMock = function StripeMock() {
    return {
      subscriptions: { retrieve: stripeRetrieveMock },
      webhooks: { constructEvent: vi.fn() },
    };
  };
  return { default: StripeMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    organization: { update: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { prisma } from "@/lib/prisma";
import { handleStripeEvent } from "../stripe-webhook";

const mockedPrisma = prisma as unknown as {
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  organization: { update: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // The webhook code uses `prisma.$transaction([...ops])` for upsert+plan
  // pairs. Forwarding the array back is enough for the assertions we make.
  mockedPrisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function checkoutCompletedEvent(metadata: Record<string, string> = {}): Stripe.Event {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        subscription: "sub_test_1",
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionUpdatedEvent(): Stripe.Event {
  return {
    id: "evt_sub_updated_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test_1",
        status: "active",
        items: { data: [{ price: { id: "price_pro" } }] },
        billing_cycle_anchor: 1_700_000_000,
        start_date: 1_695_000_000,
        cancel_at_period_end: false,
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionDeletedEvent(): Stripe.Event {
  return {
    id: "evt_sub_deleted_1",
    type: "customer.subscription.deleted",
    data: {
      object: { id: "sub_test_1", status: "canceled" },
    },
  } as unknown as Stripe.Event;
}

function paymentSucceededEvent(): Stripe.Event {
  return {
    id: "evt_pay_ok_1",
    type: "invoice.payment_succeeded",
    data: { object: { id: "in_1", amount_paid: 1000 } },
  } as unknown as Stripe.Event;
}

function paymentFailedEvent(): Stripe.Event {
  return {
    id: "evt_pay_fail_1",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_2",
        customer: "cus_1",
        parent: { subscription_details: { subscription: "sub_test_1" } },
      },
    },
  } as unknown as Stripe.Event;
}

function unhandledEvent(): Stripe.Event {
  return {
    id: "evt_unhandled_1",
    type: "payout.created",
    data: { object: {} },
  } as unknown as Stripe.Event;
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

describe("handleStripeEvent — checkout.session.completed", () => {
  it("upserts organization subscription and updates org.plan when organizationId is in metadata", async () => {
    stripeRetrieveMock.mockResolvedValue({
      id: "sub_test_1",
      items: { data: [{ price: { id: "price_pro" } }] },
      status: "active",
      billing_cycle_anchor: 1_700_000_000,
      start_date: 1_695_000_000,
      cancel_at_period_end: false,
    });

    await handleStripeEvent(
      checkoutCompletedEvent({ organizationId: "org-1", plan: "PRO" }),
    );

    expect(mockedPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockedPrisma.subscription.upsert).toHaveBeenCalled();
    const upsertArgs = mockedPrisma.subscription.upsert.mock.calls[0]?.[0] as {
      where: { organizationId: string };
      create: { organizationId: string; stripeSubscriptionId: string; plan: string };
    };
    expect(upsertArgs.where.organizationId).toBe("org-1");
    expect(upsertArgs.create.stripeSubscriptionId).toBe("sub_test_1");
    expect(upsertArgs.create.plan).toBe("PRO");

    const orgUpdate = mockedPrisma.organization.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { plan: string };
    };
    expect(orgUpdate.where.id).toBe("org-1");
    expect(orgUpdate.data.plan).toBe("ORG_PRO"); // PRO maps to ORG_PRO
  });

  it("upserts user subscription and updates user.plan when only userId is in metadata", async () => {
    stripeRetrieveMock.mockResolvedValue({
      id: "sub_test_1",
      items: { data: [{ price: { id: "price_starter" } }] },
      status: "active",
      billing_cycle_anchor: 1_700_000_000,
      start_date: 1_695_000_000,
      cancel_at_period_end: false,
    });

    await handleStripeEvent(
      checkoutCompletedEvent({ userId: "user-1", plan: "STARTER" }),
    );

    const upsertArgs = mockedPrisma.subscription.upsert.mock.calls[0]?.[0] as {
      where: { userId: string };
      create: { userId: string };
    };
    expect(upsertArgs.where.userId).toBe("user-1");
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "STARTER" },
    });
    expect(mockedPrisma.organization.update).not.toHaveBeenCalled();
  });

  it("noops if the checkout session has no subscription attached", async () => {
    const event = {
      id: "evt_no_sub",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_no_sub", subscription: null, metadata: { userId: "u1", plan: "PRO" } },
      },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event);

    expect(mockedPrisma.subscription.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.updated
// ---------------------------------------------------------------------------

describe("handleStripeEvent — customer.subscription.updated", () => {
  it("updates subscription status + plan and propagates to the org", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub-row-1",
      organizationId: "org-1",
      userId: null,
    });

    await handleStripeEvent(subscriptionUpdatedEvent());

    expect(mockedPrisma.subscription.update).toHaveBeenCalled();
    const updateArgs = mockedPrisma.subscription.update.mock.calls[0]?.[0] as {
      data: { stripeStatus: string };
    };
    expect(updateArgs.data.stripeStatus).toBe("active");
    expect(mockedPrisma.organization.update).toHaveBeenCalled();
  });

  it("warns and noops if the subscription is unknown to us", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);
    await handleStripeEvent(subscriptionUpdatedEvent());
    expect(mockedPrisma.subscription.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted
// ---------------------------------------------------------------------------

describe("handleStripeEvent — customer.subscription.deleted", () => {
  it("flips an org subscription to canceled and resets the org to ORG_STARTER", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub-row-1",
      organizationId: "org-1",
      userId: null,
    });

    await handleStripeEvent(subscriptionDeletedEvent());

    const updateArgs = mockedPrisma.subscription.update.mock.calls[0]?.[0] as {
      data: { plan: string; stripeStatus: string; stripeSubscriptionId: null };
    };
    expect(updateArgs.data.plan).toBe("FREE");
    expect(updateArgs.data.stripeStatus).toBe("canceled");
    expect(updateArgs.data.stripeSubscriptionId).toBeNull();

    expect(mockedPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { plan: "ORG_STARTER" },
    });
  });

  it("flips a user subscription to canceled and resets the user to FREE", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub-row-2",
      organizationId: null,
      userId: "user-1",
    });

    await handleStripeEvent(subscriptionDeletedEvent());

    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { plan: "FREE" },
    });
    expect(mockedPrisma.organization.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invoice.payment_succeeded / payment_failed
// ---------------------------------------------------------------------------

describe("handleStripeEvent — invoice events", () => {
  it("payment_succeeded does not mutate state (logs only)", async () => {
    await handleStripeEvent(paymentSucceededEvent());
    expect(mockedPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it("payment_failed flips the linked subscription to past_due", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: "sub-row-1",
      organizationId: "org-1",
      userId: null,
      user: null,
      organization: { name: "Acme", memberships: [{ user: { email: "owner@acme.test" } }] },
    });

    await handleStripeEvent(paymentFailedEvent());

    const updateArgs = mockedPrisma.subscription.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { stripeStatus: string };
    };
    expect(updateArgs.where.id).toBe("sub-row-1");
    expect(updateArgs.data.stripeStatus).toBe("past_due");
  });

  it("payment_failed without a subscription reference is a no-op", async () => {
    const event = {
      id: "evt_pay_fail_no_sub",
      type: "invoice.payment_failed",
      data: {
        object: { id: "in_3", customer: "cus_2", parent: {} },
      },
    } as unknown as Stripe.Event;

    await handleStripeEvent(event);
    expect(mockedPrisma.subscription.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Unhandled event type — must not throw
// ---------------------------------------------------------------------------

describe("handleStripeEvent — defensive defaults", () => {
  it("returns cleanly for an unhandled event type", async () => {
    await expect(handleStripeEvent(unhandledEvent())).resolves.toBeUndefined();
    expect(mockedPrisma.subscription.update).not.toHaveBeenCalled();
    expect(mockedPrisma.subscription.upsert).not.toHaveBeenCalled();
  });
});
