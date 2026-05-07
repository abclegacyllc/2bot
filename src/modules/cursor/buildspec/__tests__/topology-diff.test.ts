/**
 * Tests for topology-diff (Phase C2).
 */

import { describe, expect, it } from "vitest";

import type { ProjectTopology, TopologyNode } from "@/modules/project-resource/project-topology.service";
import { BuildSpecV1 } from "../buildspec.schema";

import type { ValidatedBuildSpec } from "../buildspec.types";
import { diffTopology } from "../topology-diff";

function emptyTopology(): ProjectTopology {
  return {
    project: {
      id: "p1",
      name: "Demo",
      slug: "demo",
      kind: "BOT",
      status: "ACTIVE",
    },
    nodes: [],
    edges: [],
    counts: { nodes: 0, edges: 0, byKind: {
      GATEWAY: 0, WORKFLOW: 0, PLUGIN: 0, HTTP_ROUTE: 0,
      SCHEDULE: 0, SECRET: 0, EXTERNAL_API: 0, DATABASE: 0,
    } },
  };
}

function parse(spec: unknown): ValidatedBuildSpec {
  const result = BuildSpecV1.safeParse(spec);
  if (!result.success) throw new Error("spec failed to parse: " + JSON.stringify(result.error.issues));
  return result.data;
}

describe("diffTopology", () => {
  it("classifies all spec items as 'add' against an empty topology", () => {
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [
        { source: "new", ref: "tg", name: "TG main", type: "TELEGRAM_BOT", credentials: { botToken: "t" } },
      ],
      plugins: [{ source: "marketplace", ref: "p1", pluginSlug: "echo-bot" }],
      workflows: [{ ref: "w1", name: "Echo", slug: "echo-flow", triggerType: "TELEGRAM_MESSAGE", gateways: [{ gatewayRef: "tg" }] }],
      resources: [
        { ref: "r1", kind: "SECRET", name: "OpenAI", secret: { key: "OPENAI_API_KEY", value: "x" } },
      ],
    });
    const diff = diffTopology(emptyTopology(), spec);
    expect(diff.counts.add).toBe(4);
    expect(diff.counts.match).toBe(0);
    expect(diff.counts.modify).toBe(0);
    expect(diff.counts.addByKind.GATEWAY).toBe(1);
    expect(diff.counts.addByKind.WORKFLOW).toBe(1);
    expect(diff.counts.addByKind.PLUGIN).toBe(1);
    expect(diff.counts.addByKind.SECRET).toBe(1);
  });

  it("classifies a workflow with the same slug as 'match'", () => {
    const topology = emptyTopology();
    topology.nodes.push({
      id: "workflow:w1",
      kind: "WORKFLOW",
      label: "Echo",
      refId: "w1",
      data: { triggerType: "TELEGRAM_MESSAGE", status: "ACTIVE", isEnabled: true, slug: "echo-flow" },
    });
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [{ source: "new", ref: "tg", name: "TG main", type: "TELEGRAM_BOT", credentials: { botToken: "t" } }],
      workflows: [{ ref: "w1", name: "Echo", slug: "echo-flow", triggerType: "TELEGRAM_MESSAGE", gateways: [{ gatewayRef: "tg" }] }],
    });
    const diff = diffTopology(topology, spec);
    const wfEntry = diff.entries.find((e) => e.projected.kind === "WORKFLOW");
    expect(wfEntry?.status).toBe("match");
  });

  it("classifies a workflow with the same slug but different triggerType as 'modify'", () => {
    const topology = emptyTopology();
    topology.nodes.push({
      id: "workflow:w1",
      kind: "WORKFLOW",
      label: "Echo",
      refId: "w1",
      data: { triggerType: "MANUAL", status: "ACTIVE", isEnabled: true, slug: "echo-flow" },
    });
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [{ source: "new", ref: "tg", name: "TG main", type: "TELEGRAM_BOT", credentials: { botToken: "t" } }],
      workflows: [{ ref: "w1", name: "Echo", slug: "echo-flow", triggerType: "TELEGRAM_MESSAGE", gateways: [{ gatewayRef: "tg" }] }],
    });
    const diff = diffTopology(topology, spec);
    const wfEntry = diff.entries.find((e) => e.projected.kind === "WORKFLOW");
    expect(wfEntry?.status).toBe("modify");
    if (wfEntry?.status === "modify") {
      expect(wfEntry.changedFields).toContain("triggerType");
    }
  });

  it("matches existing gateway by id when source==='existing'", () => {
    const topology = emptyTopology();
    topology.nodes.push({
      id: "gateway:gw1",
      kind: "GATEWAY",
      label: "Existing TG",
      refId: "gw1",
      data: { type: "TELEGRAM_BOT", status: "CONNECTED", resourceId: null },
    } as TopologyNode);
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [{ source: "existing", ref: "tg", id: "gw1" }],
    });
    const diff = diffTopology(topology, spec);
    expect(diff.counts.match).toBe(1);
    expect(diff.counts.add).toBe(0);
  });

  it("matches a plugin install by pluginSlug", () => {
    const topology = emptyTopology();
    topology.nodes.push({
      id: "plugin:up1",
      kind: "PLUGIN",
      label: "echo-bot",
      refId: "up1",
      data: { pluginSlug: "echo-bot", pluginName: "Echo Bot", isEnabled: true, gatewayId: null },
    });
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [{ source: "new", ref: "tg", name: "TG", type: "TELEGRAM_BOT", credentials: { botToken: "t" } }],
      plugins: [{ source: "marketplace", ref: "p1", pluginSlug: "echo-bot" }],
    });
    const diff = diffTopology(topology, spec);
    const pluginEntry = diff.entries.find((e) => e.projected.kind === "PLUGIN");
    expect(pluginEntry?.status).toBe("match");
  });

  it("matches HTTP_ROUTE by method+path and SCHEDULE by cron", () => {
    const topology = emptyTopology();
    topology.nodes.push(
      {
        id: "resource:r1",
        kind: "HTTP_ROUTE",
        label: "Hello",
        refId: "r1",
        data: { status: "ACTIVE", method: "GET", path: "/hello", targetWorkflowId: "w1", targetUserPluginId: null },
      },
      {
        id: "resource:r2",
        kind: "SCHEDULE",
        label: "Daily",
        refId: "r2",
        data: { status: "ACTIVE", cron: "0 9 * * *", timezone: "UTC", enabled: true, targetWorkflowId: "w1" },
      },
    );
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "WEB_APP" },
      gateways: [{ source: "new", ref: "tg", name: "TG", type: "TELEGRAM_BOT", credentials: { botToken: "t" } }],
      workflows: [{ ref: "w1", name: "Echo", slug: "echo-flow", triggerType: "WEBHOOK", gateways: [{ gatewayRef: "tg" }] }],
      resources: [
        { ref: "r1", kind: "HTTP_ROUTE", name: "Hello", httpRoute: { method: "GET", path: "/hello", targetWorkflowRef: "w1" } },
        { ref: "r2", kind: "SCHEDULE", name: "Daily", schedule: { cron: "0 9 * * *", targetWorkflowRef: "w1" } },
      ],
    });
    const diff = diffTopology(topology, spec);
    const route = diff.entries.find((e) => e.projected.kind === "HTTP_ROUTE");
    const sched = diff.entries.find((e) => e.projected.kind === "SCHEDULE");
    expect(route?.status).toBe("match");
    expect(sched?.status).toBe("match");
  });

  it("flags 'add' when an existing gateway id is referenced but not in the topology", () => {
    const spec = parse({
      version: 1,
      project: { name: "Demo", slug: "demo", kind: "BOT" },
      gateways: [{ source: "existing", ref: "tg", id: "missing-id" }],
    });
    const diff = diffTopology(emptyTopology(), spec);
    expect(diff.counts.add).toBe(1);
  });
});
