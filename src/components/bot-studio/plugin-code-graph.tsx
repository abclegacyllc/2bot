"use client";

/**
 * Plugin Code Graph
 *
 * React Flow subcanvas that visualizes the import dependency graph
 * of a plugin's source files. Shown inside the step detail panel
 * when the user clicks the "Code" tab.
 *
 * Lazy-loaded: file contents are fetched only when this component mounts.
 *
 * @module components/bot-studio/plugin-code-graph
 */

import {
    Background,
    BackgroundVariant,
    BaseEdge,
    Controls,
    Handle,
    MarkerType,
    Panel,
    Position,
    ReactFlow,
    ReactFlowProvider,
    getSmoothStepPath,
    type Edge,
    type EdgeProps,
    type Node,
    type NodeMouseHandler,
    type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, CheckCircle2, Code2, Eye, FileCode2, Folder, Loader2, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { buildCodeGraph, type CodeGraph, type CodeGraphNode } from "@/lib/code-graph-builder";

// ===========================================
// Types
// ===========================================

interface PluginCodeGraphProps {
  /** Files map: relative path → source code */
  files: Map<string, string> | null;
  /** Entry file relative path */
  entryFile: string;
  /** Whether files are still loading */
  isLoading: boolean;
  /** Error message if file fetch failed */
  error?: string;
  /** Callback when user clicks a file node */
  onFileClick?: (filePath: string) => void;
  /**
   * Layer-2 (runtime) per-file status, keyed by the same relative path used
   * in the `files` map.  When set, files render a small CheckCircle2 (green)
   * or XCircle (red) badge in the top-right corner — the runtime mirror of
   * the Layer-1 preflight per-file annotations.
   */
  fileStatuses?: Map<string, "ok" | "error">;
}

type FileNodeData = {
  label: string;
  isEntry: boolean;
  importCount: number;
  importedByCount: number;
  filePath: string;
  onFileClick?: (filePath: string) => void;
  status?: "ok" | "error";
};

type FolderNodeData = {
  label: string;
};

type FileRole = "handler" | "utility" | "config" | "entry" | "default";

type TooltipEdgeData = {
  viewMode: "overview" | "developer";
  importNames: string[];
  importType: string;
  sourceLabel: string;
  targetLabel: string;
  targetRole: FileRole;
};

// ===========================================
// Layout Constants
// ===========================================

const NODE_WIDTH = 200;
const _NODE_HEIGHT = 60;
const GRID_GAP_X = 260;
const GRID_GAP_Y = 120;

// ===========================================
// Custom Node
// ===========================================

function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  // Layer-2 status decoration: green check for files that ran successfully,
  // red cross for files that appeared in the failure stack trace.  Failure
  // border takes precedence over the entry-file emerald border so users see
  // the broken file even on the entry node.
  const isFailed = data.status === "error";
  const borderClass = isFailed
    ? "border-red-500/60 bg-red-500/10 hover:bg-red-500/20"
    : data.isEntry
      ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20"
      : "border-border bg-card hover:bg-muted/50";
  return (
    <div
      className={`relative rounded-lg border px-3 py-2 shadow-sm cursor-pointer transition-colors ${borderClass}`}
      style={{ width: NODE_WIDTH }}
      onClick={() => data.onFileClick?.(data.filePath)}
    >
      {data.status === "ok" ? (
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full bg-background"
          title="Ran successfully in last test"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        </span>
      ) : data.status === "error" ? (
        <span
          className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full bg-background"
          title="Failed in last test (see error stack)"
        >
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        </span>
      ) : null}
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-muted-foreground/40 !border-0 !min-w-0 !min-h-0" />
      <div className="flex items-center gap-2">
        <FileCode2 className={`h-3.5 w-3.5 shrink-0 ${isFailed ? "text-red-500" : data.isEntry ? "text-emerald-500" : "text-muted-foreground"}`} />
        <span className="text-xs font-medium truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        {data.isEntry ? (
          <span className="text-emerald-500 font-medium">entry</span>
        ) : null}
        {data.importCount > 0 ? (
          <span>{data.importCount} import{data.importCount !== 1 ? "s" : ""}</span>
        ) : null}
        {data.importedByCount > 0 ? (
          <span>{data.importedByCount} consumer{data.importedByCount !== 1 ? "s" : ""}</span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-muted-foreground/40 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
}

function FolderNode({ data }: NodeProps<Node<FolderNodeData>>) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30">
      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">{data.label}</span>
    </div>
  );
}

const nodeTypes = { file: FileNode, folder: FolderNode };

// ===========================================
// Edge Helpers
// ===========================================

function getFileRole(filePath: string): FileRole {
  const lower = filePath.toLowerCase();
  if (lower.includes("handler")) return "handler";
  if (lower.includes("util") || lower.includes("helper") || lower.includes("lib/")) return "utility";
  if (lower.includes("config") || lower.endsWith(".json")) return "config";
  return "default";
}

function getRoleColor(role: FileRole): string {
  switch (role) {
    case "handler": return "var(--color-blue-500)";
    case "utility": return "var(--color-amber-500)";
    case "config": return "var(--color-purple-500)";
    default: return "var(--color-muted-foreground)";
  }
}

function getPlainLabel(names: string[], targetRole: FileRole): string {
  const count = names.length;
  if (count === 0) return "uses";
  switch (targetRole) {
    case "handler": return `uses ${count} handler${count > 1 ? "s" : ""}`;
    case "utility": return `uses ${count} helper${count > 1 ? "s" : ""}`;
    case "config": return "reads config";
    default: return `uses ${count} export${count > 1 ? "s" : ""}`;
  }
}

// ===========================================
// Custom Edge with Tooltip
// ===========================================

function TooltipEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style, markerEnd, data,
}: EdgeProps<Edge<TooltipEdgeData>>) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const label = data?.viewMode === "overview"
    ? getPlainLabel(data?.importNames ?? [], data?.targetRole ?? "default")
    : (data?.importNames ?? []).length > 0
      ? (data?.importNames ?? []).slice(0, 3).join(", ")
      : undefined;

  return (
    <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <path d={edgePath} fill="none" strokeWidth={20} stroke="transparent" />
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        label={label}
        labelStyle={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
      />
      {hovered && data && data.importNames.length > 0 && (
        <foreignObject
          x={labelX - 110}
          y={labelY + 14}
          width={220}
          height={80}
          className="overflow-visible pointer-events-none"
        >
          <div className="bg-popover border rounded-md px-2.5 py-1.5 shadow-lg text-[10px] text-popover-foreground w-fit max-w-[210px]">
            <p className="font-medium truncate">{data.sourceLabel} → {data.targetLabel}</p>
            <p className="text-muted-foreground mt-0.5 break-words">{data.importNames.join(", ")}</p>
            <p className="text-muted-foreground/60 mt-0.5">{data.importType} import</p>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

const edgeTypes = { tooltip: TooltipEdge };

// ===========================================
// Layout
// ===========================================

function layoutNodes(graph: CodeGraph): Node<FileNodeData | FolderNodeData>[] {
  // Group nodes by directory for visual folder grouping
  const folders = new Map<string, CodeGraphNode[]>();
  for (const node of graph.nodes) {
    const lastSlash = node.id.lastIndexOf("/");
    const folder = lastSlash >= 0 ? node.id.substring(0, lastSlash) : "";
    const list = folders.get(folder) ?? [];
    list.push(node);
    folders.set(folder, list);
  }

  // Sort folders: root first, then alphabetically
  const sortedFolders = [...folders.keys()].sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });

  const nodes: Node<FileNodeData | FolderNodeData>[] = [];
  let yOffset = 0;

  for (const folder of sortedFolders) {
    const files = folders.get(folder) ?? [];

    // Add folder header node (skip for root-level files)
    if (folder !== "") {
      nodes.push({
        id: `folder-${folder}`,
        type: "folder",
        position: { x: 0, y: yOffset },
        data: { label: folder + "/" },
        selectable: false,
        draggable: false,
      });
      yOffset += 44;
    }

    // Sort files: entry first, then alphabetically
    files.sort((a, b) => {
      if (a.isEntry) return -1;
      if (b.isEntry) return 1;
      return a.id.localeCompare(b.id);
    });

    // Position files in a horizontal row within the folder group
    for (let i = 0; i < files.length; i++) {
      const graphNode = files[i];
      if (!graphNode) continue;
      nodes.push({
        id: graphNode.id,
        type: "file",
        position: {
          x: i * GRID_GAP_X,
          y: yOffset,
        },
        data: {
          label: graphNode.label,
          isEntry: graphNode.isEntry,
          importCount: graphNode.importCount,
          importedByCount: graphNode.importedByCount,
          filePath: graphNode.id,
        },
      });
    }

    yOffset += GRID_GAP_Y;
  }

  return nodes;
}

function buildEdges(graph: CodeGraph, viewMode: "overview" | "developer"): Edge[] {
  return graph.edges.map((e, i) => {
    const nameCount = e.names.length;
    const strokeWidth = nameCount >= 4 ? 3 : nameCount >= 2 ? 2 : 1.5;
    const targetRole = getFileRole(e.target);
    const isReExport = e.type === "re-export";
    // Overview mode: color by target file role. Developer mode: muted default.
    const edgeColor = isReExport
      ? "var(--color-emerald-500)"
      : viewMode === "overview"
        ? getRoleColor(targetRole)
        : "var(--color-muted-foreground)";

    return {
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      type: "tooltip",
      animated: viewMode === "overview" || e.type === "dynamic",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: edgeColor,
      },
      style: {
        stroke: edgeColor,
        strokeWidth,
        strokeDasharray: e.type === "dynamic" ? "5,5" : undefined,
      },
      data: {
        viewMode,
        importNames: e.names,
        importType: e.type,
        sourceLabel: e.source.split("/").pop() ?? e.source,
        targetLabel: e.target.split("/").pop() ?? e.target,
        targetRole,
      },
    };
  });
}

// ===========================================
// Component
// ===========================================

export function PluginCodeGraph({
  files,
  entryFile,
  isLoading,
  error,
  onFileClick,
  fileStatuses,
}: PluginCodeGraphProps) {
  const [viewMode, setViewMode] = useState<"overview" | "developer">("overview");

  const graph = useMemo<CodeGraph | null>(() => {
    if (!files || files.size === 0) return null;
    return buildCodeGraph(files, entryFile);
  }, [files, entryFile]);

  const flowNodes = useMemo(() => {
    if (!graph) return [];
    const nodes = layoutNodes(graph);
    return nodes.map((n) => {
      if (n.type !== "file") return { ...n, data: { ...n.data, onFileClick } };
      const fileData = n.data as FileNodeData;
      const status = fileStatuses?.get(fileData.filePath);
      return {
        ...n,
        data: { ...fileData, onFileClick, status },
      };
    });
  }, [graph, onFileClick, fileStatuses]);

  const flowEdges = useMemo(() => {
    if (!graph) return [];
    return buildEdges(graph, viewMode);
  }, [graph, viewMode]);

  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.type === "file" && onFileClick) {
      const fileData = node.data as FileNodeData;
      onFileClick(fileData.filePath);
    }
  }, [onFileClick]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading plugin files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8 text-destructive opacity-60" />
        <p className="text-sm text-destructive">Failed to load plugin files</p>
        <p className="text-xs text-muted-foreground max-w-xs text-center">{error}</p>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileCode2 className="h-8 w-8 opacity-30" />
        <p className="text-sm">No files found for this plugin</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          fitView
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <button
              onClick={() => setViewMode(m => m === "overview" ? "developer" : "overview")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-background/80 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground transition-colors shadow-sm"
            >
              {viewMode === "overview" ? <Eye className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
              {viewMode === "overview" ? "Overview" : "Developer"}
            </button>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
