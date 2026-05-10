/**
 * Review Service Tests
 *
 * Covers all six methods of ReviewService: submit/upsert,
 * update (owner check), delete (owner check), list with pagination,
 * getUserReview, and the rating-summary aggregation.
 *
 * The service is constructed with an injected PrismaClient (factory
 * pattern), so tests pass a hand-rolled mock instead of using vi.mock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getReviewService } from "../review.service";

// Reset the singleton between test files. The factory caches its first
// instance — exposing a setter would be invasive, so we pierce the
// internal Symbol-less cache with a fresh import for each test by
// resetting the module registry. In practice we just rebuild the
// service with `getReviewService(prisma)` per `beforeEach` — the
// singleton holds the FIRST prisma we passed in, which is what we want.

// `getReviewService` caches the first PrismaClient reference it sees
// (singleton). Defining the prisma object at module scope and only
// resetting the vi.fns in beforeEach keeps that reference stable
// across the suite.
const prisma = {
  plugin: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  pluginReview: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  userPlugin: {
    findFirst: vi.fn(),
  },
};

const service = getReviewService(prisma as unknown as PrismaClient);

beforeEach(() => {
  // Clear call history but keep the function identities stable so the
  // singleton's captured references continue to point at the same
  // vi.fn instances we set up here.
  for (const tbl of Object.values(prisma)) {
    for (const fn of Object.values(tbl)) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
  // Sane default returns for the always-called helpers.
  prisma.plugin.update.mockResolvedValue({});
  prisma.pluginReview.delete.mockResolvedValue({});
  prisma.pluginReview.aggregate.mockResolvedValue({
    _avg: { rating: 0 },
    _count: { rating: 0 },
  });
});

const reviewFixture = {
  id: "rev-1",
  userId: "user-1",
  pluginId: "plug-1",
  rating: 5,
  title: "Great",
  content: "Works",
  isPublic: true,
  verifiedInstall: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: "user-1", name: "Alice" },
};

// ---------------------------------------------------------------------------
// submitReview
// ---------------------------------------------------------------------------

describe("submitReview", () => {
  it("upserts a review and recalculates plugin aggregate", async () => {
    prisma.plugin.findUnique.mockResolvedValue({ id: "plug-1" });
    prisma.userPlugin.findFirst.mockResolvedValue({ id: "up-1" });
    prisma.pluginReview.upsert.mockResolvedValue(reviewFixture);
    prisma.pluginReview.aggregate.mockResolvedValue({
      _avg: { rating: 4.7 },
      _count: { rating: 12 },
    });

    const out = await service.submitReview({
      userId: "user-1",
      pluginId: "plug-1",
      rating: 5,
      title: "Great",
      content: "Works",
    });

    expect(out.id).toBe("rev-1");
    // verifiedInstall flag flows through from userPlugin lookup
    const upsertArgs = prisma.pluginReview.upsert.mock.calls[0]?.[0] as {
      create: { verifiedInstall: boolean };
    };
    expect(upsertArgs.create.verifiedInstall).toBe(true);
    // recalculation happens
    expect(prisma.plugin.update).toHaveBeenCalled();
    const updateArgs = prisma.plugin.update.mock.calls[0]?.[0] as {
      data: { avgRating: number; reviewCount: number };
    };
    expect(updateArgs.data.avgRating).toBe(4.7);
    expect(updateArgs.data.reviewCount).toBe(12);
  });

  it("marks verifiedInstall=false when the user has not installed the plugin", async () => {
    prisma.plugin.findUnique.mockResolvedValue({ id: "plug-1" });
    prisma.userPlugin.findFirst.mockResolvedValue(null);
    prisma.pluginReview.upsert.mockResolvedValue({ ...reviewFixture, verifiedInstall: false });

    await service.submitReview({ userId: "user-1", pluginId: "plug-1", rating: 4 });

    const upsertArgs = prisma.pluginReview.upsert.mock.calls[0]?.[0] as {
      create: { verifiedInstall: boolean };
    };
    expect(upsertArgs.create.verifiedInstall).toBe(false);
  });

  it("rejects ratings outside the 1..5 range", async () => {
    await expect(
      service.submitReview({ userId: "u", pluginId: "p", rating: 6 }),
    ).rejects.toThrow(/between 1 and 5/);
    await expect(
      service.submitReview({ userId: "u", pluginId: "p", rating: 0 }),
    ).rejects.toThrow(/between 1 and 5/);
  });

  it("rejects fractional ratings", async () => {
    await expect(
      service.submitReview({ userId: "u", pluginId: "p", rating: 3.5 }),
    ).rejects.toThrow(/integer/);
  });

  it("throws when the plugin does not exist", async () => {
    prisma.plugin.findUnique.mockResolvedValue(null);
    await expect(
      service.submitReview({ userId: "u", pluginId: "ghost", rating: 5 }),
    ).rejects.toThrow(/Plugin not found/);
    expect(prisma.pluginReview.upsert).not.toHaveBeenCalled();
  });

  it("trims overlong titles to 200 chars and content to 5000 chars", async () => {
    prisma.plugin.findUnique.mockResolvedValue({ id: "plug-1" });
    prisma.userPlugin.findFirst.mockResolvedValue(null);
    prisma.pluginReview.upsert.mockResolvedValue(reviewFixture);

    const longTitle = "x".repeat(500);
    const longContent = "y".repeat(10_000);
    await service.submitReview({
      userId: "u",
      pluginId: "plug-1",
      rating: 5,
      title: longTitle,
      content: longContent,
    });
    const args = prisma.pluginReview.upsert.mock.calls[0]?.[0] as {
      create: { title: string; content: string };
    };
    expect(args.create.title.length).toBe(200);
    expect(args.create.content.length).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// updateReview
// ---------------------------------------------------------------------------

describe("updateReview", () => {
  it("updates a review owned by the caller and recalculates when rating changes", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "user-1", pluginId: "plug-1" });
    prisma.pluginReview.update.mockResolvedValue(reviewFixture);
    prisma.pluginReview.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { rating: 6 },
    });

    await service.updateReview("rev-1", "user-1", { rating: 4, title: "Updated" });

    expect(prisma.pluginReview.update).toHaveBeenCalled();
    expect(prisma.plugin.update).toHaveBeenCalled(); // recalc fired because rating changed
  });

  it("does NOT recalculate when only title/content change", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "user-1", pluginId: "plug-1" });
    prisma.pluginReview.update.mockResolvedValue(reviewFixture);

    await service.updateReview("rev-1", "user-1", { title: "Just a title tweak" });

    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });

  it("rejects updates from a non-owner", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "user-1", pluginId: "plug-1" });
    await expect(
      service.updateReview("rev-1", "different-user", { rating: 1 }),
    ).rejects.toThrow(/Unauthorized/);
    expect(prisma.pluginReview.update).not.toHaveBeenCalled();
  });

  it("rejects when the review does not exist", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue(null);
    await expect(
      service.updateReview("missing", "u", { rating: 4 }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects an out-of-range rating on update", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "u", pluginId: "p" });
    await expect(
      service.updateReview("rev-1", "u", { rating: 9 }),
    ).rejects.toThrow(/between 1 and 5/);
  });
});

// ---------------------------------------------------------------------------
// deleteReview
// ---------------------------------------------------------------------------

describe("deleteReview", () => {
  it("deletes when caller owns the review and recalculates aggregate", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "u-1", pluginId: "plug-1" });
    await service.deleteReview("rev-1", "u-1");
    expect(prisma.pluginReview.delete).toHaveBeenCalledWith({ where: { id: "rev-1" } });
    expect(prisma.plugin.update).toHaveBeenCalled();
  });

  it("rejects when caller does not own the review", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue({ userId: "u-1", pluginId: "plug-1" });
    await expect(service.deleteReview("rev-1", "intruder")).rejects.toThrow(/Unauthorized/);
    expect(prisma.pluginReview.delete).not.toHaveBeenCalled();
  });

  it("rejects when the review does not exist", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue(null);
    await expect(service.deleteReview("missing", "u")).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// getPluginReviews
// ---------------------------------------------------------------------------

describe("getPluginReviews", () => {
  it("paginates correctly: page=2, limit=5 → skip 5, take 5", async () => {
    prisma.pluginReview.findMany.mockResolvedValue([reviewFixture]);
    prisma.pluginReview.count.mockResolvedValue(11);

    const out = await service.getPluginReviews("plug-1", 2, 5);

    expect(out.total).toBe(11);
    expect(out.page).toBe(2);
    expect(out.limit).toBe(5);
    const findArgs = prisma.pluginReview.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
      where: { isPublic: boolean };
    };
    expect(findArgs.skip).toBe(5);
    expect(findArgs.take).toBe(5);
    expect(findArgs.where.isPublic).toBe(true); // private reviews excluded
  });

  it("uses defaults page=1, limit=10 when omitted", async () => {
    prisma.pluginReview.findMany.mockResolvedValue([]);
    prisma.pluginReview.count.mockResolvedValue(0);
    const out = await service.getPluginReviews("plug-1");
    expect(out.page).toBe(1);
    expect(out.limit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getUserReview
// ---------------------------------------------------------------------------

describe("getUserReview", () => {
  it("returns the review for the user_plugin pair", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue(reviewFixture);
    const out = await service.getUserReview("user-1", "plug-1");
    expect(out?.id).toBe("rev-1");
  });

  it("returns null when no review exists", async () => {
    prisma.pluginReview.findUnique.mockResolvedValue(null);
    expect(await service.getUserReview("u", "p")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getReviewSummary
// ---------------------------------------------------------------------------

describe("getReviewSummary", () => {
  it("computes weighted average and full 1..5 distribution", async () => {
    prisma.pluginReview.groupBy.mockResolvedValue([
      { rating: 5, _count: { rating: 4 } }, // 4 × 5 = 20
      { rating: 4, _count: { rating: 2 } }, // 2 × 4 = 8
      { rating: 1, _count: { rating: 1 } }, // 1 × 1 = 1
    ]);

    const out = await service.getReviewSummary("plug-1");

    // 7 reviews, 29/7 ≈ 4.14 → rounded to 4.1
    expect(out.reviewCount).toBe(7);
    expect(out.avgRating).toBeCloseTo(4.1, 1);
    expect(out.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 2, 5: 4 });
  });

  it("returns avgRating=0 and an all-zero distribution when no reviews exist", async () => {
    prisma.pluginReview.groupBy.mockResolvedValue([]);

    const out = await service.getReviewSummary("plug-empty");
    expect(out.reviewCount).toBe(0);
    expect(out.avgRating).toBe(0);
    expect(out.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});
