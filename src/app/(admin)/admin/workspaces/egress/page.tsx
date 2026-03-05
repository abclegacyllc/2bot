"use client";

/**
 * Admin Network Page
 *
 * Unified page for workspace network management with three tabs:
 * 1. Traffic Logs — outbound network traffic from workspace containers
 * 2. Domain Allowlists — approve/reject/revoke user-requested domains
 * 3. Admin Blacklist — globally block domains from being accessed
 *
 * @module app/(admin)/admin/workspaces/egress/page
 */

import { PageHeader } from "@/components/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/shared/config/urls";
import {
    ArrowLeft,
    ArrowRight,
    Ban,
    CheckCircle,
    Globe,
    Loader2,
    Network,
    Plus,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldBan,
    ShieldCheck,
    Timer,
    Trash2,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface EgressLog {
  id: string;
  containerId: string;
  timestamp: string;
  domain: string;
  url: string | null;
  method: string;
  httpStatus: number;
  squidStatus: string;
  bytesTransferred: number;
  elapsedMs: number;
  action: "ALLOWED" | "BLOCKED" | "RATE_LIMITED";
  container?: {
    id: string;
    containerName: string;
    userId: string;
    user?: {
      id: string;
      name: string | null;
      email: string;
    };
  };
}

interface EgressSummary {
  totalRequests: number;
  allowed: number;
  blocked: number;
  rateLimited: number;
  topDomains: { domain: string; count: number }[];
  bytesTotal: number;
}

interface ProxyStatus {
  running: boolean;
  ipAddress?: string;
  uptime?: string;
}

type AllowlistStatus = "APPROVED" | "PENDING" | "REJECTED" | "REVOKED";

interface AllowedDomain {
  id: string;
  domain: string;
  status: AllowlistStatus;
  reason: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface BlockedDomain {
  id: string;
  domain: string;
  reason: string | null;
  createdAt: string;
  addedBy?: {
    id: string;
    name: string | null;
    email: string;
  };
}

// ===========================================
// Constants
// ===========================================

const ACTION_CONFIG = {
  ALLOWED: { label: "Allowed", variant: "default" as const, className: "bg-green-600", icon: ShieldCheck },
  BLOCKED: { label: "Blocked", variant: "destructive" as const, className: "", icon: ShieldAlert },
  RATE_LIMITED: { label: "Rate Limited", variant: "secondary" as const, className: "bg-yellow-600", icon: Timer },
};

const STATUS_CONFIG: Record<AllowlistStatus, { label: string; className: string }> = {
  APPROVED: { label: "Approved", className: "bg-green-600 text-white" },
  PENDING: { label: "Pending", className: "bg-yellow-600 text-white" },
  REJECTED: { label: "Rejected", className: "bg-red-600 text-white" },
  REVOKED: { label: "Revoked", className: "bg-gray-600 text-white" },
};

const PAGE_SIZE = 50;

type Tab = "logs" | "allowlist" | "blacklist";

// ===========================================
// Helpers
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ===========================================
// Summary Cards
// ===========================================

function SummaryCards({ summary, proxyStatus }: { summary: EgressSummary | null; proxyStatus: ProxyStatus | null }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">Total Requests</div>
          </div>
          <div className="text-2xl font-bold mt-1">{summary?.totalRequests ?? "—"}</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-400" />
            <div className="text-xs text-muted-foreground">Allowed</div>
          </div>
          <div className="text-2xl font-bold text-green-400 mt-1">{summary?.allowed ?? "—"}</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
          <div className="text-2xl font-bold text-red-400 mt-1">{summary?.blocked ?? "—"}</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-yellow-400" />
            <div className="text-xs text-muted-foreground">Rate Limited</div>
          </div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{summary?.rateLimited ?? "—"}</div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Proxy Status</div>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${proxyStatus?.running ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-sm font-medium">
              {proxyStatus?.running ? "Running" : "Offline"}
            </span>
          </div>
          {proxyStatus?.ipAddress && (
            <div className="text-xs text-muted-foreground mt-1">{proxyStatus.ipAddress}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================
// Top Domains Card
// ===========================================

function TopDomainsCard({ domains }: { domains: { domain: string; count: number }[] }) {
  if (!domains || domains.length === 0) return null;

  const maxCount = domains[0]?.count ?? 1;

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="pt-4">
        <div className="text-sm font-medium mb-3">Top Domains (24h)</div>
        <div className="space-y-2">
          {domains.map((d) => (
            <div key={d.domain} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-mono truncate">{d.domain}</div>
                <div className="h-1.5 bg-muted rounded-full mt-1">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${(d.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground w-12 text-right">{d.count}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Traffic Logs Tab
// ===========================================

function TrafficLogsSection() {
  const [logs, setLogs] = useState<EgressLog[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<EgressSummary | null>(null);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [searchDomain, setSearchDomain] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (searchDomain) params.set("domain", searchDomain);
      if (actionFilter && actionFilter !== "all") params.set("action", actionFilter);

      const [logsRes, summaryRes, statusRes] = await Promise.all([
        fetch(apiUrl(`/admin/workspaces/egress-logs?${params}`), { headers: getAuthHeaders() }),
        fetch(apiUrl("/admin/workspaces/egress-logs/summary"), { headers: getAuthHeaders() }),
        fetch(apiUrl("/admin/workspaces/proxy-status"), { headers: getAuthHeaders() }),
      ]);

      if (logsRes.ok) {
        const json = await logsRes.json();
        setLogs(json.data?.logs ?? []);
        setTotal(json.data?.total ?? 0);
      }

      if (summaryRes.ok) {
        const json = await summaryRes.json();
        setSummary(json.data ?? null);
      }

      if (statusRes.ok) {
        const json = await statusRes.json();
        setProxyStatus(json.data ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch egress data:", err);
    } finally {
      setLoading(false);
    }
  }, [page, searchDomain, actionFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <SummaryCards summary={summary} proxyStatus={proxyStatus} />

      {/* Top Domains + Bandwidth */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TopDomainsCard domains={summary?.topDomains ?? []} />
        <Card className="md:col-span-2 border-border bg-card/50">
          <CardContent className="pt-4">
            <div className="text-sm font-medium mb-3">Bandwidth (24h)</div>
            <div className="text-3xl font-bold">{summary ? formatBytes(summary.bytesTotal) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by domain..."
            value={searchDomain}
            onChange={(e) => { setSearchDomain(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="ALLOWED">Allowed</SelectItem>
            <SelectItem value="BLOCKED">Blocked</SelectItem>
            <SelectItem value="RATE_LIMITED">Rate Limited</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Logs Table */}
      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead className="w-36">Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="w-20">Method</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24">Action</TableHead>
              <TableHead className="w-20 text-right">Bytes</TableHead>
              <TableHead className="w-16 text-right">ms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No egress logs found. The proxy may not have started or no traffic has been recorded.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const actionCfg = ACTION_CONFIG[log.action];
                const ActionIcon = actionCfg.icon;
                return (
                  <TableRow key={log.id} className="border-b border-border/50 hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{log.container?.user?.name || log.container?.user?.email || "—"}</div>
                      <div className="text-xs text-muted-foreground">{log.container?.containerName || log.containerId}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{log.domain}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.method}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-mono ${
                        log.httpStatus >= 200 && log.httpStatus < 300 ? "text-green-400" :
                        log.httpStatus >= 400 ? "text-red-400" :
                        "text-yellow-400"
                      }`}>
                        {log.httpStatus}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionCfg.variant} className={`text-xs gap-1 ${actionCfg.className}`}>
                        <ActionIcon className="h-3 w-3" />
                        {actionCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {formatBytes(log.bytesTransferred)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">
                      {log.elapsedMs}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-muted-foreground">Page {page + 1} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================
// Domain Allowlist Tab
// ===========================================

function AllowlistSection() {
  const [entries, setEntries] = useState<AllowedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchAllowlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl("/admin/workspaces/allowed-domains"),
        { headers: getAuthHeaders() },
      );
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch allowed domains:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllowlist();
  }, [fetchAllowlist]);

  const handleAction = async (
    id: string,
    action: "APPROVED" | "REJECTED" | "REVOKED",
  ) => {
    setActionLoading(id);
    try {
      const res = await fetch(
        apiUrl(`/admin/workspaces/allowed-domains/${id}`),
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ action }),
        },
      );
      if (res.ok) {
        await fetchAllowlist();
      }
    } catch (err) {
      console.error(`Failed to ${action} domain:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered =
    statusFilter === "all"
      ? entries
      : entries.filter((e) => e.status === statusFilter);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="REVOKED">Revoked</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchAllowlist} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Allowlist Table */}
      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead>User</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-40">Created At</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No domain allowlist entries found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => {
                const statusCfg = STATUS_CONFIG[entry.status];
                const isActioning = actionLoading === entry.id;
                return (
                  <TableRow key={entry.id} className="border-b border-border/50 hover:bg-muted/30">
                    <TableCell>
                      <div className="text-sm">{entry.user?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{entry.user?.email || "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{entry.domain}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.reason || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {entry.status !== "APPROVED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-400 hover:text-green-300 hover:bg-green-950/30"
                            disabled={isActioning}
                            onClick={() => handleAction(entry.id, "APPROVED")}
                            title="Approve"
                          >
                            {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          </Button>
                        )}
                        {entry.status !== "REJECTED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                            disabled={isActioning}
                            onClick={() => handleAction(entry.id, "REJECTED")}
                            title="Reject"
                          >
                            {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          </Button>
                        )}
                        {entry.status !== "REVOKED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-gray-300 hover:bg-gray-950/30"
                            disabled={isActioning}
                            onClick={() => handleAction(entry.id, "REVOKED")}
                            title="Revoke"
                          >
                            {isActioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ===========================================
// Admin Blacklist Tab
// ===========================================

function BlacklistSection() {
  const [entries, setEntries] = useState<BlockedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newReason, setNewReason] = useState("");

  const fetchBlacklist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl("/admin/workspaces/blocked-domains"),
        { headers: getAuthHeaders() },
      );
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch blocked domains:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlacklist();
  }, [fetchBlacklist]);

  const handleRemove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(
        apiUrl(`/admin/workspaces/blocked-domains/${id}`),
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        },
      );
      if (res.ok) {
        await fetchBlacklist();
      }
    } catch (err) {
      console.error("Failed to remove blocked domain:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch(
        apiUrl("/admin/workspaces/blocked-domains"),
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            domain: newDomain.trim(),
            reason: newReason.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setNewDomain("");
        setNewReason("");
        await fetchBlacklist();
      }
    } catch (err) {
      console.error("Failed to add blocked domain:", err);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Form */}
      <Card className="border-border bg-card/50 p-4">
        <div className="text-sm font-medium mb-3">Block a Domain</div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="e.g. malicious-site.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="pl-9"
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
          </div>
          <Input
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="flex-1 max-w-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <Button onClick={handleAdd} disabled={addLoading || !newDomain.trim()}>
            {addLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add
          </Button>
        </div>
      </Card>

      {/* Refresh */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={fetchBlacklist} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Blacklist Table */}
      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead>Domain</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Added By</TableHead>
              <TableHead className="w-40">Created At</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No blocked domains. Use the form above to add one.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const isRemoving = actionLoading === entry.id;
                return (
                  <TableRow key={entry.id} className="border-b border-border/50 hover:bg-muted/30">
                    <TableCell className="font-mono text-sm">{entry.domain}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.reason || "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{entry.addedBy?.name || entry.addedBy?.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(entry.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        disabled={isRemoving}
                        onClick={() => handleRemove(entry.id)}
                        title="Remove"
                      >
                        {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export default function AdminNetworkPage() {
  const [activeTab, setActiveTab] = useState<Tab>("logs");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network"
        description="Traffic logs, domain allowlists, and admin blacklist for the workspace egress proxy."
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "logs"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Network className="h-4 w-4" />
          Traffic Logs
        </button>
        <button
          onClick={() => setActiveTab("allowlist")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "allowlist"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          Domain Allowlists
        </button>
        <button
          onClick={() => setActiveTab("blacklist")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "blacklist"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldBan className="h-4 w-4" />
          Admin Blacklist
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "logs" && <TrafficLogsSection />}
      {activeTab === "allowlist" && <AllowlistSection />}
      {activeTab === "blacklist" && <BlacklistSection />}
    </div>
  );
}
