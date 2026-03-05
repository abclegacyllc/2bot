/**
 * Agent Session Header
 *
 * Compact status bar showing real-time session metrics:
 * iteration count, tool calls used, credits consumed, and elapsed time.
 * Updates live as SSE events stream in.
 *
 * @module components/2bot-ai-assistant/agent-session-header
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    Activity,
    Clock,
    Coins,
    Hammer,
    Loader2,
    RefreshCw,
} from "lucide-react";

// ===========================================
// Types
// ===========================================

export interface AgentSessionMetrics {
  /** Current status */
  status: "idle" | "running" | "completed" | "max_iterations" | "max_credits" | "error" | "cancelled";
  /** Current AI iteration */
  iterationCount: number;
  /** Total tool calls so far */
  toolCallCount: number;
  /** Credits consumed so far */
  creditsUsed: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Token usage */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ===========================================
// Helpers
// ===========================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function statusLabel(status: AgentSessionMetrics["status"]): string {
  switch (status) {
    case "idle": return "Ready";
    case "running": return "Running";
    case "completed": return "Completed";
    case "max_iterations": return "Iteration Limit";
    case "max_credits": return "Credit Limit";
    case "error": return "Error";
    case "cancelled": return "Cancelled";
  }
}

function statusColor(status: AgentSessionMetrics["status"]): string {
  switch (status) {
    case "idle": return "text-muted-foreground";
    case "running": return "text-blue-400";
    case "completed": return "text-green-400";
    case "max_iterations": return "text-yellow-400";
    case "max_credits": return "text-orange-400";
    case "error": return "text-red-400";
    case "cancelled": return "text-muted-foreground";
  }
}

// ===========================================
// Component
// ===========================================

export function AgentSessionHeader({ metrics }: { metrics: AgentSessionMetrics }) {
  const isActive = metrics.status === "running";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/30 text-xs">
      {/* Status indicator */}
      <div className={cn("flex items-center gap-1 font-medium", statusColor(metrics.status))}>
        {isActive ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Activity className="h-3 w-3" />
        )}
        <span>{statusLabel(metrics.status)}</span>
      </div>

      <div className="h-3 w-px bg-border" />

      {/* Iteration count */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <RefreshCw className="h-3 w-3" />
        <span>
          <span className="font-mono text-foreground">{metrics.iterationCount}</span> iterations
        </span>
      </div>

      {/* Tool call count */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <Hammer className="h-3 w-3" />
        <span>
          <span className="font-mono text-foreground">{metrics.toolCallCount}</span> tools
        </span>
      </div>

      {/* Credits consumed */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <Coins className="h-3 w-3" />
        <span>
          <span className="font-mono text-foreground">{metrics.creditsUsed.toFixed(2)}</span> credits
        </span>
      </div>

      {/* Elapsed time */}
      <div className="flex items-center gap-1 text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="font-mono text-foreground">{formatDuration(metrics.elapsedMs)}</span>
      </div>

      {/* Token usage (if available) */}
      {metrics.tokenUsage && (metrics.tokenUsage.inputTokens > 0 || metrics.tokenUsage.outputTokens > 0) && (
        <>
          <div className="h-3 w-px bg-border" />
          <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-mono">
            {(metrics.tokenUsage.inputTokens + metrics.tokenUsage.outputTokens).toLocaleString()} tokens
          </Badge>
        </>
      )}
    </div>
  );
}
