"use client";

/**
 * Workspace Status Panel
 *
 * Shows container status, resource usage gauges, and lifecycle controls
 * (start/stop/destroy). Used in the workspace dashboard header area.
 *
 * @module components/workspace/workspace-status-panel
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatResourceDisplay } from "@/shared/lib/format";
import type { ContainerStatus, WorkspaceResourceUsage, WorkspaceStatus } from "@/shared/types/workspace";
import {
    AlertTriangle,
    Box,
    Clock,
    Cpu,
    HardDrive,
    Loader2,
    MemoryStick,
    Play,
    Power,
    RefreshCw,
    Square,
    Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

// ===========================================
// Status Badge Mapping
// ===========================================

const STATUS_CONFIG: Record<
  ContainerStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  CREATING: { label: "Creating", variant: "outline", className: "border-blue-500 text-blue-400" },
  STARTING: { label: "Starting", variant: "outline", className: "border-yellow-500 text-yellow-400" },
  RUNNING: { label: "Running", variant: "default", className: "bg-green-600" },
  STOPPING: { label: "Stopping", variant: "outline", className: "border-orange-500 text-orange-400" },
  STOPPED: { label: "Stopped", variant: "secondary" },
  ERROR: { label: "Error", variant: "destructive" },
  DESTROYED: { label: "Destroyed", variant: "secondary" },
};

// ===========================================
// Uptime Counter
// ===========================================

function UptimeCounter({ startedAt }: { startedAt: string }) {
  const [uptime, setUptime] = useState("");

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setUptime(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return <div>Running: {uptime}</div>;
}

// ===========================================
// Component Props
// ===========================================

interface WorkspaceStatusPanelProps {
  workspace: WorkspaceStatus | null;
  stats: WorkspaceResourceUsage | null;
  loading: boolean;
  error: string | null;
  /** Whether the current user is on a free/starter plan (auto-stop locked) */
  isFreeTier?: boolean;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onDestroy: () => Promise<void>;
  onRefresh: () => Promise<void>;
  /** Called when user changes auto-stop setting. null = disabled. */
  onUpdateAutoStop?: (minutes: number | null) => Promise<void>;
}

// ===========================================
// Resource Gauge
// ===========================================

function ResourceGauge({
  label,
  icon: Icon,
  value,
  max,
  unit,
  percentage,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  max: number;
  unit: string;
  percentage: number;
}) {
  const safeValue = value ?? 0;
  const safePercentage = percentage ?? 0;
  const color =
    safePercentage > 90 ? "text-red-400" : safePercentage > 70 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <span className={color}>
          {formatResourceDisplay(safeValue, unit)} / {formatResourceDisplay(max, unit)}
        </span>
      </div>
      <Progress value={Math.min(safePercentage, 100)} className="h-2" />
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkspaceStatusPanel({
  workspace,
  stats,
  loading,
  error,
  isFreeTier = false,
  onStart,
  onStop,
  onDestroy,
  onRefresh,
  onUpdateAutoStop,
}: WorkspaceStatusPanelProps) {
  const status = workspace?.status;
  const statusConfig = status ? STATUS_CONFIG[status] : null;
  const isRunning = status === "RUNNING";
  const isStopped = status === "STOPPED";
  const isTransitioning = status === "CREATING" || status === "STARTING" || status === "STOPPING";

  // Note: Since this component runs on the client (browser), we don't have direct access
  // to the container's private IP (172.20.0.x). That is visible only to the backend.
  // The 'stats' object comes from the backend bridge, not Docker inspect.

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
             <div className="flex items-center gap-3">
                <Box className="h-5 w-5 text-purple-400" />
                <CardTitle className="text-lg">Workspace</CardTitle>
                {statusConfig ? <Badge variant={statusConfig.variant} className={statusConfig.className}>
                    {isTransitioning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    {statusConfig.label}
                  </Badge> : null}
             </div>
             {/* Note: IP address is not currently exposed to frontend for security reasons, 
                 but is logged in audit logs. Add here if requested by user. */}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh status"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {isStopped ? <Button
                size="sm"
                onClick={onStart}
                disabled={isTransitioning}
                className="bg-green-600 hover:bg-green-700"
                data-ai-target="workspace-start-btn"
              >
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button> : null}
            {isRunning ? <Button
                size="sm"
                variant="secondary"
                onClick={onStop}
                disabled={isTransitioning}
              >
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button> : null}
            {(isStopped || status === "ERROR") ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isTransitioning}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Destroy
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Destroy Workspace?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your workspace container and all
                      files inside it. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onDestroy}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, Destroy Workspace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <div className="flex items-center gap-2 text-sm text-red-400 mb-4">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div> : null}

        {workspace?.errorMessage ? <div className="flex items-center gap-2 text-sm text-red-400 mb-4">
            <Power className="h-4 w-4" />
            {workspace.errorMessage}
          </div> : null}

        {/* Resource usage gauges */}
        {isRunning && stats && workspace?.resources ? <div className="space-y-3">
            <ResourceGauge
              label="RAM"
              icon={MemoryStick}
              value={stats.ramUsedMb}
              max={workspace.resources.ramMb}
              unit="MB"
              percentage={stats.ramPercentage}
            />
            <ResourceGauge
              label="CPU"
              icon={Cpu}
              value={stats.cpuPercentage}
              max={workspace.resources.cpuCores}
              unit="cores"
              percentage={workspace.resources.cpuCores > 0 ? Math.min(100, Math.round((stats.cpuPercentage / workspace.resources.cpuCores) * 100)) : 0}
            />
            <ResourceGauge
              label="Storage"
              icon={HardDrive}
              value={stats.storageUsedMb}
              max={workspace.resources.storageMb}
              unit="MB"
              percentage={stats.storagePercentage}
            />
          </div> : null}

        {/* Workspace metadata */}
        {workspace ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>Owner: {workspace.ownerType}</div>
            <div>Restarts: {workspace.restartCount}</div>
            {workspace.startedAt && workspace.status === "RUNNING" ? <UptimeCounter startedAt={workspace.startedAt} /> : null}
            {workspace.startedAt && workspace.status !== "RUNNING" ? <div>Started: {new Date(workspace.startedAt).toLocaleTimeString()}</div> : null}
            <div className="col-span-2 flex items-center gap-2 mt-1">
              <Clock className="h-3 w-3" />
              {isFreeTier ? (
                <span>Auto-stop: 24h inactivity (free plan)</span>
              ) : workspace.autoStopMinutes ? (
                <span>
                  Auto-stop: {workspace.autoStopMinutes >= 60
                    ? `${Math.floor(workspace.autoStopMinutes / 60)}h${workspace.autoStopMinutes % 60 ? ` ${workspace.autoStopMinutes % 60}m` : ""}`
                    : `${workspace.autoStopMinutes}m`}
                  {onUpdateAutoStop ? (
                    <button
                      className="ml-2 text-blue-400 hover:text-blue-300 underline"
                      onClick={() => onUpdateAutoStop(null)}
                    >
                      Disable
                    </button>
                  ) : null}
                </span>
              ) : (
                <span>
                  Auto-stop: OFF
                  {onUpdateAutoStop ? (
                    <button
                      className="ml-2 text-blue-400 hover:text-blue-300 underline"
                      onClick={() => onUpdateAutoStop(60)}
                    >
                      Enable
                    </button>
                  ) : null}
                </span>
              )}
            </div>
          </div> : null}

        {/* No workspace state */}
        {!workspace && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            No workspace container exists yet. Create one to get started.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
