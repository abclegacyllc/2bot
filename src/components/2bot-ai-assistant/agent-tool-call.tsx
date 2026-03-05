/**
 * Agent Tool Call Card
 *
 * Displays an individual tool invocation from the AI agent:
 * icon, tool name, input params, output, duration, and error status.
 * Supports expand/collapse for long outputs.
 *
 * @module components/2bot-ai-assistant/agent-tool-call
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronRight,
    Clock,
    Code,
    File,
    FileEdit,
    FolderOpen,
    GitBranch,
    Loader2,
    Package,
    Search,
    Terminal,
    Trash2,
} from "lucide-react";
import { useState } from "react";

// ===========================================
// Types
// ===========================================

export interface ToolCallData {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  durationMs?: number;
  /** "pending" while waiting for result, "done" when complete */
  status: "pending" | "done";
}

// ===========================================
// Tool Icon Mapping
// ===========================================

const TOOL_ICONS: Record<string, typeof File> = {
  read_file: File,
  write_file: FileEdit,
  list_directory: FolderOpen,
  delete_file: Trash2,
  create_directory: FolderOpen,
  rename_file: FileEdit,
  run_command: Terminal,
  git_status: GitBranch,
  git_clone: GitBranch,
  git_diff: GitBranch,
  install_package: Package,
  uninstall_package: Package,
  search_files: Search,
  get_system_info: Code,
};

const TOOL_COLORS: Record<string, string> = {
  read_file: "text-blue-400",
  write_file: "text-green-400",
  list_directory: "text-yellow-400",
  delete_file: "text-red-400",
  create_directory: "text-yellow-400",
  rename_file: "text-orange-400",
  run_command: "text-purple-400",
  git_status: "text-orange-400",
  git_clone: "text-orange-400",
  git_diff: "text-orange-400",
  install_package: "text-red-400",
  uninstall_package: "text-red-400",
  search_files: "text-cyan-400",
  get_system_info: "text-gray-400",
};

/** Pretty name for display */
function toolDisplayName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format input params for display — show the most relevant field */
function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file":
    case "write_file":
    case "delete_file":
      return (input.path as string) || "";
    case "list_directory":
      return (input.path as string) || "/";
    case "create_directory":
      return (input.path as string) || "";
    case "rename_file":
      return `${input.oldPath || ""} → ${input.newPath || ""}`;
    case "run_command":
      return (input.command as string) || "";
    case "git_clone":
      return (input.url as string) || "";
    case "git_status":
    case "git_diff":
      return (input.directory as string) || "/workspace";
    case "install_package":
    case "uninstall_package":
      return Array.isArray(input.packages) ? input.packages.join(", ") : String(input.packages || "");
    case "search_files":
      return (input.pattern as string) || "";
    default:
      return JSON.stringify(input).slice(0, 100);
  }
}

// ===========================================
// Component
// ===========================================

const OUTPUT_COLLAPSE_THRESHOLD = 200; // chars before we collapse

export function AgentToolCallCard({ toolCall }: { toolCall: ToolCallData }) {
  const [expanded, setExpanded] = useState(false);

  const Icon = TOOL_ICONS[toolCall.name] || Code;
  const iconColor = TOOL_COLORS[toolCall.name] || "text-muted-foreground";
  const inputSummary = formatToolInput(toolCall.name, toolCall.input);
  const isPending = toolCall.status === "pending";
  const isLongOutput = (toolCall.output?.length ?? 0) > OUTPUT_COLLAPSE_THRESHOLD;

  return (
    <div
      className={cn(
        "border rounded-md text-xs my-1.5",
        toolCall.isError
          ? "border-red-500/30 bg-red-950/20"
          : "border-border/50 bg-muted/20"
      )}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        disabled={isPending && !toolCall.output}
      >
        {/* Expand arrow */}
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />
        ) : expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}

        {/* Tool icon */}
        <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", iconColor)} />

        {/* Tool name */}
        <span className="font-medium text-foreground truncate">
          {toolDisplayName(toolCall.name)}
        </span>

        {/* Input summary */}
        <span className="text-muted-foreground font-mono truncate flex-1 min-w-0">
          {inputSummary}
        </span>

        {/* Status / duration */}
        <span className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          {toolCall.isError && (
            <AlertTriangle className="h-3 w-3 text-red-400" />
          )}
          {!isPending && !toolCall.isError && (
            <Check className="h-3 w-3 text-green-400" />
          )}
          {toolCall.durationMs !== undefined && (
            <Badge variant="outline" className="text-[10px] px-1 h-4 font-mono">
              <Clock className="h-2.5 w-2.5 mr-0.5" />
              {toolCall.durationMs}ms
            </Badge>
          )}
        </span>
      </button>

      {/* Expanded output panel */}
      {expanded && toolCall.output && (
        <div className="border-t border-border/30 px-2.5 py-2">
          <pre
            className={cn(
              "whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed",
              toolCall.isError ? "text-red-300" : "text-muted-foreground"
            )}
          >
            {isLongOutput && !expanded
              ? toolCall.output.slice(0, OUTPUT_COLLAPSE_THRESHOLD) + "..."
              : toolCall.output}
          </pre>
          {isLongOutput && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1 mt-1"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
