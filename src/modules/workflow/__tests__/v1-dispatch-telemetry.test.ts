/**
 * V1 Dispatch Telemetry Tests (Phase 6.1)
 *
 * @module modules/workflow/__tests__/v1-dispatch-telemetry.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const incMock = vi.fn();
vi.mock("@/lib/metrics", () => ({
  v1DispatchTotal: {
    inc: (...args: unknown[]) => incMock(...args),
  },
}));

import {
  getV1DispatchMode,
  recordV1Dispatch,
  shouldRunV1Dispatch,
} from "../v1-dispatch-telemetry";

describe("V1 dispatch telemetry", () => {
  const ORIGINAL = process.env.PLUGIN_V1_DISPATCH;

  beforeEach(() => {
    incMock.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PLUGIN_V1_DISPATCH;
    else process.env.PLUGIN_V1_DISPATCH = ORIGINAL;
  });

  describe("getV1DispatchMode", () => {
    it("defaults to 'enabled' when env var is unset", () => {
      delete process.env.PLUGIN_V1_DISPATCH;
      expect(getV1DispatchMode()).toBe("enabled");
    });

    it("returns 'telemetry' when env var is 'telemetry'", () => {
      process.env.PLUGIN_V1_DISPATCH = "telemetry";
      expect(getV1DispatchMode()).toBe("telemetry");
    });

    it("returns 'disabled' when env var is 'disabled'", () => {
      process.env.PLUGIN_V1_DISPATCH = "disabled";
      expect(getV1DispatchMode()).toBe("disabled");
    });

    it("falls back to 'enabled' for unknown values", () => {
      process.env.PLUGIN_V1_DISPATCH = "garbage";
      expect(getV1DispatchMode()).toBe("enabled");
    });

    it("is case-insensitive", () => {
      process.env.PLUGIN_V1_DISPATCH = "DISABLED";
      expect(getV1DispatchMode()).toBe("disabled");
    });
  });

  describe("shouldRunV1Dispatch", () => {
    it("returns true in 'enabled' mode", () => {
      process.env.PLUGIN_V1_DISPATCH = "enabled";
      expect(shouldRunV1Dispatch()).toBe(true);
    });

    it("returns true in 'telemetry' mode", () => {
      process.env.PLUGIN_V1_DISPATCH = "telemetry";
      expect(shouldRunV1Dispatch()).toBe(true);
    });

    it("returns false in 'disabled' mode", () => {
      process.env.PLUGIN_V1_DISPATCH = "disabled";
      expect(shouldRunV1Dispatch()).toBe(false);
    });
  });

  describe("recordV1Dispatch", () => {
    it("increments counter with eventType + mode labels and pluginsExecuted value", () => {
      process.env.PLUGIN_V1_DISPATCH = "enabled";
      recordV1Dispatch("telegram", 3);
      expect(incMock).toHaveBeenCalledWith({ eventType: "telegram", mode: "enabled" }, 3);
    });

    it("records zero increments (denominator) for tracking entry frequency", () => {
      process.env.PLUGIN_V1_DISPATCH = "telemetry";
      recordV1Dispatch("discord", 0);
      expect(incMock).toHaveBeenCalledWith({ eventType: "discord", mode: "telemetry" }, 0);
    });

    it("uses current mode at call time, not at module load", () => {
      process.env.PLUGIN_V1_DISPATCH = "enabled";
      recordV1Dispatch("slack", 1);
      process.env.PLUGIN_V1_DISPATCH = "disabled";
      recordV1Dispatch("slack", 0);
      expect(incMock).toHaveBeenNthCalledWith(1, { eventType: "slack", mode: "enabled" }, 1);
      expect(incMock).toHaveBeenNthCalledWith(2, { eventType: "slack", mode: "disabled" }, 0);
    });
  });
});
