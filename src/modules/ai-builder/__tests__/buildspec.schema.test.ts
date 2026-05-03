/**
 * BuildSpec schema tests (Phase 6.3)
 *
 * Pure-function tests over the zod validator + cross-ref refinements.
 * No prisma / no DB.
 */

import { describe, expect, it } from "vitest";

import { BuildSpecV1 } from "../buildspec.schema";

describe("BuildSpec schema", () => {
  // Minimal viable spec used as a base in many tests.
  const minimal = {
    project: { name: "My Project" },
    gateways: [],
    plugins: [],
    workflows: [],
    smokeTests: [],
  };

  describe("project", () => {
    it("requires a project name", () => {
      const r = BuildSpecV1.safeParse({ ...minimal, project: { name: "" } });
      expect(r.success).toBe(false);
    });

    it("defaults version=1, kind=HYBRID, refMap empty", () => {
      const r = BuildSpecV1.safeParse(minimal);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.version).toBe(1);
        expect(r.data.project.kind).toBe("HYBRID");
      }
    });

    it("rejects unknown kind", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        project: { name: "X", kind: "UNKNOWN" },
      });
      expect(r.success).toBe(false);
    });
  });

  describe("gateway cross-refs", () => {
    it("workflow.gateways[].gatewayRef must resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        workflows: [
          {
            ref: "wf1",
            name: "WF",
            slug: "wf-1",
            triggerType: "BOT_MESSAGE",
            gateways: [{ gatewayRef: "missing", role: "trigger" }],
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.some((i) => i.message.includes("not found in spec.gateways"))).toBe(true);
      }
    });

    it("step.gatewayRef must resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        gateways: [
          { source: "existing", ref: "gw1", id: "gw_real_1" },
        ],
        workflows: [
          {
            ref: "wf1",
            name: "WF",
            slug: "wf-1",
            triggerType: "BOT_MESSAGE",
            steps: [
              { ref: "s1", pluginSlug: "echo-bot", gatewayRef: "missing" },
            ],
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("plugin.gatewayRef must resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [{ ref: "p1", pluginSlug: "echo-bot", gatewayRef: "missing" }],
      });
      expect(r.success).toBe(false);
    });

    it("accepts a fully wired spec", () => {
      const r = BuildSpecV1.safeParse({
        project: { name: "Tg Bot" },
        gateways: [
          { source: "existing", ref: "tg", id: "gw_real_1" },
        ],
        plugins: [{ ref: "echo", pluginSlug: "echo-bot", gatewayRef: "tg" }],
        workflows: [
          {
            ref: "wf1",
            name: "Echo flow",
            slug: "echo-flow",
            triggerType: "BOT_MESSAGE",
            gateways: [{ gatewayRef: "tg", role: "trigger" }],
            steps: [
              { ref: "s1", pluginSlug: "echo-bot", gatewayRef: "tg", order: 0 },
            ],
            edges: [],
          },
        ],
        smokeTests: [{ workflowRef: "wf1", kind: "preflight" }],
      });
      expect(r.success).toBe(true);
    });
  });

  describe("workflow edges", () => {
    it("rejects edges referencing unknown steps", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        gateways: [{ source: "existing", ref: "tg", id: "gw_x" }],
        workflows: [
          {
            ref: "wf",
            name: "WF",
            slug: "wf",
            triggerType: "BOT_MESSAGE",
            gateways: [{ gatewayRef: "tg", role: "trigger" }],
            steps: [{ ref: "s1", pluginSlug: "echo-bot" }],
            edges: [{ fromStepRef: "s1", toStepRef: "ghost" }],
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("smoke tests", () => {
    it("rejects smoke targeting unknown workflow", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        smokeTests: [{ workflowRef: "nope", kind: "preflight" }],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("uniqueness", () => {
    it("rejects duplicate spec-local refs across gateways/plugins/workflows", () => {
      const r = BuildSpecV1.safeParse({
        project: { name: "X" },
        gateways: [{ source: "existing", ref: "shared", id: "gw_1" }],
        plugins: [{ ref: "shared", pluginSlug: "echo-bot" }],
        workflows: [],
        smokeTests: [],
      });
      expect(r.success).toBe(false);
    });

    it("rejects duplicate workflow slugs within a spec", () => {
      const r = BuildSpecV1.safeParse({
        project: { name: "X" },
        gateways: [],
        plugins: [],
        workflows: [
          {
            ref: "a",
            name: "A",
            slug: "same",
            triggerType: "MANUAL",
            steps: [],
            edges: [],
            gateways: [],
          },
          {
            ref: "b",
            name: "B",
            slug: "same",
            triggerType: "MANUAL",
            steps: [],
            edges: [],
            gateways: [],
          },
        ],
        smokeTests: [],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("gateway 'new' source", () => {
    it("requires credentials for new telegram gateway", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        gateways: [
          {
            source: "new",
            ref: "tg",
            name: "Bot",
            type: "TELEGRAM_BOT",
            credentials: { botToken: "12345:ABC" },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects unknown gateway type", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        gateways: [
          {
            source: "new",
            ref: "x",
            name: "X",
            type: "UNKNOWN_BOT",
            credentials: {},
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });
});
