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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PluginValidationResult } from "@/hooks/use-workspace";
import type { WorkspacePluginProcess } from "@/shared/types/workspace";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  Pause,
  Play,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";

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

  // Count problems by severity
  const errorCount = validationResult?.problems.filter(p => p.severity === 'error').length ?? 0;
  const warnCount = validationResult?.problems.filter(p => p.severity === 'warning').length ?? 0;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/50 group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Plug className="h-4 w-4 text-purple-400 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {plugin.displayName || plugin.name || plugin.file}
            {validationResult && (
              validationResult.valid ? (
                <span title="No errors"><CheckCircle2 className="h-3 w-3 text-green-400" /></span>
              ) : (
                <span title={`${errorCount} error(s)`}><XCircle className="h-3 w-3 text-red-400" /></span>
              )
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
            {plugin.file}
            {validationResult && (errorCount > 0 || warnCount > 0) && (
              <span className="text-[10px]">
                {errorCount > 0 && <span className="text-red-400">{errorCount}E</span>}
                {errorCount > 0 && warnCount > 0 && <span className="text-muted-foreground"> </span>}
                {warnCount > 0 && <span className="text-yellow-400">{warnCount}W</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={statusConfig.variant} className={statusConfig.className}>
          {plugin.status === "starting" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {plugin.status}
        </Badge>

        {isRunning && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatUptime(plugin.uptimeSeconds)}
          </span>
        )}

        {plugin.memoryMb !== undefined && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {plugin.memoryMb.toFixed(0)}MB
          </span>
        )}

        {plugin.lastError && (
          <span title={plugin.lastError}>
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {actionLoading || validating ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {onValidate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onValidate}
                  title="Validate (check for problems)"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              )}
              {isStopped && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleAction("start")}
                  title="Start"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              {isRunning && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleAction("restart")}
                    title="Restart"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleAction("stop")}
                    title="Stop"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
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
                  {problem.line != null && `:${problem.line}`}
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
  const [validationResults, setValidationResults] = useState<Map<string, PluginValidationResult>>(new Map());
  const [validatingFiles, setValidatingFiles] = useState<Set<string>>(new Set());
  const [validatingAll, setValidatingAll] = useState(false);

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
            {onValidate && plugins.length > 0 && (
              <Button
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
              </Button>
            )}
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
                {plugins.map((plugin) => (
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
              </div>
            </ScrollArea>
            <ProblemsPanel results={validationResults} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
