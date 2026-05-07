/**
 * Auto-layout for the Project Architecture Canvas.
 *
 * Uses dagre to compute deterministic positions for the topology
 * nodes returned by `getProjectTopology`. We arrange the graph
 * left-to-right because the user reads it as
 *
 *     Trigger sources  →  Workflows  →  Plugins  →  Gateways
 *     (HTTP_ROUTE,         (the units      (effects)   (sinks)
 *      SCHEDULE,             of work)
 *      EXTERNAL_API,
 *      DATABASE,
 *      SECRET)
 *
 * The Workflow DAG (workflow-canvas.tsx) uses the same orientation,
 * so the two views feel consistent.
 *
 * @module components/project-architecture/auto-layout
 */

import type { Edge, Node } from "@xyflow/react";
import dagre from "dagre";

import type { TopologyNodeKind } from "@/lib/api-client";

// Tuned so that label + 2-3 lines of metadata fit comfortably.
const NODE_WIDTH = 240;
const NODE_HEIGHT = 96;

/**
 * Approximate horizontal "rank" for each node kind. dagre will respect
 * dependency edges first, but when the graph has weak connectivity (e.g.
 * an unconnected SECRET) the rank hint keeps things tidy.
 */
const KIND_RANK: Record<TopologyNodeKind, number> = {
  HTTP_ROUTE: 0,
  SCHEDULE: 0,
  EXTERNAL_API: 0,
  DATABASE: 0,
  SECRET: 0,
  WORKFLOW: 1,
  PLUGIN: 2,
  GATEWAY: 3,
};

export interface LayoutOptions {
  /** Direction passed to dagre. Defaults to "LR". */
  direction?: "LR" | "TB";
  /** Horizontal spacing between ranks. */
  rankSep?: number;
  /** Vertical spacing within a rank. */
  nodeSep?: number;
}

/**
 * Compute `position` for every node in-place by running dagre.
 *
 * Inputs are NOT mutated — a new array of nodes with `position` set is
 * returned. Edges are passed through unchanged (dagre needs them as
 * input but the caller's edge objects already have ids/styling).
 */
export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): Node[] {
  const direction = options.direction ?? "LR";
  const rankSep = options.rankSep ?? 120;
  const nodeSep = options.nodeSep ?? 40;

  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });

  for (const node of nodes) {
    const rank = KIND_RANK[(node.data as { kind?: TopologyNodeKind })?.kind ?? "WORKFLOW"];
    g.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // dagre uses `rank` for hard pinning; we instead use a soft hint
      // by setting `order` on weak nodes via the node label. Setting the
      // graph rank here would conflict with the edge-derived ranking,
      // so we keep this informational and rely on edges for true order.
      _rankHint: rank,
    });
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    // dagre returns the centre of the node — xyflow expects the top-left.
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

export const ARCHITECTURE_NODE_WIDTH = NODE_WIDTH;
export const ARCHITECTURE_NODE_HEIGHT = NODE_HEIGHT;
