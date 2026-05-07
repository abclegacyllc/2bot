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

    const wfBase = {
      project: { name: "P" },
      gateways: [{ source: "existing" as const, ref: "tg", id: "gw_x" }],
      workflows: [
        {
          ref: "wf1",
          name: "WF",
          slug: "wf",
          triggerType: "BOT_MESSAGE" as const,
          gateways: [{ gatewayRef: "tg", role: "trigger" as const }],
          steps: [],
          edges: [],
        },
      ],
    };

    it("defaults missing kind to preflight (Wave 1 backward compat)", () => {
      const r = BuildSpecV1.safeParse({
        ...wfBase,
        smokeTests: [{ workflowRef: "wf1" }],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.smokeTests[0]!.kind).toBe("preflight");
      }
    });

    it("accepts kind=manual-run with optional payload", () => {
      const r = BuildSpecV1.safeParse({
        ...wfBase,
        smokeTests: [
          { workflowRef: "wf1", kind: "manual-run" },
          { workflowRef: "wf1", kind: "manual-run", payload: { foo: 1 } },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("accepts kind=sample-payload with required payload", () => {
      const r = BuildSpecV1.safeParse({
        ...wfBase,
        smokeTests: [
          {
            workflowRef: "wf1",
            kind: "sample-payload",
            payload: { message: { text: "hi" } },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects sample-payload missing payload", () => {
      const r = BuildSpecV1.safeParse({
        ...wfBase,
        smokeTests: [{ workflowRef: "wf1", kind: "sample-payload" }],
      });
      expect(r.success).toBe(false);
    });

    it("rejects an unknown smoke kind", () => {
      const r = BuildSpecV1.safeParse({
        ...wfBase,
        smokeTests: [{ workflowRef: "wf1", kind: "exhaustive" }],
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

  describe("resources (HTTP_ROUTE)", () => {
    it("defaults resources to [] for existing specs", () => {
      const r = BuildSpecV1.safeParse(minimal);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.resources).toEqual([]);
    });

    it("accepts a minimal HTTP_ROUTE resource", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [{ ref: "p1", pluginSlug: "echo-bot" }],
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Hello",
            httpRoute: { path: "/hello", targetPluginRef: "p1" },
          },
        ],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.resources[0]).toMatchObject({
          ref: "r1",
          kind: "HTTP_ROUTE",
          httpRoute: { method: "ANY", authMode: "NONE", path: "/hello" },
        });
      }
    });

    it("rejects targetPluginRef that doesn't resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Hello",
            httpRoute: { path: "/hello", targetPluginRef: "ghost" },
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) =>
            i.message.includes('targetPluginRef "ghost" not found'),
          ),
        ).toBe(true);
      }
    });

    it("rejects bad path syntax", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Bad",
            httpRoute: { path: "no-leading-slash" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects duplicate (method, path) pair within the spec", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "A",
            httpRoute: { method: "GET", path: "/x" },
          },
          {
            ref: "r2",
            kind: "HTTP_ROUTE",
            name: "B",
            httpRoute: { method: "GET", path: "/x" },
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) => i.message.includes("duplicate HTTP_ROUTE")),
        ).toBe(true);
      }
    });

    it("rejects API_KEY without authConfig.apiKey", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "A",
            httpRoute: { path: "/x", authMode: "API_KEY" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects HMAC without authConfig.hmacSecret", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "A",
            httpRoute: { path: "/x", authMode: "HMAC" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("accepts resources alongside the existing ref-uniqueness check", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [{ ref: "shared", pluginSlug: "echo-bot" }],
        resources: [
          {
            ref: "shared", // collides with the plugin ref
            kind: "HTTP_ROUTE",
            name: "A",
            httpRoute: { path: "/x" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("resources targetWorkflowRef (Phase 7.4)", () => {
    const wfMin = {
      ref: "wf-x",
      name: "WF",
      slug: "wf-x",
      triggerType: "WEBHOOK" as const,
      gateways: [],
      steps: [],
      edges: [],
    };

    it("accepts HTTP_ROUTE with targetWorkflowRef pointing at a workflow", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        workflows: [wfMin],
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Hook",
            httpRoute: { path: "/hook", targetWorkflowRef: "wf-x" },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects HTTP_ROUTE targetWorkflowRef that does not resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Hook",
            httpRoute: { path: "/hook", targetWorkflowRef: "ghost" },
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) =>
            i.message.includes('targetWorkflowRef "ghost" not found'),
          ),
        ).toBe(true);
      }
    });

    it("rejects HTTP_ROUTE with both targetPluginRef and targetWorkflowRef", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [{ ref: "p1", pluginSlug: "echo-bot" }],
        workflows: [wfMin],
        resources: [
          {
            ref: "r1",
            kind: "HTTP_ROUTE",
            name: "Hook",
            httpRoute: {
              path: "/hook",
              targetPluginRef: "p1",
              targetWorkflowRef: "wf-x",
            },
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) =>
            i.message.includes("mutually exclusive"),
          ),
        ).toBe(true);
      }
    });
  });

  describe("resources SCHEDULE (Phase 7.4)", () => {
    it("accepts a minimal SCHEDULE", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "s1",
            kind: "SCHEDULE",
            name: "Hourly",
            schedule: { cron: "0 * * * *" },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("accepts SCHEDULE with targetWorkflowRef + timezone", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        workflows: [
          {
            ref: "nightly",
            name: "Nightly",
            slug: "nightly",
            triggerType: "SCHEDULE",
            gateways: [],
            steps: [],
            edges: [],
          },
        ],
        resources: [
          {
            ref: "s1",
            kind: "SCHEDULE",
            name: "Nightly tick",
            schedule: {
              cron: "0 3 * * *",
              timezone: "Europe/London",
              targetWorkflowRef: "nightly",
              enabled: true,
            },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects SCHEDULE.targetWorkflowRef that does not resolve", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "s1",
            kind: "SCHEDULE",
            name: "X",
            schedule: { cron: "* * * * *", targetWorkflowRef: "ghost" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });

  describe("resources SECRET (Phase 7.4)", () => {
    it("accepts a minimal SECRET", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "sec1",
            kind: "SECRET",
            name: "OpenAI key",
            secret: { key: "OPENAI_API_KEY", value: "sk-test-123" },
          },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("rejects SECRET with lowercase key", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "sec1",
            kind: "SECRET",
            name: "X",
            secret: { key: "openai_key", value: "x" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects empty SECRET value", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "sec1",
            kind: "SECRET",
            name: "X",
            secret: { key: "K", value: "" },
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects duplicate SECRET keys within a single spec", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        resources: [
          {
            ref: "sec1",
            kind: "SECRET",
            name: "A",
            secret: { key: "DUP_KEY", value: "v1" },
          },
          {
            ref: "sec2",
            kind: "SECRET",
            name: "B",
            secret: { key: "DUP_KEY", value: "v2" },
          },
        ],
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(
          r.error.issues.some((i) =>
            i.message.includes('duplicate SECRET key "DUP_KEY"'),
          ),
        ).toBe(true);
      }
    });
  });

  describe("plugin install discriminated union (Wave 2)", () => {
    it("defaults source to 'marketplace' when omitted (backward compat)", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [{ ref: "p1", pluginSlug: "echo-bot" }],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.plugins[0]?.source).toBe("marketplace");
      }
    });

    it("accepts an explicit source: 'marketplace' install", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [
          { source: "marketplace", ref: "p1", pluginSlug: "echo-bot" },
        ],
      });
      expect(r.success).toBe(true);
    });

    it("accepts a source: 'generated' install with template + name + slug", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [
          {
            source: "generated",
            ref: "p1",
            pluginSlug: "translator-bot",
            name: "Translator Bot",
            template: "telegram-translate-typescript",
            templateInputs: { targetLanguage: "ru" },
          },
        ],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        const inst = r.data.plugins[0];
        expect(inst?.source).toBe("generated");
        if (inst?.source === "generated") {
          expect(inst.template).toBe("telegram-translate-typescript");
          expect(inst.name).toBe("Translator Bot");
        }
      }
    });

    it("rejects 'generated' install missing template", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [
          {
            source: "generated",
            ref: "p1",
            pluginSlug: "translator-bot",
            name: "Translator Bot",
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects 'generated' install with invalid pluginSlug", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [
          {
            source: "generated",
            ref: "p1",
            pluginSlug: "Invalid Slug!",
            name: "Bad",
            template: "x",
          },
        ],
      });
      expect(r.success).toBe(false);
    });

    it("rejects unknown source value", () => {
      const r = BuildSpecV1.safeParse({
        ...minimal,
        plugins: [
          {
            source: "external",
            ref: "p1",
            pluginSlug: "echo-bot",
          },
        ],
      });
      expect(r.success).toBe(false);
    });
  });
});

