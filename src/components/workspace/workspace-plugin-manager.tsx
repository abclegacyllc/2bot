"use client";

/**
 * Workspace Plugin Manager
 *
 * Shows running plugins inside the workspace container with
 * start/stop/restart controls, live status indicators, and
 * a VS Code-style PROBLEMS panel for pre-flight validation.
 *
 * @module components/workspace/workspace-plugin-manager
 */

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PluginValidationResult } from "@/hooks/use-workspace";
import type { WorkspacePluginProcess } from "@/shared/types/workspace";
import {
    AlertTriangle,
    CheckCircle2,
    CircleAlert,
    Filter,
    Info,
    Loader2,
    Pause,
    Play,
    Plug,
    RefreshCw,
    RotateCcw,
    Search,
    Square,
    XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

// ===========================================
// Props
// ===========================================

interface WorkspacePluginManagerProps {
  plugins: WorkspacePluginProcess[];
  onStart: (file: string) => Promise<void>;
  onStop: (fileOrPid: string | number, force?: boolean) => Promise<void>;
  onRestart: (fileOrPid: string | number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onValidate?: (file: string) => Promise<PluginValidationResult>;
  loading?: boolean;
}

// ===========================================
// Status Badge
// ===========================================

const PLUGIN_STATUS_CONFIG: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  running: { variant: "default", className: "bg-green-600" },
  stopped: { variant: "secondary" },
  error: { variant: "destructive" },
  starting: { variant: "outline", className: "border-yellow-500 text-yellow-400" },
};

// ===========================================
// Format uptime
// ===========================================

function formatUptime(seconds?: number): string {
  if (!seconds) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ===========================================
// Severity Icon
// ===========================================

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "error":
      return <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />;
    case "info":
      return <Info className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />;
    default:
      return <CircleAlert className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
  }
}

// ===========================================
// Plugin Row
// ===========================================

function PluginRow({
  plugin,
  onStart,
  onStop,
  onRestart,
  onValidate,
  validationResult,
  validating,
}: {
  plugin: WorkspacePluginProcess;
  onStart: (file: string) => Promise<void>;
  onStop: (fileOrPid: string | number, force?: boolean) => Promise<void>;
  onRestart: (fileOrPid: string | number) => Promise<void>;
  onValidate?: () => void;
  validationResult?: PluginValidationResult | null;
  validating?: boolean;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"restart" | "stop" | null>(null);
  const statusConfig = PLUGIN_STATUS_CONFIG[plugin.status] ?? PLUGIN_STATUS_CONFIG.stopped ?? { variant: "secondary" as const, className: "" };
  const isRunning = plugin.status === "running";
  const isStopped = plugin.status === "stopped" || plugin.status === "error" || plugin.status === "crashed";

  const handleAction = async (action: "start" | "stop" | "restart" | "forceStop") => {
    setActionLoading(true);
    try {
      // Use plugin.file (path) rather than PID so the bridge agent can resolve it
      if (action === "start") await onStart(plugin.file);
      else if (action === "stop") await onStop(plugin.file);
      else if (action === "forceStop") await onStop(plugin.file, true);
      else await onRestart(plugin.file);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmedAction = async () => {
    if (confirmAction) {
      await handleAction(confirmAction);
      setConfirmAction(null);
    }
  };

  // Count problems by severity
  const errorCount = validationResult?.problems.filter(p => p.severity === 'error').length ?? 0;
  const warnCount = validationResult?.problems.filter(p => p.severity === 'warning').length ?? 0;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/50 group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="relative flex-shrink-0">
          <Plug className="h-4 w-4 text-purple-400" />
          <span
            className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
              plugin.status === "running" && !plugin.lastError
                ? "bg-green-500"
                : plugin.status === "running" && plugin.lastError
                  ? "bg-yellow-500"
                  : plugin.status === "error" || plugin.status === "crashed"
                    ? "bg-red-500"
                    : "bg-gray-500"
            }`}
            title={
              plugin.status === "running" && !plugin.lastError
                ? "Healthy"
                : plugin.status === "running" && plugin.lastError
                  ? "Running with errors"
                  : plugin.status === "error" || plugin.status === "crashed"
                    ? "Error"
                    : "Stopped"
            }
          />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {plugin.displayName || plugin.name || plugin.file}
            {validationResult ? validationResult.valid ? (
                <span title="No errors"><CheckCircle2 className="h-3 w-3 text-green-400" /></span>
              ) : (
                <span title={`${errorCount} error(s)`}><XCircle className="h-3 w-3 text-red-400" /></span>
              ) : null}
          </div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            {plugin.file}
            {validationResult && (errorCount > 0 || warnCount > 0) ? <span className="text-[10px]">
                {errorCount > 0 && <span className="text-red-400">{errorCount}E</span>}
                {errorCount > 0 && warnCount > 0 && <span className="text-muted-foreground"> </span>}
                {warnCount > 0 && <span className="text-yellow-400">{warnCount}W</span>}
              </span> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={statusConfig.variant} className={statusConfig.className}>
          {plugin.status === "starting" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {plugin.status}
        </Badge>

        {isRunning ? <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatUptime(plugin.uptimeSeconds)}
          </span> : null}

        {plugin.memoryMb !== undefined && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {plugin.memoryMb.toFixed(0)}MB
          </span>
        )}

        {plugin.lastError ? <span title={plugin.lastError}>
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          </span> : null}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {actionLoading || validating ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {onValidate ? <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onValidate}
                  title="Validate (check for problems)"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button> : null}
              {isStopped ? <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleAction("start")}
                  title="Start"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button> : null}
              {isRunning ? <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmAction("restart")}
                    title="Restart"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmAction("stop")}
                    title="Stop"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                </> : null}
            </>
          )}
        </div>
      </div>

      {/* Confirmation dialog for restart/stop */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "restart" ? "Restart" : "Stop"} plugin?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "restart"
                ? `This will restart "${plugin.displayName || plugin.name}". Any in-progress requests will be interrupted.`
                : `This will stop "${plugin.displayName || plugin.name}". The plugin will no longer process events until started again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedAction}>
              {confirmAction === "restart" ? "Restart" : "Stop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ===========================================
// Problems Panel
// ===========================================

function ProblemsPanel({
  results,
}: {
  results: Map<string, PluginValidationResult>;
}) {
  const allProblems: Array<{ file: string; severity: string; message: string; line?: number }> = [];
  for (const [file, result] of results) {
    for (const problem of result.problems) {
      allProblems.push({ file, ...problem });
    }
  }

  if (allProblems.length === 0) return null;

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
  allProblems.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const errorCount = allProblems.filter(p => p.severity === 'error').length;
  const warnCount = allProblems.filter(p => p.severity === 'warning').length;
  const infoCount = allProblems.filter(p => p.severity === 'info').length;

  return (
    <div className="mt-2 border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-medium">
          <CircleAlert className="h-3.5 w-3.5" />
          PROBLEMS
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {errorCount > 0 && (
            <span className="flex items-center gap-0.5">
              <XCircle className="h-3 w-3 text-red-400" /> {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3 text-yellow-400" /> {warnCount}
            </span>
          )}
          {infoCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Info className="h-3 w-3 text-blue-400" /> {infoCount}
            </span>
          )}
        </div>
      </div>
      <ScrollArea className="max-h-[160px]">
        <div className="divide-y divide-border/50">
          {allProblems.map((problem, idx) => (
            <div key={idx} className="flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-muted/30">
              <SeverityIcon severity={problem.severity} />
              <div className="min-w-0 flex-1">
                <span className="text-foreground">{problem.message}</span>
                <span className="text-muted-foreground ml-2">
                  {problem.file}
                  {problem.line !== undefined && problem.line !== null && `:${problem.line}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkspacePluginManager({
  plugins,
  onStart,
  onStop,
  onRestart,
  onRefresh,
  onValidate,
  loading,
}: WorkspacePluginManagerProps) {
  const runningCount = plugins.filter((p) => p.status === "running").length;
  const stoppedCount = plugins.filter((p) => p.status !== "running").length;
  const [validationResults, setValidationResults] = useState<Map<string, PluginValidationResult>>(new Map());
  const [validatingFiles, setValidatingFiles] = useState<Set<string>>(new Set());
  const [validatingAll, setValidatingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleValidatePlugin = useCallback(async (file: string) => {
    if (!onValidate) return;
    setValidatingFiles(prev => new Set(prev).add(file));
    try {
      const result = await onValidate(file);
      setValidationResults(prev => {
        const next = new Map(prev);
        next.set(file, result);
        return next;
      });
    } finally {
      setValidatingFiles(prev => {
        const next = new Set(prev);
        next.delete(file);
        return next;
      });
    }
  }, [onValidate]);

  const handleValidateAll = useCallback(async () => {
    if (!onValidate || plugins.length === 0) return;
    setValidatingAll(true);
    try {
      const newResults = new Map<string, PluginValidationResult>();
      for (const plugin of plugins) {
        try {
          const result = await onValidate(plugin.file);
          newResults.set(plugin.file, result);
        } catch {
          newResults.set(plugin.file, {
            valid: false,
            problems: [{ severity: 'error', message: 'Validation request failed' }],
          });
        }
      }
      setValidationResults(newResults);
    } finally {
      setValidatingAll(false);
    }
  }, [onValidate, plugins]);

  const handleStopAll = useCallback(async () => {
    setBulkLoading(true);
    try {
      const running = plugins.filter((p) => p.status === "running");
      for (const p of running) {
        await onStop(p.file).catch(() => {});
      }
      await onRefresh();
    } finally {
      setBulkLoading(false);
    }
  }, [plugins, onStop, onRefresh]);

  const handleStartAll = useCallback(async () => {
    setBulkLoading(true);
    try {
      const stopped = plugins.filter(
        (p) => p.status === "stopped" || p.status === "error" || p.status === "crashed"
      );
      for (const p of stopped) {
        await onStart(p.file).catch(() => {});
      }
      await onRefresh();
    } finally {
      setBulkLoading(false);
    }
  }, [plugins, onStart, onRefresh]);

  // Filter plugins by search query
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return plugins;
    const q = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        (p.displayName || p.name || p.file).toLowerCase().includes(q) ||
        p.file.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
    );
  }, [plugins, searchQuery]);

  return (
    <Card className="border-border bg-card/50" data-ai-target="workspace-plugins-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">
              Plugins
            </CardTitle>
            {runningCount > 0 && (
              <Badge variant="outline" className="text-xs border-green-500 text-green-400">
                {runningCount} running
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Search toggle */}
            {plugins.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(""); }}
                title="Filter plugins"
              >
                <Filter className={`h-3.5 w-3.5 ${showSearch ? "text-purple-400" : ""}`} />
              </Button>
            )}

            {/* Bulk actions */}
            {plugins.length > 1 && (
              <>
                {runningCount > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleStopAll}
                    disabled={bulkLoading}
                    title="Stop all plugins"
                  >
                    {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3" />}
                  </Button>
                )}
                {stoppedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleStartAll}
                    disabled={bulkLoading}
                    title="Start all stopped plugins"
                  >
                    {bulkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3" />}
                  </Button>
                )}
              </>
            )}

            {onValidate && plugins.length > 0 ? <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleValidateAll}
                disabled={validatingAll}
                title="Validate all plugins"
              >
                {validatingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
              </Button> : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh plugins"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Search input */}
        {showSearch ? <div className="mt-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name or status..."
              className="h-7 text-xs"
              autoFocus
            />
          </div> : null}
      </CardHeader>
      <CardContent className="pt-0">
        {plugins.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
            <Play className="h-4 w-4" />
            <span>No plugins running. Start one from the file explorer.</span>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-0.5">
                {filteredPlugins.map((plugin) => (
                  <PluginRow
                    key={`${plugin.file}-${plugin.pid}`}
                    plugin={plugin}
                    onStart={onStart}
                    onStop={onStop}
                    onRestart={onRestart}
                    onValidate={onValidate ? () => handleValidatePlugin(plugin.file) : undefined}
                    validationResult={validationResults.get(plugin.file)}
                    validating={validatingFiles.has(plugin.file)}
                  />
                ))}
                {filteredPlugins.length === 0 && searchQuery ? <p className="text-xs text-muted-foreground text-center py-3">
                    No plugins match &quot;{searchQuery}&quot;
                  </p> : null}
              </div>
            </ScrollArea>
            <ProblemsPanel results={validationResults} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
