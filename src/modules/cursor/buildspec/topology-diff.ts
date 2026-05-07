/**
 * Topology Diff (Phase C2)
 *
 * Pure function: given a current `ProjectTopology` (from
 * `project-topology.service`) and a `ValidatedBuildSpec`, project the spec
 * into the topology node space and classify each projected node as:
 *
 *   - "add"      — no matching node exists in the current topology.
 *   - "match"    — a node exists and the projected attributes are unchanged.
 *   - "modify"   — a node exists but at least one attribute differs.
 *
 * Used by the architecture canvas to overlay an apply preview before the
 * user clicks "Apply BuildSpec". Wave-1 BuildSpecs are additive — nothing
 * is ever removed by an apply — so this diff intentionally does NOT produce
 * a "remove" set.
 *
 * Matching keys per kind (best-effort, deterministic):
 *   GATEWAY      → existingId (when source==="existing") OR label (name)
 *   WORKFLOW     → slug
 *   PLUGIN       → pluginSlug
 *   HTTP_ROUTE   → method + path
 *   SCHEDULE     → cron expression
 *   SECRET       → key
 *   EXTERNAL_API → baseUrl
 *   DATABASE     → host + database
 *
 * @module modules/cursor/buildspec/topology-diff
 */

import type {
    GatewayNode,
    ProjectTopology,
    TopologyNode,
    TopologyNodeKind,
} from "@/modules/project-resource/project-topology.service";

import type { ValidatedBuildSpec } from "./buildspec.types";

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────

export interface ProjectedNode {
  /** Spec-local ref (e.g. "tg-main") OR — for resources without a ref in the
   *  diff context — a synthetic key. Used for stable React keys in the UI. */
  specRef: string;
  kind: TopologyNodeKind;
  /** Display label (gateway/workflow/plugin/resource name). */
  label: string;
  /** Lightweight per-kind preview attributes; mirrors the canvas node's
   *  `data` field for the kinds the spec can describe. */
  data: Record<string, unknown>;
}

export interface DiffEntryAdd {
  status: "add";
  projected: ProjectedNode;
}

export interface DiffEntryMatch {
  status: "match";
  projected: ProjectedNode;
  current: TopologyNode;
}

export interface DiffEntryModify {
  status: "modify";
  projected: ProjectedNode;
  current: TopologyNode;
  /** Names of `data` fields whose value differs between projected & current. */
  changedFields: string[];
}

export type DiffEntry = DiffEntryAdd | DiffEntryMatch | DiffEntryModify;

export interface TopologyDiff {
  /** All projected nodes, classified. Ordered by kind then by spec order. */
  entries: DiffEntry[];
  counts: {
    add: number;
    modify: number;
    match: number;
    /** Per-kind add counts — useful for canvas badges. */
    addByKind: Partial<Record<TopologyNodeKind, number>>;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a `TopologyDiff` from the current topology + a validated BuildSpec.
 * Pure — no I/O, safe to call from server actions or unit tests.
 */
export function diffTopology(
  current: ProjectTopology,
  spec: ValidatedBuildSpec,
): TopologyDiff {
  const entries: DiffEntry[] = [];

  // Index current nodes by kind for O(1) lookup during projection.
  const byKind = indexByKind(current.nodes);

  // ── Gateways ─────────────────────────────────────────────────────
  for (const gw of spec.gateways) {
    if (gw.source === "existing") {
      // Reference to a real gateway by DB id — match by refId.
      const match = byKind.GATEWAY.find((n) => n.refId === gw.id);
      const projected: ProjectedNode = {
        specRef: gw.ref,
        kind: "GATEWAY",
        label: match?.label ?? gw.id,
        data: {},
      };
      if (!match) {
        // Spec references an id that doesn't exist in the current topology;
        // surface as add so the UI can flag the broken reference.
        entries.push({ status: "add", projected });
      } else {
        entries.push({ status: "match", projected, current: match });
      }
      continue;
    }

    // source === "new" — match by display label (name).
    const projected: ProjectedNode = {
      specRef: gw.ref,
      kind: "GATEWAY",
      label: gw.name,
      data: { type: gw.type },
    };
    const match = byKind.GATEWAY.find((n) => n.label === gw.name) as
      | GatewayNode
      | undefined;
    if (!match) {
      entries.push({ status: "add", projected });
    } else {
      entries.push(classifyMatch(projected, match, ["type"]));
    }
  }

  // ── Workflows ────────────────────────────────────────────────────
  for (const wf of spec.workflows) {
    const projected: ProjectedNode = {
      specRef: wf.ref,
      kind: "WORKFLOW",
      label: wf.name,
      data: { triggerType: wf.triggerType, slug: wf.slug },
    };
    const match = byKind.WORKFLOW.find(
      (n) => n.kind === "WORKFLOW" && n.data.slug === wf.slug,
    );
    if (!match) {
      entries.push({ status: "add", projected });
    } else {
      entries.push(classifyMatch(projected, match, ["triggerType", "slug"]));
    }
  }

  // ── Plugins (UserPlugin installs) ────────────────────────────────
  for (const plugin of spec.plugins) {
    const projected: ProjectedNode = {
      specRef: plugin.ref,
      kind: "PLUGIN",
      label: plugin.source === "generated" ? plugin.name : plugin.pluginSlug,
      data: { pluginSlug: plugin.pluginSlug },
    };
    const match = byKind.PLUGIN.find(
      (n) => n.kind === "PLUGIN" && n.data.pluginSlug === plugin.pluginSlug,
    );
    if (!match) {
      entries.push({ status: "add", projected });
    } else {
      entries.push(classifyMatch(projected, match, ["pluginSlug"]));
    }
  }

  // ── Resources ────────────────────────────────────────────────────
  for (const res of spec.resources) {
    switch (res.kind) {
      case "HTTP_ROUTE": {
        const projected: ProjectedNode = {
          specRef: res.ref,
          kind: "HTTP_ROUTE",
          label: res.name,
          data: { method: res.httpRoute.method, path: res.httpRoute.path },
        };
        const match = byKind.HTTP_ROUTE.find(
          (n) =>
            n.kind === "HTTP_ROUTE" &&
            n.data.method === res.httpRoute.method &&
            n.data.path === res.httpRoute.path,
        );
        if (!match) entries.push({ status: "add", projected });
        else entries.push(classifyMatch(projected, match, ["method", "path"]));
        break;
      }
      case "SCHEDULE": {
        const projected: ProjectedNode = {
          specRef: res.ref,
          kind: "SCHEDULE",
          label: res.name,
          data: { cron: res.schedule.cron },
        };
        const match = byKind.SCHEDULE.find(
          (n) => n.kind === "SCHEDULE" && n.data.cron === res.schedule.cron,
        );
        if (!match) entries.push({ status: "add", projected });
        else entries.push(classifyMatch(projected, match, ["cron"]));
        break;
      }
      case "SECRET": {
        const projected: ProjectedNode = {
          specRef: res.ref,
          kind: "SECRET",
          label: res.name,
          data: { key: res.secret.key },
        };
        const match = byKind.SECRET.find(
          (n) => n.kind === "SECRET" && n.data.key === res.secret.key,
        );
        if (!match) entries.push({ status: "add", projected });
        else entries.push(classifyMatch(projected, match, ["key"]));
        break;
      }
      case "EXTERNAL_API": {
        const projected: ProjectedNode = {
          specRef: res.ref,
          kind: "EXTERNAL_API",
          label: res.name,
          data: { baseUrl: res.externalApi.baseUrl },
        };
        const match = byKind.EXTERNAL_API.find(
          (n) =>
            n.kind === "EXTERNAL_API" &&
            n.data.baseUrl === res.externalApi.baseUrl,
        );
        if (!match) entries.push({ status: "add", projected });
        else entries.push(classifyMatch(projected, match, ["baseUrl"]));
        break;
      }
      case "DATABASE": {
        const projected: ProjectedNode = {
          specRef: res.ref,
          kind: "DATABASE",
          label: res.name,
          data: {
            host: res.database.host,
            database: res.database.database,
            driver: res.database.driver,
          },
        };
        const match = byKind.DATABASE.find(
          (n) =>
            n.kind === "DATABASE" &&
            n.data.host === res.database.host &&
            n.data.database === res.database.database,
        );
        if (!match) entries.push({ status: "add", projected });
        else entries.push(classifyMatch(projected, match, ["host", "database", "driver"]));
        break;
      }
    }
  }

  return { entries, counts: tally(entries) };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function indexByKind(
  nodes: TopologyNode[],
): Record<TopologyNodeKind, TopologyNode[]> {
  const empty: Record<TopologyNodeKind, TopologyNode[]> = {
    GATEWAY: [],
    WORKFLOW: [],
    PLUGIN: [],
    HTTP_ROUTE: [],
    SCHEDULE: [],
    SECRET: [],
    EXTERNAL_API: [],
    DATABASE: [],
  };
  for (const node of nodes) empty[node.kind].push(node);
  return empty;
}

function classifyMatch(
  projected: ProjectedNode,
  current: TopologyNode,
  fields: string[],
): DiffEntryMatch | DiffEntryModify {
  const changed: string[] = [];
  const currentData = (current.data ?? {}) as Record<string, unknown>;
  for (const field of fields) {
    if (projected.data[field] !== currentData[field]) {
      changed.push(field);
    }
  }
  if (projected.label !== current.label) changed.push("label");
  if (changed.length === 0) {
    return { status: "match", projected, current };
  }
  return { status: "modify", projected, current, changedFields: changed };
}

function tally(entries: DiffEntry[]): TopologyDiff["counts"] {
  const counts: TopologyDiff["counts"] = {
    add: 0,
    modify: 0,
    match: 0,
    addByKind: {},
  };
  for (const e of entries) {
    counts[e.status] += 1;
    if (e.status === "add") {
      counts.addByKind[e.projected.kind] =
        (counts.addByKind[e.projected.kind] ?? 0) + 1;
    }
  }
  return counts;
}
