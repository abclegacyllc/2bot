"use client";

/**
 * Workflow Run History
 *
 * Displays a list of workflow execution runs with status, duration,
 * and step-level detail in an expandable panel. Supports filtering
 * by status and auto-refresh.
 *
 * @module components/bot-studio/workflow-run-history
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";
import { JsonTreeView } from "@/components/bot-studio/json-tree-view";
import type {
  WorkflowRunDetail,
  WorkflowRunSummary,
  WorkflowStepRunDetail,
} from "@/lib/api-client";
import { getWorkflowRunDetail, getWorkflowRuns } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  XCircle,
} from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowRunHistoryProps {
  workflowId: string;
  token: string | null;
  organizationId?: string;
  onRetry?: () => Promise<void>;
}

// ===========================================
// Helpers
// ===========================================

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  COMPLETED: { icon: CheckCircle2, color: "text-emerald-500", label: "Completed" },
  FAILED: { icon: XCircle, color: "text-red-500", label: "Failed" },
  RUNNING: { icon: Loader2, color: "text-sky-500", label: "Running" },
  PENDING: { icon: Clock, color: "text-amber-500", label: "Pending" },
  CANCELLED: { icon: XCircle, color: "text-zinc-500", label: "Cancelled" },
};

const STEP_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  COMPLETED: { icon: CheckCircle2, color: "text-emerald-500" },
  FAILED: { icon: XCircle, color: "text-red-500" },
  RUNNING: { icon: Loader2, color: "text-sky-500" },
  PENDING: { icon: Clock, color: "text-zinc-400" },
  SKIPPED: { icon: SkipForward, color: "text-zinc-400" },
};

function friendlyTriggerSource(raw: string): string {
  const map: Record<string, string> = {
    manual: "Manual run",
    webhook: "Incoming webhook",
    schedule: "Scheduled",
    bot_message: "Bot message",
    bot_message_telegram: "Telegram message",
    bot_message_discord: "Discord message",
    bot_message_slack: "Slack message",
    bot_message_whatsapp: "WhatsApp message",
    TELEGRAM_MESSAGE: "Telegram message",
    DISCORD_MESSAGE: "Discord message",
    DISCORD_COMMAND: "Discord command",
    SLACK_MESSAGE: "Slack message",
    SLACK_COMMAND: "Slack command",
    WHATSAPP_MESSAGE: "WhatsApp message",
    BOT_MESSAGE: "Bot message",
    WEBHOOK: "Incoming webhook",
    SCHEDULE: "Scheduled",
    MANUAL: "Manual run",
  };
  return map[raw] ?? raw;
}

// ===========================================
// Step Run Row
// ===========================================

function StepRunRow({ stepRun }: { stepRun: WorkflowStepRunDetail }) {
  const cfg = STEP_STATUS_CONFIG[stepRun.status] ?? { icon: Clock, color: "text-zinc-400" };
  const Icon = cfg.icon;
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="border-l-2 border-border ml-3 pl-3">
      <button
        className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/50 rounded px-1 -ml-1"
        onClick={() => setShowDetail(!showDetail)}
      >
        <Icon className={`h-3.5 w-3.5 ${cfg.color} shrink-0 ${stepRun.status === "RUNNING" ? "animate-spin" : ""}`} />
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          Step {stepRun.stepOrder + 1}: {stepRun.stepName || stepRun.pluginSlug}
        </span>
        {stepRun.durationMs !== undefined && stepRun.durationMs !== null ? (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatDuration(stepRun.durationMs)}
          </span>
        ) : null}
        {(stepRun.output !== undefined && stepRun.output !== null) || stepRun.error || (stepRun.input !== undefined && stepRun.input !== null) ? (
          showDetail
            ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : null}
      </button>

      {showDetail ? (
        <div className="ml-5 mt-1 space-y-1.5 pb-1.5">
          {stepRun.error ? (
            <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 font-mono break-all">
              {stepRun.error}
            </div>
          ) : null}
          {stepRun.input !== undefined && stepRun.input !== null ? (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Input:</p>
              <div className="bg-muted/50 rounded px-2 py-1">
                <JsonTreeView data={stepRun.input} defaultExpandDepth={2} />
              </div>
            </div>
          ) : null}
          {stepRun.output !== undefined && stepRun.output !== null ? (
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Output:</p>
              <div className="bg-muted/50 rounded px-2 py-1">
                <JsonTreeView data={stepRun.output} defaultExpandDepth={2} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ===========================================
// Run Row (expandable)
// ===========================================

function RunRow({
  run,
  workflowId,
  token,
  organizationId,
  onRetry,
}: {
  run: WorkflowRunSummary;
  workflowId: string;
  token: string | null;
  organizationId?: string;
  onRetry?: () => Promise<void>;
}) {
  // Auto-expand failed runs so users can see errors immediately
  const [expanded, setExpanded] = useState(run.status === "FAILED");
  const [detail, setDetail] = useState<WorkflowRunDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const autoLoadAttempted = useRef(false);

  const cfg = STATUS_CONFIG[run.status] ?? { icon: Clock, color: "text-amber-500", label: "Unknown" };
  const Icon = cfg.icon;

  // Auto-load details for failed runs
  useEffect(() => {
    if (run.status === "FAILED" && !detail && !autoLoadAttempted.current) {
      autoLoadAttempted.current = true;
      setLoadingDetail(true);
      getWorkflowRunDetail(workflowId, run.id, { organizationId }, token ?? undefined)
        .then((result) => {
          if (result.success && result.data) setDetail(result.data);
        })
        .catch(() => {})
        .finally(() => setLoadingDetail(false));
    }
  }, [run.status, run.id, workflowId, organizationId, token, detail]);

  const handleExpand = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return; // already loaded

    setLoadingDetail(true);
    try {
      const result = await getWorkflowRunDetail(
        workflowId,
        run.id,
        { organizationId },
        token ?? undefined
      );
      if (result.success && result.data) {
        setDetail(result.data);
      }
    } catch {
      toast.error("Failed to load run details");
    } finally {
      setLoadingDetail(false);
    }
  }, [expanded, detail, workflowId, run.id, organizationId, token]);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="flex items-center gap-2 w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors group"
        onClick={handleExpand}
      >
        <Icon className={`h-4 w-4 ${cfg.color} shrink-0 ${run.status === "RUNNING" ? "animate-spin" : ""}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {friendlyTriggerSource(run.triggeredBy)}
            </span>
            <Badge
              variant={run.status === "COMPLETED" ? "default" : run.status === "FAILED" ? "destructive" : "secondary"}
              className="text-[9px] px-1 py-0"
            >
              {cfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {formatTime(run.startedAt)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {formatDuration(run.durationMs)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {run.stepsCompleted}/{run.totalSteps} steps
            </span>
          </div>
        </div>

        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground/60 hidden group-hover:inline">Details</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </span>
          )
        }
      </button>

      {expanded ? (
        <div className="px-3 pb-3">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-1">
              {/* Error message + Retry */}
              {detail.error ? (
                <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5 mb-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-all flex-1">{detail.error}</span>
                  {onRetry && run.status === "FAILED" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-red-400 hover:text-foreground gap-1 shrink-0 -mr-1"
                      onClick={(e) => { e.stopPropagation(); onRetry(); }}
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {/* Retry for failed runs without error text */}
              {!detail.error && onRetry && run.status === "FAILED" ? (
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  >
                    <RotateCcw className="h-3 w-3" /> Retry this workflow
                  </Button>
                </div>
              ) : null}

              {/* Step runs */}
              {detail.stepRuns
                .sort((a, b) => a.stepOrder - b.stepOrder)
                .map((stepRun) => (
                  <StepRunRow key={stepRun.id} stepRun={stepRun} />
                ))}

              {detail.stepRuns.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  No step data available
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground text-center py-2">
              Failed to load run details
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkflowRunHistory({
  workflowId,
  token,
  organizationId,
  onRetry,
}: WorkflowRunHistoryProps) {
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 10;

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getWorkflowRuns(
        workflowId,
        {
          status: statusFilter !== "all" ? statusFilter : undefined,
          page,
          limit,
          sortOrder: "desc",
        },
        { organizationId },
        token ?? undefined
      );
      if (result.success && result.data) {
        setRuns(result.data.data ?? []);
        setTotal(result.data.meta?.total ?? 0);
      }
    } catch {
      toast.error("Failed to load run history");
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, statusFilter, page, organizationId, token]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Auto-refresh every 5s when any run is in RUNNING/PENDING state
  const hasActiveRuns = runs.some((r) => r.status === "RUNNING" || r.status === "PENDING");
  const fetchRunsRef = useRef(fetchRuns);
  fetchRunsRef.current = fetchRuns;

  useEffect(() => {
    if (!hasActiveRuns) return;
    const id = setInterval(() => fetchRunsRef.current(), 5_000);
    return () => clearInterval(id);
  }, [hasActiveRuns]);

  const totalPages = Math.ceil(total / limit);

  return (
    <Card className="border-border bg-card/80">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-foreground">Run History</h3>
            {total > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {total}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-7 text-xs w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All runs</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="RUNNING">Running</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchRuns}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {isLoading && runs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No activity yet. Activate your workflow and send a message to your bot to see results here.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  workflowId={workflowId}
                  token={token}
                  organizationId={organizationId}
                  onRetry={onRetry}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
