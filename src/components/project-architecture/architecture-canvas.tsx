"use client";

/**
 * Project Architecture Canvas — read-only v1.
 *
 * Renders the topology returned by `getProjectTopology` as an xyflow
 * graph with auto-layout via dagre. Click any node to fire `onSelectNode`
 * (the page wires this to the existing edit dialogs / workflow page).
 *
 * Wave 2 will add drag-from-palette, edge creation, and live diff
 * overlays from the chat panel — those hooks land in this same file.
 *
 * @module components/project-architecture/architecture-canvas
 */

import {
    Background,
    BackgroundVariant,
    Controls,
    MarkerType,
    MiniMap,
    Panel,
    ReactFlow,
    useEdgesState,
    useNodesState,
    type Edge,
    type EdgeTypes,
    type Node,
    type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";

import type {
    ProjectTopology,
    TopologyEdge,
    TopologyEdgeKind,
    TopologyNode,
    TopologyNodeKind,
} from "@/lib/api-client";

import { autoLayout } from "./auto-layout";
import {
    ARCHITECTURE_NODE_TYPES,
    type ArchitectureNodeType,
} from "./nodes";

const NODE_TYPES = ARCHITECTURE_NODE_TYPES as unknown as NodeTypes;
const EDGE_TYPES: EdgeTypes = {};

const KIND_TO_NODE_TYPE: Record<TopologyNodeKind, ArchitectureNodeType> = {
  GATEWAY: "gateway",
  WORKFLOW: "workflow",
  PLUGIN: "plugin",
  HTTP_ROUTE: "http_route",
  SCHEDULE: "schedule",
  SECRET: "secret",
  EXTERNAL_API: "external_api",
  DATABASE: "database",
};

/**
 * Visual styling per edge kind. `style.stroke` is intentionally a CSS
 * variable so the canvas inherits theme accent colours.
 */
const EDGE_STYLES: Record<
  TopologyEdgeKind,
  { stroke: string; strokeDasharray?: string }
> = {
  ROUTE_TO_WORKFLOW: { stroke: "#f97316" },
  ROUTE_TO_PLUGIN: { stroke: "#f97316", strokeDasharray: "4 2" },
  SCHEDULE_TO_WORKFLOW: { stroke: "#f59e0b" },
  WORKFLOW_TO_GATEWAY: { stroke: "#10b981" },
  WORKFLOW_TO_PLUGIN: { stroke: "#10b981", strokeDasharray: "4 2" },
  PLUGIN_TO_GATEWAY: { stroke: "#a78bfa" },
};

export interface ArchitectureCanvasProps {
  topology: ProjectTopology | null;
  /** Fired with the original topology node when the user clicks a node. */
  onSelectNode?: (node: TopologyNode) => void;
  /** Show the minimap — defaults to true. Disable for embedded/preview surfaces. */
  showMinimap?: boolean;
}

function toFlowNode(
  topNode: TopologyNode,
  onSelect: (() => void) | undefined,
): Node {
  return {
    id: topNode.id,
    type: KIND_TO_NODE_TYPE[topNode.kind],
    position: { x: 0, y: 0 }, // overwritten by autoLayout
    // The custom node components cast `data` back to the concrete topology
    // shape — see `nodes.tsx` for the boundary contract.
    data: { ...topNode, onSelect } as unknown as Record<string, unknown>,
    draggable: true,
    selectable: true,
  };
}

function toFlowEdge(topEdge: TopologyEdge): Edge {
  const style = EDGE_STYLES[topEdge.kind];
  return {
    id: topEdge.id,
    source: topEdge.source,
    target: topEdge.target,
    label: topEdge.label,
    animated: false,
    style: { strokeWidth: 1.5, ...style },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: style.stroke,
      width: 16,
      height: 16,
    },
  };
}

export function ArchitectureCanvas({
  topology,
  onSelectNode,
  showMinimap = true,
}: ArchitectureCanvasProps) {
  // Build flow nodes/edges from the topology, applying auto-layout.
  const { laidOutNodes, flowEdges } = useMemo(() => {
    if (!topology) return { laidOutNodes: [] as Node[], flowEdges: [] as Edge[] };

    const onSelectByRef: Record<string, () => void> = {};
    if (onSelectNode) {
      for (const n of topology.nodes) {
        onSelectByRef[n.id] = () => onSelectNode(n);
      }
    }

    const rawNodes = topology.nodes.map((n) => toFlowNode(n, onSelectByRef[n.id]));
    const edges = topology.edges.map(toFlowEdge);
    const laid = autoLayout(rawNodes, edges);
    return { laidOutNodes: laid, flowEdges: edges };
  }, [topology, onSelectNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(laidOutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Re-sync xyflow state when the topology (or layout) changes.
  useEffect(() => {
    setNodes(laidOutNodes);
    setEdges(flowEdges);
  }, [laidOutNodes, flowEdges, setNodes, setEdges]);

  if (!topology) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No topology data.
      </div>
    );
  }

  if (topology.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        This project is empty. Create a Gateway, Workflow, or Resource to see it
        here.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
        {showMinimap ? (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.6)"
            nodeStrokeWidth={2}
          />
        ) : null}
        <Panel position="top-left">
          <div className="rounded-md border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            {topology.counts.nodes} nodes · {topology.counts.edges} edges
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
