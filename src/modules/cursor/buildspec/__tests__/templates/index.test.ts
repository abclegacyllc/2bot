/**
 * Code Template Library — registry + renderTemplate tests.
 *
 * Pure-function tests (no DB, no FS). Covers:
 *   - registry listing / lookup
 *   - happy-path render for each registered template
 *   - input validation via zod
 *   - slug / file-path safety guards
 *   - manifest <-> result self-consistency
 *
 * @module modules/cursor/buildspec/__tests__/templates/index.test
 */

import { describe, expect, it } from "vitest";

import {
    getTemplate,
    hasTemplate,
    listTemplates,
    renderTemplate,
    TemplateInputError,
    TemplateNotFoundError,
} from "../../templates";

describe("template registry", () => {
  it("lists at least the two starter templates", () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain("telegram-echo-javascript");
    expect(ids).toContain("webhook-handler-javascript");
  });

  it("hasTemplate / getTemplate work for a known id", () => {
    expect(hasTemplate("telegram-echo-javascript")).toBe(true);
    expect(getTemplate("telegram-echo-javascript").id).toBe(
      "telegram-echo-javascript",
    );
  });

  it("getTemplate throws TemplateNotFoundError for unknown ids", () => {
    expect(() => getTemplate("does-not-exist")).toThrow(TemplateNotFoundError);
  });

  it("listTemplates returns a defensive copy of requiredGateways", () => {
    const a = listTemplates();
    const b = listTemplates();
    expect(a[0]?.requiredGateways).not.toBe(b[0]?.requiredGateways);
  });
});

describe("renderTemplate — common guards", () => {
  it("throws TemplateNotFoundError for unknown templateId", () => {
    expect(() =>
      renderTemplate({
        templateId: "nope",
        slug: "x",
        name: "X",
      }),
    ).toThrow(TemplateNotFoundError);
  });

  it("rejects an invalid slug", () => {
    expect(() =>
      renderTemplate({
        templateId: "telegram-echo-javascript",
        slug: "Has Spaces",
        name: "X",
      }),
    ).toThrow(TemplateInputError);
  });

  it("rejects an empty plugin name", () => {
    expect(() =>
      renderTemplate({
        templateId: "telegram-echo-javascript",
        slug: "ok",
        name: "",
      }),
    ).toThrow(TemplateInputError);
  });

  it("collects zod issues in TemplateInputError.issues", () => {
    try {
      renderTemplate({
        templateId: "telegram-echo-javascript",
        slug: "ok",
        name: "Echo",
        inputs: { greeting: "" }, // min(1) violation
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateInputError);
      const e = err as TemplateInputError;
      expect(e.issues.length).toBeGreaterThan(0);
      expect(e.issues.join("\n")).toMatch(/greeting/);
    }
  });
});

describe("telegram-echo-javascript template", () => {
  it("renders manifest, entry, README with safe paths", () => {
    const result = renderTemplate({
      templateId: "telegram-echo-javascript",
      slug: "echo-bot",
      name: "Echo Bot",
      inputs: { greeting: "Hello,", respondInGroups: false },
    });

    // Top-level metadata
    expect(result.slug).toBe("echo-bot");
    expect(result.entryFile).toBe("index.js");
    expect(result.manifest.slug).toBe("echo-bot");
    expect(result.manifest.entryFile).toBe("index.js");
    expect(result.manifest.requiredGateways).toEqual(["TELEGRAM_BOT"]);

    // File set
    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual(["plugin.json", "index.js", "README.md"]);

    // plugin.json must round-trip as JSON and match the manifest
    const pluginJsonFile = result.files.find((f) => f.path === "plugin.json");
    expect(pluginJsonFile).toBeDefined();
    const parsed = JSON.parse(pluginJsonFile!.content);
    expect(parsed.slug).toBe("echo-bot");
    expect(parsed.entryFile).toBe("index.js");

    // index.js must reference the configured greeting
    const entry = result.files.find((f) => f.path === "index.js")!.content;
    expect(entry).toContain("Hello,");
    expect(entry).toContain("module.exports.onMessage");
  });

  it("applies zod defaults when inputs omitted", () => {
    const result = renderTemplate({
      templateId: "telegram-echo-javascript",
      slug: "echo",
      name: "Echo",
    });
    const entry = result.files.find((f) => f.path === "index.js")!.content;
    // Default greeting is "👋"
    expect(entry).toContain("👋");
  });

  it("rejects greeting longer than 120 chars", () => {
    expect(() =>
      renderTemplate({
        templateId: "telegram-echo-javascript",
        slug: "echo",
        name: "Echo",
        inputs: { greeting: "x".repeat(121) },
      }),
    ).toThrow(TemplateInputError);
  });
});

describe("webhook-handler-javascript template", () => {
  it("renders a complete webhook plugin bundle", () => {
    const result = renderTemplate({
      templateId: "webhook-handler-javascript",
      slug: "incoming-webhook",
      name: "Incoming Webhook",
      inputs: { defaultResponse: { ok: true, source: "ai" }, logRequests: true },
    });

    expect(result.manifest.requiredGateways).toEqual([]);
    expect(result.manifest.eventTypes).toContain("http.request");

    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual(["plugin.json", "index.js", "README.md"]);

    const entry = result.files.find((f) => f.path === "index.js")!.content;
    expect(entry).toContain("module.exports.onHttpRequest");
    expect(entry).toContain('"source":"ai"');
  });

  it("accepts an empty defaultResponse object", () => {
    const result = renderTemplate({
      templateId: "webhook-handler-javascript",
      slug: "wh",
      name: "WH",
      inputs: { defaultResponse: {} },
    });
    expect(result.manifest.slug).toBe("wh");
  });
});

describe("manifest self-consistency invariants", () => {
  it.each(["telegram-echo-javascript", "webhook-handler-javascript"])(
    "%s: manifest.slug === result.slug and entryFile matches",
    (templateId) => {
      const result = renderTemplate({
        templateId,
        slug: "consistency-test",
        name: "Consistency Test",
      });
      expect(result.manifest.slug).toBe(result.slug);
      expect(result.manifest.entryFile).toBe(result.entryFile);
      // Every rendered file path is bundle-relative and free of traversal.
      for (const f of result.files) {
        expect(f.path.startsWith("/")).toBe(false);
        expect(f.path.includes("..")).toBe(false);
        expect(f.path.includes("\\")).toBe(false);
      }
    },
  );
});
