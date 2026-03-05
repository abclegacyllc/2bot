"use client";

/**
 * Admin Workspaces Dashboard
 *
 * Admin view of all workspace containers across users and organizations.
 * Shows container status, resource usage, and provides lifecycle controls.
 *
 * @module app/(admin)/admin/workspaces/page
 */

import { PageHeader } from "@/components/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/shared/config/urls";
import { formatResourceDisplay } from "@/shared/lib/format";
import type { ContainerStatus } from "@/shared/types/workspace";
import {
    Box,
    Cpu,
    HardDrive,
    Loader2,
    MemoryStick,
    RefreshCw,
    Search,
    Square,
    Trash2
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface AdminWorkspace {
  id: string;
  containerId: string;
  userId: string;
  userName: string;
  userEmail: string;
  ownerType: "PERSONAL" | "ORGANIZATION";
  orgSlug?: string;
  status: ContainerStatus;
  resources?: {
    ramMb: number;
    cpuCores: number;
    storageMb: number;
  };
  usage?: {
    ramUsedMb: number;
    ramPercentage: number;
    cpuPercentage: number;
    storageUsedMb: number;
    storagePercentage: number;
  };
  startedAt?: string;
  lastActivityAt?: string;
  restartCount: number;
}

interface WorkspaceSummary {
  total: number;
  running: number;
  stopped: number;
  error: number;
  totalRamMb: number;
  usedRamMb: number;
}

// ===========================================
// Status Badge
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
// Auth Helper
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ===========================================
// Summary Cards
// ===========================================

function SummaryCards({ summary }: { summary: WorkspaceSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold">{summary.total}</div>
          <div className="text-xs text-muted-foreground">Total Containers</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-green-400">{summary.running}</div>
          <div className="text-xs text-muted-foreground">Running</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-gray-400">{summary.stopped}</div>
          <div className="text-xs text-muted-foreground">Stopped</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="text-2xl font-bold text-red-400">{summary.error}</div>
          <div className="text-xs text-muted-foreground">Errors</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/admin/workspaces"), {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (res.ok) {
        setWorkspaces(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleAction = async (workspaceId: string, action: "stop" | "destroy") => {
    setActionLoading(workspaceId);
    try {
      const method = action === "destroy" ? "DELETE" : "POST";
      const url =
        action === "destroy"
          ? apiUrl(`/workspace/${workspaceId}`)
          : apiUrl(`/workspace/${workspaceId}/${action}`);
      await fetch(url, { method, headers: getAuthHeaders() });
      await fetchWorkspaces();
    } catch (err) {
      console.error(`Failed to ${action} workspace:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  // Compute summary
  const summary: WorkspaceSummary = {
    total: workspaces.length,
    running: workspaces.filter((w) => w.status === "RUNNING").length,
    stopped: workspaces.filter((w) => w.status === "STOPPED").length,
    error: workspaces.filter((w) => w.status === "ERROR").length,
    totalRamMb: workspaces.reduce((acc, w) => acc + (w.resources?.ramMb || 0), 0),
    usedRamMb: workspaces.reduce((acc, w) => acc + (w.usage?.ramUsedMb || 0), 0),
  };

  // Filter
  const filtered = workspaces.filter((w) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.userName.toLowerCase().includes(q) ||
      w.userEmail.toLowerCase().includes(q) ||
      w.orgSlug?.toLowerCase().includes(q) ||
      w.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspaces"
        description="Manage all Docker workspace containers across users and organizations"
        icon={<Box className="h-6 w-6 text-purple-400" />}
        breadcrumbs={[{ label: "Admin", href: "/admin" }]}
      />

      <SummaryCards summary={summary} />

      {/* Resource usage overview */}
      {summary.totalRamMb > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Resource Usage</CardTitle>
            <CardDescription className="text-xs">
              RAM allocated across all containers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <MemoryStick className="h-4 w-4 text-purple-400" />
              <Progress
                value={(summary.usedRamMb / summary.totalRamMb) * 100}
                className="flex-1 h-2"
              />
              <span className="text-sm text-muted-foreground">
                {formatResourceDisplay(summary.usedRamMb, "MB")} / {formatResourceDisplay(summary.totalRamMb, "MB")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Table */}
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Containers</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users, orgs..."
                  className="h-8 text-sm pl-8 w-[200px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={fetchWorkspaces}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Box className="h-8 w-8 mb-2" />
              <p className="text-sm">No workspace containers found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Restarts</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((w) => {
                  const sc = STATUS_CONFIG[w.status];
                  const isRunning = w.status === "RUNNING";
                  const isActioning = actionLoading === w.id;

                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div>
                          <div className="text-sm font-medium">{w.userName}</div>
                          <div className="text-xs text-muted-foreground">{w.userEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {w.ownerType === "ORGANIZATION" ? w.orgSlug : "Personal"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sc.variant} className={sc.className}>
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {w.resources ? (
                          <div className="flex items-center gap-1.5">
                            <MemoryStick className="h-3 w-3" />
                            <span className="text-xs">
                              {w.usage ? formatResourceDisplay(w.usage.ramUsedMb, "MB") : "?"}/{formatResourceDisplay(w.resources.ramMb, "MB")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.resources ? (
                          <div className="flex items-center gap-1.5">
                            <Cpu className="h-3 w-3" />
                            <span className="text-xs">{w.usage ? `${w.usage.cpuPercentage.toFixed(1)}%` : "?"}/{w.resources.cpuCores} cores</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.resources ? (
                          <div className="flex items-center gap-1.5">
                            <HardDrive className="h-3 w-3" />
                            <span className="text-xs">
                              {w.usage ? formatResourceDisplay(w.usage.storageUsedMb, "MB") : "?"}/{formatResourceDisplay(w.resources.storageMb, "MB")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{w.restartCount}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {w.lastActivityAt
                            ? new Date(w.lastActivityAt).toLocaleString()
                            : "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isActioning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {isRunning && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleAction(w.id, "stop")}
                                  title="Stop"
                                >
                                  <Square className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {(w.status === "STOPPED" || w.status === "ERROR") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-300"
                                  onClick={() => handleAction(w.id, "destroy")}
                                  title="Destroy"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
