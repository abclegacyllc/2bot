/**
 * Credit Service Tests
 *
 * `creditService` is a thin facade over `creditWalletService`. The unit
 * tests below exercise the facade's contract — that personal/org are
 * routed to the right wallet, that metadata gets merged, that errors
 * propagate — without touching a real wallet/db.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/credits/wallet.service", () => ({
  creditWalletService: {
    getOrCreatePersonalWallet: vi.fn(),
    getOrCreateOrgWallet: vi.fn(),
    getOrgWallet: vi.fn(),
    deductCredits: vi.fn(),
    addCredits: vi.fn(),
    getTransactions: vi.fn(),
    claimDailyCredits: vi.fn(),
    getClaimStatus: vi.fn(),
  },
}));

import { creditWalletService } from "@/modules/credits/wallet.service";
import { creditService } from "../credit.service";

const mockedWallet = creditWalletService as unknown as {
  getOrCreatePersonalWallet: ReturnType<typeof vi.fn>;
  getOrCreateOrgWallet: ReturnType<typeof vi.fn>;
  getOrgWallet: ReturnType<typeof vi.fn>;
  deductCredits: ReturnType<typeof vi.fn>;
  addCredits: ReturnType<typeof vi.fn>;
  getTransactions: ReturnType<typeof vi.fn>;
  claimDailyCredits: ReturnType<typeof vi.fn>;
  getClaimStatus: ReturnType<typeof vi.fn>;
};

const personalWallet = {
  id: "wallet-personal-1",
  balance: 1000,
  lifetime: 5000,
  monthlyUsed: 250,
  pendingCredits: 0,
  monthlyAllocation: 500,
};

const orgWallet = {
  id: "wallet-org-1",
  balance: 2500,
  lifetime: 10000,
  monthlyUsed: 800,
  pendingCredits: 100,
  monthlyAllocation: 2000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedWallet.getOrCreatePersonalWallet.mockResolvedValue(personalWallet);
  mockedWallet.getOrCreateOrgWallet.mockResolvedValue(orgWallet);
  mockedWallet.getOrgWallet.mockResolvedValue(orgWallet);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPersonalBalance", () => {
  it("returns wallet fields tagged as personal", async () => {
    const out = await creditService.getPersonalBalance("user-1");
    expect(out).toEqual({
      balance: 1000,
      lifetime: 5000,
      monthlyUsed: 250,
      pendingCredits: 0,
      monthlyAllocation: 500,
      walletType: "personal",
    });
    expect(mockedWallet.getOrCreatePersonalWallet).toHaveBeenCalledWith("user-1");
  });
});

describe("checkPersonalCredits", () => {
  it("returns hasCredits=true and remaining when balance covers the request", async () => {
    const out = await creditService.checkPersonalCredits("user-1", 400);
    expect(out.hasCredits).toBe(true);
    expect(out.remaining).toBe(600);
    expect(out.walletType).toBe("personal");
    expect(out.walletId).toBe("wallet-personal-1");
  });

  it("returns hasCredits=false when balance is below the request", async () => {
    mockedWallet.getOrCreatePersonalWallet.mockResolvedValue({
      ...personalWallet,
      balance: 50,
    });
    const out = await creditService.checkPersonalCredits("user-1", 100);
    expect(out.hasCredits).toBe(false);
    expect(out.remaining).toBe(-50); // negative tells callers how short they are
  });

  it("reports plan limit as -1 (no monthly cap by design)", async () => {
    const out = await creditService.checkPersonalCredits("user-1", 10);
    expect(out.planLimit).toBe(-1);
    expect(out.withinPlanLimit).toBe(true);
  });
});

describe("deductPersonalCredits", () => {
  it("delegates to wallet.deductCredits with merged metadata + category", async () => {
    mockedWallet.deductCredits.mockResolvedValue({
      newBalance: 850,
      transactionId: "tx-1",
    });

    const result = await creditService.deductPersonalCredits("user-1", 150, {
      category: "ai_usage",
      description: "Chat completion",
      metadata: { model: "claude-haiku" },
    });

    expect(result).toMatchObject({
      success: true,
      creditsUsed: 150,
      newBalance: 850,
      walletType: "personal",
      walletId: "wallet-personal-1",
      transactionId: "tx-1",
      category: "ai_usage",
    });

    expect(mockedWallet.deductCredits).toHaveBeenCalledWith(
      "wallet-personal-1",
      150,
      "Chat completion",
      // Service appends `category` to metadata so downstream filters
      // can join on either key alone.
      { model: "claude-haiku", category: "ai_usage" },
      "ai_usage",
    );
  });

  it("propagates wallet errors (insufficient balance, etc.)", async () => {
    mockedWallet.deductCredits.mockRejectedValue(new Error("INSUFFICIENT_CREDITS"));
    await expect(
      creditService.deductPersonalCredits("user-1", 99999, {
        category: "ai_usage",
        description: "Big request",
      }),
    ).rejects.toThrow("INSUFFICIENT_CREDITS");
  });

  it("works without optional metadata", async () => {
    mockedWallet.deductCredits.mockResolvedValue({ newBalance: 900, transactionId: "tx-2" });
    await creditService.deductPersonalCredits("user-1", 100, {
      category: "marketplace",
      description: "Plugin purchase",
    });
    const callMeta = mockedWallet.deductCredits.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(callMeta).toEqual({ category: "marketplace" });
  });
});

describe("addPersonalCredits", () => {
  it("forwards type + description and returns new balance", async () => {
    mockedWallet.addCredits.mockResolvedValue({ newBalance: 1500 });

    const out = await creditService.addPersonalCredits(
      "user-1",
      500,
      "purchase",
      "Topup 500",
      { stripeChargeId: "ch_123" },
    );

    expect(out).toEqual({ newBalance: 1500, walletType: "personal" });
    expect(mockedWallet.addCredits).toHaveBeenCalledWith(
      "wallet-personal-1",
      500,
      "purchase",
      "Topup 500",
      { stripeChargeId: "ch_123" },
    );
  });
});

describe("getPersonalTransactions", () => {
  it("returns wallet transactions tagged with walletType", async () => {
    mockedWallet.getTransactions.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "usage",
          category: "ai_usage",
          amount: -150,
          balanceAfter: 850,
          description: "Chat",
          metadata: null,
          createdAt: new Date(),
        },
      ],
      total: 1,
    });

    const out = await creditService.getPersonalTransactions("user-1", { limit: 5 });
    expect(out.transactions).toHaveLength(1);
    expect(out.walletType).toBe("personal");
    expect(out.total).toBe(1);
  });
});

describe("getOrgBalance", () => {
  it("returns wallet fields tagged as organization", async () => {
    const out = await creditService.getOrgBalance("org-1");
    expect(out).toEqual({
      balance: 2500,
      lifetime: 10000,
      monthlyUsed: 800,
      pendingCredits: 100,
      monthlyAllocation: 2000,
      walletType: "organization",
    });
  });
});

describe("checkOrgCredits", () => {
  it("returns hasCredits + remaining for an org wallet", async () => {
    const out = await creditService.checkOrgCredits("org-1", 1000);
    expect(out?.hasCredits).toBe(true);
    expect(out?.remaining).toBe(1500);
    expect(out?.walletType).toBe("organization");
  });
});

describe("deductOrgCredits", () => {
  it("hits the org wallet with the same merged-metadata convention", async () => {
    mockedWallet.deductCredits.mockResolvedValue({
      newBalance: 2000,
      transactionId: "tx-org-1",
    });
    const out = await creditService.deductOrgCredits("org-1", 500, {
      category: "premium_feature",
      description: "Voice synthesis",
      metadata: { duration: 120 },
    });

    expect(out?.walletType).toBe("organization");
    expect(out?.walletId).toBe("wallet-org-1");
    expect(out?.creditsUsed).toBe(500);
    const callMeta = mockedWallet.deductCredits.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(callMeta).toEqual({ duration: 120, category: "premium_feature" });
  });
});

describe("addOrgCredits / getOrgTransactions are routed to the org wallet", () => {
  it("addOrgCredits hits the org wallet", async () => {
    mockedWallet.addCredits.mockResolvedValue({ newBalance: 3000 });
    const out = await creditService.addOrgCredits(
      "org-1",
      500,
      "grant",
      "Plan allocation",
    );
    expect(out?.newBalance).toBe(3000);
    expect(mockedWallet.addCredits.mock.calls[0]?.[0]).toBe("wallet-org-1");
    expect(mockedWallet.getOrCreatePersonalWallet).not.toHaveBeenCalled();
  });

  it("getOrgTransactions delegates with org wallet id", async () => {
    mockedWallet.getTransactions.mockResolvedValue({ transactions: [], total: 0 });
    const out = await creditService.getOrgTransactions("org-1", { limit: 10 });
    expect(out?.walletType).toBe("organization");
    expect(mockedWallet.getTransactions.mock.calls[0]?.[0]).toBe("wallet-org-1");
  });
});

describe("daily-claim shortcuts", () => {
  it("claimPersonalDailyCredits routes to the personal wallet", async () => {
    mockedWallet.claimDailyCredits.mockResolvedValue({ claimed: true, amount: 50, newBalance: 1050 });
    await creditService.claimPersonalDailyCredits("user-1");
    expect(mockedWallet.claimDailyCredits).toHaveBeenCalledWith("wallet-personal-1");
  });

  it("claimOrgDailyCredits routes to the org wallet", async () => {
    mockedWallet.claimDailyCredits.mockResolvedValue({ claimed: true, amount: 200, newBalance: 2700 });
    await creditService.claimOrgDailyCredits("org-1");
    expect(mockedWallet.claimDailyCredits).toHaveBeenCalledWith("wallet-org-1");
  });

  it("getPersonalClaimStatus / getOrgClaimStatus point at the right wallet", async () => {
    mockedWallet.getClaimStatus.mockResolvedValue({ canClaim: false, hoursUntilNext: 12 });
    await creditService.getPersonalClaimStatus("user-1");
    expect(mockedWallet.getClaimStatus.mock.calls.at(-1)?.[0]).toBe("wallet-personal-1");

    await creditService.getOrgClaimStatus("org-1");
    expect(mockedWallet.getClaimStatus.mock.calls.at(-1)?.[0]).toBe("wallet-org-1");
  });
});
