/**
 * Schedule tick service tests (Phase 7.4)
 *
 * Validates:
 *   - cron expression validation in `validateScheduleSpec`
 *   - `computeNextFireAt` returns a future Date
 *   - `processDueSchedules` selects due rows, calls executeWorkflow with the
 *     scheduledAt idempotency key, and advances `nextFireAt`
 *   - unbound schedules (no targetWorkflowId) advance without firing
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    schedule: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/modules/workflow/workflow.executor", () => ({
  executeWorkflow: vi.fn(),
}));

vi.mock("@/lib/redis-lock", () => ({
  withDistributedLock: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
}));

import { prisma } from "@/lib/prisma";
import { executeWorkflow } from "@/modules/workflow/workflow.executor";

import {
    computeNextFireAt,
    validateScheduleSpec,
} from "../project-resource.service";
import { processDueSchedules } from "../schedule-tick.service";

const mockedPrisma = prisma as unknown as {
  schedule: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockedExecuteWorkflow = executeWorkflow as unknown as ReturnType<typeof vi.fn>;

describe("validateScheduleSpec", () => {
  it("accepts a valid 5-field cron", () => {
    expect(() => validateScheduleSpec({ cron: "*/5 * * * *" })).not.toThrow();
    expect(() => validateScheduleSpec({ cron: "0 9 * * 1-5" })).not.toThrow();
  });

  it("accepts a valid timezone", () => {
    expect(() =>
      validateScheduleSpec({ cron: "0 0 * * *", timezone: "America/New_York" }),
    ).not.toThrow();
    expect(() =>
      validateScheduleSpec({ cron: "0 0 * * *", timezone: "UTC" }),
    ).not.toThrow();
  });

  it("rejects empty / non-string cron", () => {
    expect(() => validateScheduleSpec({ cron: "" })).toThrow(/cron expression/);
    // @ts-expect-error testing runtime guard
    expect(() => validateScheduleSpec({ cron: null })).toThrow(/cron expression/);
  });

  it("rejects an invalid cron expression", () => {
    expect(() => validateScheduleSpec({ cron: "not a cron" })).toThrow(
      /invalid cron expression/,
    );
    expect(() => validateScheduleSpec({ cron: "99 99 99 99 99" })).toThrow(
      /invalid cron expression/,
    );
  });

  it("rejects an invalid timezone format", () => {
    expect(() =>
      validateScheduleSpec({ cron: "0 0 * * *", timezone: "not a tz" }),
    ).toThrow(/timezone/);
  });
});

describe("computeNextFireAt", () => {
  it("returns a Date strictly after the supplied `from`", () => {
    const from = new Date("2030-01-01T00:00:00Z");
    const next = computeNextFireAt("*/5 * * * *", "UTC", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    // For */5, next minute boundary should be within 5 minutes.
    expect(next.getTime() - from.getTime()).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("processDueSchedules", () => {
  beforeEach(() => {
    mockedPrisma.schedule.findMany.mockReset();
    mockedPrisma.schedule.update.mockReset();
    mockedExecuteWorkflow.mockReset();
  });

  it("fires bound schedules and advances nextFireAt", async () => {
    const now = new Date("2030-06-15T12:00:00Z");
    const scheduledAt = new Date("2030-06-15T11:55:00Z");

    mockedPrisma.schedule.findMany.mockResolvedValue([
      {
        id: "sched-1",
        resourceId: "res-1",
        cron: "*/5 * * * *",
        timezone: null,
        targetWorkflowId: "wf-1",
        enabled: true,
        nextFireAt: scheduledAt,
        lastFiredAt: null,
        resource: { id: "res-1", status: "ACTIVE" },
      },
    ]);
    mockedExecuteWorkflow.mockResolvedValue("run-1");
    mockedPrisma.schedule.update.mockResolvedValue({});

    const result = await processDueSchedules(now);
    expect(result).toEqual({ considered: 1, fired: 1, errors: 0 });

    expect(mockedExecuteWorkflow).toHaveBeenCalledTimes(1);
    const call = mockedExecuteWorkflow.mock.calls[0]!;
    expect(call[0]).toBe("wf-1");
    expect(call[1]).toBe("schedule");
    expect((call[2] as { scheduledAt: string }).scheduledAt).toBe(
      scheduledAt.toISOString(),
    );
    expect(call[4]).toBe(`schedule:sched-1:${scheduledAt.toISOString()}`);

    const updateCall = mockedPrisma.schedule.update.mock.calls[0]![0] as {
      where: { id: string };
      data: { lastFiredAt: Date; nextFireAt: Date };
    };
    expect(updateCall.where.id).toBe("sched-1");
    expect(updateCall.data.lastFiredAt).toEqual(now);
    expect(updateCall.data.nextFireAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("advances unbound schedules without firing", async () => {
    const now = new Date("2030-06-15T12:00:00Z");

    mockedPrisma.schedule.findMany.mockResolvedValue([
      {
        id: "sched-2",
        resourceId: "res-2",
        cron: "*/10 * * * *",
        timezone: null,
        targetWorkflowId: null,
        enabled: true,
        nextFireAt: new Date("2030-06-15T11:50:00Z"),
        lastFiredAt: null,
        resource: { id: "res-2", status: "ACTIVE" },
      },
    ]);
    mockedPrisma.schedule.update.mockResolvedValue({});

    const result = await processDueSchedules(now);
    expect(result).toEqual({ considered: 1, fired: 0, errors: 0 });
    expect(mockedExecuteWorkflow).not.toHaveBeenCalled();
    expect(mockedPrisma.schedule.update).toHaveBeenCalledTimes(1);
  });

  it("counts executor errors but continues processing other rows", async () => {
    const now = new Date("2030-06-15T12:00:00Z");

    mockedPrisma.schedule.findMany.mockResolvedValue([
      {
        id: "sched-a",
        resourceId: "res-a",
        cron: "*/5 * * * *",
        timezone: null,
        targetWorkflowId: "wf-broken",
        enabled: true,
        nextFireAt: new Date("2030-06-15T11:55:00Z"),
        lastFiredAt: null,
        resource: { id: "res-a", status: "ACTIVE" },
      },
      {
        id: "sched-b",
        resourceId: "res-b",
        cron: "*/5 * * * *",
        timezone: null,
        targetWorkflowId: "wf-ok",
        enabled: true,
        nextFireAt: new Date("2030-06-15T11:55:00Z"),
        lastFiredAt: null,
        resource: { id: "res-b", status: "ACTIVE" },
      },
    ]);
    mockedExecuteWorkflow
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("run-ok");
    mockedPrisma.schedule.update.mockResolvedValue({});

    const result = await processDueSchedules(now);
    expect(result).toEqual({ considered: 2, fired: 1, errors: 1 });
    // Both rows still advance.
    expect(mockedPrisma.schedule.update).toHaveBeenCalledTimes(2);
  });
});
