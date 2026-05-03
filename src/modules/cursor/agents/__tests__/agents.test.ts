/**
 * Agent System Tests
 *
 * Covers frontmatter parsing, bundle expansion, agent loading, registry
 * lookups, and prompt rendering against the live skill registry.
 *
 * @module modules/cursor/agents/__tests__/agents.test
 */

import { describe, expect, it } from "vitest";

import { ALL_TOOL_NAMES } from "../../cursor-worker-tools";
import type { WorkerPromptContext } from "../../cursor-workers";
import { defaultConfigForRuntime, resolveAgentConfig } from "../agent-config";
import { AgentLoadError, loadAgent } from "../agent-loader";
import {
    DEFAULT_AGENT_NAME,
    getAgent,
    getDefaultAgent,
    getFallbackAgent,
    listAgents,
    listUserInvocableAgents,
    summarizeAgent,
} from "../agent-registry";
import { splitFrontmatter } from "../frontmatter";
import { renderAgentPrompt } from "../prompt-renderer";
import { BUNDLE_NAMES, expandToolList, TOOL_BUNDLES } from "../tool-bundles";
import { resolveAgentTools } from "../tool-resolver";

const BASE_CTX: WorkerPromptContext = {
  task: "Test task",
};

describe("frontmatter parser", () => {
  it("returns body unchanged when no frontmatter is present", () => {
    const { data, body } = splitFrontmatter("hello world");
    expect(data).toEqual({});
    expect(body).toBe("hello world");
  });

  it("parses scalars, booleans, nulls, numbers", () => {
    const { data } = splitFrontmatter(
      `---\nname: agent\nready: true\nlimit: 42\nnote: ~\n---\nbody`,
    );
    expect(data["name"]).toBe("agent");
    expect(data["ready"]).toBe(true);
    expect(data["limit"]).toBe(42);
    expect(data["note"]).toBeNull();
  });

  it("parses inline arrays and block arrays of scalars", () => {
    const { data } = splitFrontmatter(
      `---\ninline: [a, b, "c d"]\nblock:\n  - one\n  - two\n---\n`,
    );
    expect(data["inline"]).toEqual(["a", "b", "c d"]);
    expect(data["block"]).toEqual(["one", "two"]);
  });

  it("parses arrays of objects (handoffs shape)", () => {
    const { data } = splitFrontmatter(
      `---\nhandoffs:\n  - label: Run\n    agent: agent\n    prompt: do it\n  - label: Plan\n    agent: plan\n    prompt: think\n---\n`,
    );
    expect(data["handoffs"]).toEqual([
      { label: "Run", agent: "agent", prompt: "do it" },
      { label: "Plan", agent: "plan", prompt: "think" },
    ]);
  });

  it("rejects tabs in indentation", () => {
    expect(() => splitFrontmatter(`---\n\tname: x\n---\n`)).toThrow(/Tabs/);
  });

  it("rejects unclosed frontmatter", () => {
    expect(() => splitFrontmatter(`---\nname: agent\nbody`)).toThrow(
      /not closed/,
    );
  });
});

describe("tool bundles", () => {
  it("exposes a non-empty bundle catalog", () => {
    expect(BUNDLE_NAMES.length).toBeGreaterThan(5);
    for (const id of BUNDLE_NAMES) {
      expect(TOOL_BUNDLES[id]!.length).toBeGreaterThan(0);
    }
  });

  it("expands bundles and dedupes", () => {
    const expanded = expandToolList(["workspace-read", "workspace-read"]);
    const unique = new Set(expanded);
    expect(unique.size).toBe(expanded.length);
  });

  it("supports `!tool` exclusions", () => {
    const expanded = expandToolList(["workspace-write", "!delete_file"]);
    expect(expanded).not.toContain("delete_file");
    expect(expanded).toContain("write_file");
  });

  it("preserves insertion order of bundles", () => {
    const expanded = expandToolList(["interaction", "workspace-read"]);
    const askIdx = expanded.indexOf("ask_user");
    const readIdx = expanded.indexOf("read_file");
    expect(askIdx).toBeLessThan(readIdx);
  });

  it("only references real tools", () => {
    const known = new Set(ALL_TOOL_NAMES);
    for (const id of BUNDLE_NAMES) {
      for (const name of TOOL_BUNDLES[id]!) {
        expect(known.has(name), `${id} references unknown tool: ${name}`).toBe(
          true,
        );
      }
    }
  });
});

describe("agent loader", () => {
  const known = new Set(ALL_TOOL_NAMES);

  it("loads a minimal valid agent", () => {
    const md = `---\nname: hello\ndescription: Says hi.\n---\nbody`;
    const agent = loadAgent(md, { knownTools: known });
    expect(agent.frontmatter.name).toBe("hello");
    expect(agent.frontmatter.userInvocable).toBe(true);
    expect(agent.frontmatter.displayName).toBe("Hello");
    expect(agent.toolNames).toEqual([]);
    expect(agent.body).toBe("body");
  });

  it("rejects missing name", () => {
    expect(() =>
      loadAgent(`---\ndescription: nope\n---\n`, { knownTools: known }),
    ).toThrow(AgentLoadError);
  });

  it("rejects missing description", () => {
    expect(() =>
      loadAgent(`---\nname: x\n---\n`, { knownTools: known }),
    ).toThrow(AgentLoadError);
  });

  it("rejects invalid name shape", () => {
    expect(() =>
      loadAgent(`---\nname: BadName\ndescription: x\n---\n`, {
        knownTools: known,
      }),
    ).toThrow(/lowercase/);
  });

  it("rejects unknown tool / bundle references", () => {
    expect(() =>
      loadAgent(
        `---\nname: x\ndescription: y\ntools: [not-a-real-bundle-or-tool]\n---\n`,
        { knownTools: known },
      ),
    ).toThrow(/unknown tool or bundle/);
  });

  it("expands bundle references in tools", () => {
    const md = `---\nname: x\ndescription: y\ntools:\n  - workspace-read\n  - finish\n---\n`;
    const agent = loadAgent(md, { knownTools: known });
    expect(agent.toolNames).toContain("read_file");
    expect(agent.toolNames).toContain("finish");
  });

  it("validates handoffs shape", () => {
    expect(() =>
      loadAgent(
        `---\nname: x\ndescription: y\nhandoffs:\n  - label: Run\n    prompt: go\n---\n`,
        { knownTools: known },
      ),
    ).toThrow(/string `label`, `agent`/);
  });
});

describe("agent registry", () => {
  it("registers all built-ins (incl. legacy-assistant fallback)", () => {
    const names = listAgents().map((a) => a.frontmatter.name).sort();
    expect(names).toEqual(["agent", "ask", "builder", "explore", "legacy-assistant", "plan"]);
  });

  it("default agent is `agent`", () => {
    expect(getDefaultAgent().frontmatter.name).toBe(DEFAULT_AGENT_NAME);
  });

  it("hides explore and legacy-assistant from the user dropdown", () => {
    const visible = listUserInvocableAgents().map((a) => a.frontmatter.name);
    expect(visible).not.toContain("explore");
    expect(visible).not.toContain("legacy-assistant");
    expect(visible).toContain("agent");
    expect(visible).toContain("ask");
    expect(visible).toContain("plan");
  });

  it("Plan agent advertises Start Implementation handoff", () => {
    const plan = getAgent("plan")!;
    const labels = (plan.frontmatter.handoffs ?? []).map((h) => h.label);
    expect(labels).toContain("Start Implementation");
  });

  it("summarizeAgent returns dropdown-ready shape", () => {
    const summary = summarizeAgent(getDefaultAgent());
    expect(summary.name).toBe("agent");
    expect(summary.userInvocable).toBe(true);
    expect(summary.toolCount).toBeGreaterThan(0);
  });

  it("Ask agent has read-only tools (no write_file)", () => {
    const ask = getAgent("ask")!;
    expect(ask.toolNames).not.toContain("write_file");
    expect(ask.toolNames).not.toContain("delete_file");
    expect(ask.toolNames).toContain("read_file");
  });
});

describe("prompt renderer", () => {
  it("resolves known skill placeholders to real content", () => {
    const agent = getAgent("ask")!;
    const out = renderAgentPrompt(agent, BASE_CTX);
    expect(out).not.toContain("{{skill:");
    expect(out.toLowerCase()).toContain("cursor assistant");
    expect(out).toContain("Mode: Ask");
  });

  it("drops unknown placeholders without throwing", () => {
    const md = `---\nname: t\ndescription: t\n---\nbefore\n{{skill:does-not-exist}}\nafter`;
    const agent = loadAgent(md);
    const out = renderAgentPrompt(agent, BASE_CTX);
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).not.toContain("{{skill:");
  });
});

describe("tool resolver", () => {
  it("returns real WorkerToolDefinitions for an agent", () => {
    const agent = getDefaultAgent();
    const defs = resolveAgentTools(agent);
    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      expect(typeof def.name).toBe("string");
      expect(typeof def.description).toBe("string");
    }
    const names = new Set(defs.map((d) => d.name));
    expect(names.has("read_file")).toBe(true);
    expect(names.has("finish")).toBe(true);
  });

  it("adds workflow-edit tools to non-coder agents when workflow context is open", () => {
    const ask = getAgent("ask")!;
    const without = resolveAgentTools(ask, { hasWorkflowContext: false }).map(
      (d) => d.name,
    );
    const withWf = resolveAgentTools(ask, { hasWorkflowContext: true }).map(
      (d) => d.name,
    );
    expect(without).not.toContain("add_workflow_step");
    expect(withWf).toContain("add_workflow_step");
  });
});

describe("agent execution config (Phase 6)", () => {
  it("resolves the built-in `agent` to coder defaults plus its overrides", () => {
    const cfg = resolveAgentConfig(getAgent("agent")!);
    expect(cfg.runtime).toBe("coder");
    expect(cfg.maxCreditsPerSession).toBe(30);
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.allowLiteRouting).toBe(false);
    expect(cfg.fullModelAfterTurn).toBe(3);
    expect(cfg.needsWorkspace).toBe(true);
    expect(cfg.pluginEdit).toBe(true);
  });

  it("resolves the built-in `ask` to assistant-flavored config", () => {
    const cfg = resolveAgentConfig(getAgent("ask")!);
    expect(cfg.runtime).toBe("assistant");
    expect(cfg.maxCreditsPerSession).toBe(15);
    expect(cfg.temperature).toBe(0.4);
    expect(cfg.allowLiteRouting).toBe(true);
    expect(cfg.needsWorkspace).toBe(false);
    expect(cfg.pluginEdit).toBe(false);
    // Assistant runtime keeps lite-routing past the whole loop.
    expect(cfg.fullModelAfterTurn).toBe(Number.POSITIVE_INFINITY);
  });

  it("frontmatter overrides win over runtime defaults", () => {
    const agent = loadAgent(`---
name: custom
description: Custom agent
runtime: coder
maxCredits: 200
temperature: 0.7
liteRouting: true
fullModelAfterTurn: 9
---
body`);
    const cfg = resolveAgentConfig(agent);
    expect(cfg.maxCreditsPerSession).toBe(200);
    expect(cfg.temperature).toBe(0.7);
    expect(cfg.allowLiteRouting).toBe(true);
    expect(cfg.fullModelAfterTurn).toBe(9);
  });

  it("rejects out-of-range temperature", () => {
    expect(() =>
      loadAgent(`---
name: bad
description: x
temperature: 3
---
body`),
    ).toThrow(AgentLoadError);
  });

  it("rejects negative or zero credit budgets", () => {
    expect(() =>
      loadAgent(`---
name: bad
description: x
maxCredits: 0
---
body`),
    ).toThrow(AgentLoadError);
  });

  it("defaultConfigForRuntime mirrors WORKER_META credits per runtime", () => {
    expect(defaultConfigForRuntime("assistant").maxCreditsPerSession).toBe(10);
    expect(defaultConfigForRuntime("coder").maxCreditsPerSession).toBe(30);
    expect(defaultConfigForRuntime("assistant").allowLiteRouting).toBe(true);
    expect(defaultConfigForRuntime("coder").allowLiteRouting).toBe(false);
  });

  it("getFallbackAgent maps assistant runtime to legacy-assistant and coder to default agent", () => {
    expect(getFallbackAgent("assistant").frontmatter.name).toBe("legacy-assistant");
    expect(getFallbackAgent("coder").frontmatter.name).toBe(DEFAULT_AGENT_NAME);
  });

  it("legacy-assistant fallback renders a non-empty prompt with assistant skills", () => {
    const fallback = getFallbackAgent("assistant");
    const rendered = renderAgentPrompt(fallback, BASE_CTX);
    expect(rendered.length).toBeGreaterThan(0);
    // Spot-check: assistant identity skill should be expanded (no raw {{skill:}} left).
    expect(rendered).not.toMatch(/\{\{\s*skill:/);
  });
});
