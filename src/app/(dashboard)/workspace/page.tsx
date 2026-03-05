"use client";

/**
 * Workspace Dashboard Page
 *
 * Full-featured IDE-like workspace for managing Docker containers.
 * Includes file explorer, code editor, terminal, plugin manager,
 * and log viewer in a resizable panel layout.
 *
 * @module app/(dashboard)/workspace/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    WorkspaceBackupPanel,
    WorkspaceCodeEditor,
    WorkspaceFileExplorer,
    WorkspaceLogViewer,
    WorkspacePluginManager,
    WorkspaceStatusPanel,
    WorkspaceTerminalView,
} from "@/components/workspace";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import type { WorkspaceFileEntry } from "@/shared/types/workspace";
import {
    AlertCircle,
    ArrowDownLeft,
    ArrowUpRight,
    Box,
    Check,
    Copy,
    Globe,
    Link2,
    Loader2,
    Network,
    Package,
    Rocket,
    ShieldAlert,
    ShieldCheck,
    Terminal,
    Timer,
    X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, type Layout } from "react-resizable-panels";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";

// ===========================================
// Package Install Panel
// ===========================================

function PackageInstallPanel({
  onInstall,
}: {
  onInstall: (packages: string[], dev?: boolean) => Promise<void>;
}) {
  const [packages, setPackages] = useState("");
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleInstall = async (dev = false) => {
    const pkgList = packages.split(/[\s,]+/).filter(Boolean);
    if (pkgList.length === 0) return;
    setInstalling(true);
    setResult(null);
    try {
      await onInstall(pkgList, dev);
      setResult(`Installed: ${pkgList.join(", ")}`);
      setPackages("");
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Install failed"}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4 text-red-400" />
          Install Packages
        </CardTitle>
        <CardDescription className="text-xs">
          Install npm packages into your workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          value={packages}
          onChange={(e) => setPackages(e.target.value)}
          placeholder="axios lodash dayjs"
          className="h-8 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleInstall()}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-8"
            onClick={() => handleInstall(false)}
            disabled={installing || !packages.trim()}
          >
            {installing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Package className="h-4 w-4 mr-1" />}
            Install
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => handleInstall(true)}
            disabled={installing || !packages.trim()}
          >
            Install (dev)
          </Button>
        </div>
        {result ? (
          <p className={`text-xs ${result.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {result}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ===========================================
// Network Traffic Panel (User View)
// ===========================================

interface NetworkLogEntry {
  id: string;
  timestamp: string;
  domain: string;
  method: string;
  httpStatus: number;
  action: "ALLOWED" | "BLOCKED" | "RATE_LIMITED";
  direction: "INBOUND" | "OUTBOUND";
  bytesTransferred: number;
  elapsedMs: number;
  sourceType?: string;
}

interface NetworkSummary {
  totalRequests: number;
  allowed: number;
  blocked: number;
  rateLimited: number;
  inbound: number;
  outbound: number;
  topDomains: { domain: string; count: number }[];
  bytesTotal: number;
}

interface AllowedDomain {
  id: string;
  domain: string;
  reason: string | null;
  status: string;
  consentAt: string | null;
  createdAt: string;
}

// ===========================================
// Domain Allowlist Management
// ===========================================

function WorkspaceDomainAllowlist() {
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [systemDomains, setSystemDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(apiUrl("/workspace/allowed-domains"), { headers });
      if (res.ok) {
        const json = await res.json();
        setDomains(json.data?.domains ?? []);
        setSystemDomains(json.data?.systemDomains ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAdd = async () => {
    if (!newDomain.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(apiUrl("/workspace/allowed-domains"), {
        method: "POST",
        headers,
        body: JSON.stringify({ domain: newDomain.trim(), reason: reason.trim() || undefined }),
      });
      if (res.ok) {
        setNewDomain("");
        setReason("");
        setShowConsent(false);
        toast.success(`Domain "${newDomain.trim()}" added to allowlist`);
        fetchDomains();
      } else {
        const json = await res.json();
        setError(json.error?.message || json.message || "Failed to add domain");
      }
    } catch {
      setError("Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string, domain: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      await fetch(apiUrl(`/workspace/allowed-domains/${id}`), {
        method: "DELETE",
        headers,
      });
      toast.success(`Domain "${domain}" removed`);
      fetchDomains();
    } catch {
      toast.error("Failed to remove domain");
    }
  };

  return (
    <div className="flex-shrink-0 border border-border rounded p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
          Allowed Domains
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={fetchDomains} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* System domains (read-only) */}
      {systemDomains.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium">System (always allowed)</div>
          <div className="flex flex-wrap gap-1">
            {systemDomains.map((d) => (
              <Badge key={d} variant="outline" className="text-[10px] font-mono h-5 px-1.5 bg-muted/30">
                {d}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* User domains */}
      {domains.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium">Your domains</div>
          <div className="flex flex-wrap gap-1">
            {domains.map((d) => (
              <Badge
                key={d.id}
                variant="outline"
                className="text-[10px] font-mono h-5 px-1.5 bg-blue-500/10 border-blue-500/30 group"
              >
                {d.domain}
                <button
                  onClick={() => handleRemove(d.id, d.domain)}
                  className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove domain"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Add domain form */}
      {showConsent ? (
        <div className="space-y-2 border border-border rounded p-2 bg-muted/20">
          <div className="text-[10px] font-medium text-yellow-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            External Access Consent
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            You are adding a custom domain to your container&apos;s network allowlist. By doing so, you
            accept responsibility for any data sent to or received from this domain.
            2Bot is not responsible for the content, security, or availability of external services.
          </p>
          <Input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            className="h-7 text-xs font-mono"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why do you need this? (optional)"
            className="h-7 text-xs"
          />
          {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={handleAdd}
              disabled={adding || !newDomain.trim()}
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              I Accept — Add Domain
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={() => { setShowConsent(false); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2"
          onClick={() => setShowConsent(true)}
        >
          + Add Domain
        </Button>
      )}
    </div>
  );
}

function WorkspaceNetworkPanel({ containerId }: { containerId: string | null }) {
  const [logs, setLogs] = useState<NetworkLogEntry[]>([]);
  const [summary, setSummary] = useState<NetworkSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirFilter, setDirFilter] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");

  const fetchNetwork = useCallback(async () => {
    if (!containerId) return;
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const dirParam = dirFilter !== "ALL" ? `&direction=${dirFilter}` : "";
      const [logsRes, summaryRes] = await Promise.all([
        fetch(apiUrl(`/workspace/${containerId}/egress-logs?limit=200${dirParam}`), { headers }),
        fetch(apiUrl(`/workspace/${containerId}/egress-logs/summary`), { headers }),
      ]);

      if (logsRes.ok) {
        const json = await logsRes.json();
        setLogs(json.data?.logs ?? []);
      }
      if (summaryRes.ok) {
        const json = await summaryRes.json();
        setSummary(json.data ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch network data:", err);
    } finally {
      setLoading(false);
    }
  }, [containerId, dirFilter]);

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!containerId) return;
    const interval = setInterval(fetchNetwork, 15_000);
    return () => clearInterval(interval);
  }, [containerId, fetchNetwork]);

  if (!containerId) {
    return <div className="text-center text-muted-foreground text-sm py-8">No workspace active</div>;
  }

  // Bucket logs into hourly bins for the chart
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const chartData = useMemo(() => {
    if (!logs.length) return [];
    const buckets = new Map<string, { time: string; allowed: number; blocked: number }>();
    // Group by hour:minute (5-min buckets for finer granularity)
    for (const log of logs) {
      const d = new Date(log.timestamp);
      const min = Math.floor(d.getMinutes() / 10) * 10;
      const key = `${d.getHours().toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
      const b = buckets.get(key) || { time: key, allowed: 0, blocked: 0 };
      if (log.action === "ALLOWED") b.allowed++;
      else b.blocked++;
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [logs]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="flex flex-col h-full space-y-3 min-h-0">
      {/* Summary row */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs">
          {summary ? (
            <>
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> {summary.totalRequests} requests
              </span>
              <span className="flex items-center gap-1 text-green-400">
                <ShieldCheck className="h-3 w-3" /> {summary.allowed} allowed
              </span>
              {summary.blocked > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <ShieldAlert className="h-3 w-3" /> {summary.blocked} blocked
                </span>
              )}
              {summary.rateLimited > 0 && (
                <span className="flex items-center gap-1 text-yellow-400">
                  <Timer className="h-3 w-3" /> {summary.rateLimited} rate limited
                </span>
              )}
              <span className="flex items-center gap-1 text-blue-400">
                <ArrowUpRight className="h-3 w-3" /> {summary.outbound} out
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <ArrowDownLeft className="h-3 w-3" /> {summary.inbound} in
              </span>
              <span className="text-muted-foreground">
                {formatBytes(summary.bytesTotal)} transferred
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {/* Direction filter */}
          <div className="flex border border-border rounded overflow-hidden mr-2">
            {(["ALL", "OUTBOUND", "INBOUND"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                className={cn(
                  "px-2 py-0.5 text-[10px] transition-colors",
                  dirFilter === d
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
              >
                {d === "ALL" ? "All" : d === "OUTBOUND" ? "Out" : "In"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchNetwork} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Request volume chart */}
      {chartData.length > 1 ? (
        <div className="flex-shrink-0 border border-border rounded p-2 bg-muted/20">
          <div className="text-[10px] font-medium text-muted-foreground mb-1">Request Volume (10-min buckets)</div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={chartData} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                labelStyle={{ fontSize: 11 }}
              />
              <Area type="monotone" dataKey="allowed" stackId="1" stroke="#4ade80" fill="#4ade80" fillOpacity={0.15} />
              <Area type="monotone" dataKey="blocked" stackId="1" stroke="#f87171" fill="#f87171" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Recent traffic table */}
      <div className="flex-1 flex flex-col border border-border rounded text-xs min-h-0">
        <ScrollArea className="flex-1">
          <div className="min-w-[540px]">
            <div className="sticky top-0 z-10 grid grid-cols-[28px_100px_1fr_60px_50px_60px_50px] gap-2 px-2 py-1.5 border-b border-border bg-muted/90 backdrop-blur font-medium">
              <div></div>
              <div>Time</div>
              <div>Domain</div>
              <div>Method</div>
              <div>Status</div>
              <div>Action</div>
              <div className="text-right">Size</div>
            </div>
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No network traffic recorded yet.
              </div>
            ) : (
              logs.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[28px_100px_1fr_60px_50px_60px_50px] gap-2 px-2 py-1 border-b border-border/30 hover:bg-muted/20"
                >
                  <div className="flex items-center justify-center" title={entry.direction === "INBOUND" ? "Inbound" : "Outbound"}>
                    {entry.direction === "INBOUND" ? (
                      <ArrowDownLeft className="h-3 w-3 text-purple-400" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3 text-blue-400" />
                    )}
                  </div>
                  <div className="text-muted-foreground font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="font-mono truncate">{entry.domain}</div>
                  <div>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {entry.method}
                    </Badge>
                  </div>
                  <div className={`font-mono ${
                    entry.httpStatus >= 200 && entry.httpStatus < 300 ? "text-green-400" :
                    entry.httpStatus >= 400 ? "text-red-400" : "text-yellow-400"
                  }`}>
                    {entry.httpStatus}
                  </div>
                  <div>
                    <Badge
                      variant={entry.action === "BLOCKED" ? "destructive" : entry.action === "RATE_LIMITED" ? "secondary" : "default"}
                      className={`text-[10px] h-4 px-1 ${entry.action === "ALLOWED" ? "bg-green-600" : entry.action === "RATE_LIMITED" ? "bg-yellow-600" : ""}`}
                    >
                      {entry.action === "ALLOWED" ? "OK" : entry.action === "BLOCKED" ? "BLK" : "LIM"}
                    </Badge>
                  </div>
                  <div className="text-right text-muted-foreground font-mono">
                    {formatBytes(entry.bytesTransferred)}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Top domains */}
      {summary && summary.topDomains.length > 0 ? (
        <div className="flex-shrink-0 text-xs">
          <div className="font-medium mb-1">Top Domains (24h)</div>
          <div className="flex flex-wrap gap-2">
            {summary.topDomains.slice(0, 5).map((d) => (
              <Badge key={d.domain} variant="outline" className="text-[10px] font-mono">
                {d.domain} ({d.count})
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {/* Domain Allowlist Management */}
      <WorkspaceDomainAllowlist />
    </div>
  );
}

// ===========================================
// ===========================================
// Gateway Monitoring Panel (read-only overview of all gateway types)
// ===========================================

interface GatewayOverviewItem {
  id: string;
  name: string;
  type: string;
  status: string;
  url?: string;
  pluginFile?: string | null;
  credentials?: Record<string, string>;
  credentialKeys?: string[];
  lastConnectedAt?: string | null;
  plugins: Array<{ id?: string; name: string; entryFile: string | null; isEnabled: boolean }>;
}

function WorkspaceGatewaysPanel({ containerId }: { containerId: string | null }) {
  const [gateways, setGateways] = useState<GatewayOverviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchGateways = useCallback(async () => {
    if (!containerId) return;
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(apiUrl(`/workspace/${containerId}/gateways-overview`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success && result.data?.gateways) {
        setGateways(result.data.gateways);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  useEffect(() => { fetchGateways(); }, [fetchGateways]);
  useEffect(() => {
    if (!containerId) return;
    const interval = setInterval(fetchGateways, 30_000);
    return () => clearInterval(interval);
  }, [containerId, fetchGateways]);

  const handleCopyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success("URL copied");
      setTimeout(() => setCopiedId(null), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TELEGRAM_BOT": return <Network className="h-3 w-3 text-blue-400 flex-shrink-0" />;
      case "AI": return <Globe className="h-3 w-3 text-amber-400 flex-shrink-0" />;
      case "CUSTOM_GATEWAY": return <Link2 className="h-3 w-3 text-purple-400 flex-shrink-0" />;
      default: return <Network className="h-3 w-3 text-muted-foreground flex-shrink-0" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "TELEGRAM_BOT": return "Telegram";
      case "AI": return "AI";
      case "CUSTOM_GATEWAY": return "Custom";
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONNECTED":
      case "ACTIVE": return "bg-green-600";
      case "DISCONNECTED":
      case "INACTIVE": return "";
      case "ERROR": return "bg-red-600";
      default: return "";
    }
  };

  if (!containerId) {
    return <div className="text-center text-muted-foreground text-sm py-8">No workspace active</div>;
  }

  return (
    <div className="flex flex-col h-full space-y-3 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <Network className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-medium">All Gateways</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {gateways.length}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchGateways} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* Gateways list */}
      <div className="flex-1 flex flex-col border border-border rounded text-xs min-h-0">
        <ScrollArea className="flex-1">
          {loading && gateways.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : gateways.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground space-y-2">
              <Network className="h-6 w-6 mx-auto opacity-40" />
              <p>No gateways configured yet.</p>
              <p className="text-[10px] max-w-xs mx-auto">
                Go to <strong>Gateways → Add Gateway</strong> to create Telegram bots, AI providers, or custom gateways.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {gateways.map((gw) => {
                const isExpanded = expandedId === gw.id;

                return (
                  <div key={gw.id} className="hover:bg-muted/20">
                    {/* Main row */}
                    <div
                      className="grid grid-cols-[auto_1fr_80px_50px] gap-2 px-3 py-2 cursor-pointer items-center"
                      onClick={() => setExpandedId(isExpanded ? null : gw.id)}
                    >
                      <div className="flex items-center gap-1.5">
                        {getTypeIcon(gw.type)}
                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                          {getTypeLabel(gw.type)}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{gw.name}</div>
                        {gw.plugins.length > 0 ? (
                          <div className="text-muted-foreground truncate text-[10px]">
                            {gw.plugins.map(p => p.name).join(", ")}
                          </div>
                        ) : (
                          <div className="text-muted-foreground/50 italic text-[10px]">no plugin connected</div>
                        )}
                      </div>
                      <div className="text-center">
                        <Badge
                          variant={gw.status === "CONNECTED" || gw.status === "ACTIVE" ? "default" : "secondary"}
                          className={`text-[10px] h-4 px-1.5 ${getStatusColor(gw.status)}`}
                        >
                          {gw.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        {gw.url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); handleCopyUrl(gw.url ?? '', gw.id); }}
                            title="Copy URL"
                          >
                            {copiedId === gw.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded ? (
                      <div className="px-3 pb-3 space-y-1.5 bg-muted/10 border-t border-border/20 pt-2">
                        {gw.url ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-14 flex-shrink-0">URL:</span>
                            <code className="font-mono text-[10px] text-emerald-400 bg-muted px-1.5 py-0.5 rounded truncate flex-1">
                              {gw.url}
                            </code>
                            <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => handleCopyUrl(gw.url ?? '', gw.id)}>
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        ) : null}
                        {gw.type === "CUSTOM_GATEWAY" ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-14 flex-shrink-0">Plugin:</span>
                            <span className="font-mono text-[10px]">
                              {gw.pluginFile || <span className="italic text-muted-foreground/50">no plugin connected — assign in plugin config</span>}
                            </span>
                          </div>
                        ) : null}
                        {gw.type === "CUSTOM_GATEWAY" && gw.credentialKeys && gw.credentialKeys.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-14 flex-shrink-0">Creds:</span>
                            <span className="font-mono text-[10px]">
                              {gw.credentialKeys.join(", ")}
                            </span>
                          </div>
                        ) : null}
                        {gw.plugins.length > 0 && gw.type !== "CUSTOM_GATEWAY" ? (
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-[10px]">Connected Plugins:</span>
                            {gw.plugins.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 pl-2">
                                <div className={`h-1.5 w-1.5 rounded-full ${p.isEnabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                                <span className="text-[10px]">{p.name}</span>
                                {p.entryFile ? <span className="text-muted-foreground text-[10px] font-mono">{p.entryFile}</span> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {gw.lastConnectedAt ? (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground w-14 flex-shrink-0">Last:</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(gw.lastConnectedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Info footer */}
      <div className="flex-shrink-0 text-[10px] text-muted-foreground bg-muted/20 rounded p-2">
        <p>
          Manage gateways from <strong>Gateways → Add Gateway</strong>. Connect plugins to gateways via the plugin&apos;s{" "}
          <strong>Configure</strong> button.
        </p>
      </div>
    </div>
  );
}

// ===========================================
// Empty State (No Workspace)
// ===========================================

function NoWorkspaceState({
  onCreate,
  loading,
  error,
}: {
  onCreate: () => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="p-6 rounded-full bg-purple-600/10 border border-purple-600/20">
        <Box className="h-12 w-12 text-purple-400" />
      </div>
      <div className="text-center space-y-2 max-w-md">
        <h2 className="text-xl font-semibold">No Workspace Yet</h2>
        <p className="text-muted-foreground text-sm">
          Create a Docker workspace to start developing plugins. Your workspace
          provides an isolated container with a code editor, terminal, and
          plugin runner.
        </p>
      </div>
      {error ? (
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        onClick={onCreate}
        disabled={loading}
        size="lg"
        className="bg-purple-600 hover:bg-purple-700"
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <Rocket className="h-5 w-5 mr-2" />
        )}
        Create Workspace
      </Button>
    </div>
  );
}

// ===========================================
// Main Workspace Page
// ===========================================

export default function WorkspacePage() {
  const { context } = useAuth();
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // Panel layout persistence
  const LAYOUT_KEY = "workspace-panel-layout";
  const savedLayout = useMemo<Layout | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) return JSON.parse(raw) as Layout;
    } catch { /* ignore */ }
    return undefined;
  }, []);
  const handleLayoutChanged = useCallback((layout: Layout) => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
  }, []);

  // File tab bar state
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string; dirty: boolean }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const fileContentCache = useRef<Record<string, string>>({});
  const focusHandled = useRef(false);

  const isOrgContext = context.type === "organization";
  const hasWorkspace = ws.workspace !== null;
  const isRunning = ws.workspace?.status === "RUNNING";
  const isFreeTier = !isOrgContext && (context.plan === "FREE" || context.plan === "STARTER");

  // Load files when workspace is running
  useEffect(() => {
    if (isRunning) {
      ws.listFiles("/");
      ws.refreshPlugins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  // Handle ?focus= query param — auto-open a file when workspace is ready
  const focusPath = searchParams.get("focus");
  useEffect(() => {
    if (!focusPath || !isRunning || focusHandled.current) return;
    // Wait for files to be listed before opening
    if (ws.files.length === 0) return;
    focusHandled.current = true;

    const filePath = focusPath.startsWith("/") ? focusPath : `/${focusPath}`;
    const fileName = filePath.split("/").pop() || filePath;

    // Open the file in a new tab (same logic as handleFileSelect but without needing a WorkspaceFileEntry)
    (async () => {
      setLoadingFile(true);
      try {
        const content = await ws.readFile(filePath);
        fileContentCache.current[filePath] = content;
      } catch {
        fileContentCache.current[filePath] = `// Error loading file: ${filePath}`;
      } finally {
        setLoadingFile(false);
      }
      setOpenTabs((prev) => {
        if (prev.some((t) => t.path === filePath)) return prev;
        return [...prev, { path: filePath, name: fileName, dirty: false }];
      });
      setActiveTabPath(filePath);
    })();
  }, [focusPath, isRunning, ws.files.length, ws]);

  // Handle file selection (opens in tab bar)
  const handleFileSelect = useCallback(
    async (file: WorkspaceFileEntry) => {
      if (file.type === "DIRECTORY") return;
      // Already open? Just switch
      const existing = openTabs.find((t) => t.path === file.path);
      if (existing) {
        setActiveTabPath(file.path);
        return;
      }
      // Load and add tab
      setLoadingFile(true);
      try {
        const content = await ws.readFile(file.path);
        fileContentCache.current[file.path] = content;
      } catch {
        fileContentCache.current[file.path] = `// Error loading file: ${file.path}`;
      } finally {
        setLoadingFile(false);
      }
      setOpenTabs((prev) => [...prev, { path: file.path, name: file.name, dirty: false }]);
      setActiveTabPath(file.path);
    },
    [openTabs, ws]
  );

  // Close a file tab
  const handleCloseTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const newTabs = prev.filter((t) => t.path !== path);
        if (activeTabPath === path) {
          const idx = prev.findIndex((t) => t.path === path);
          const nextTab = newTabs[Math.min(idx, newTabs.length - 1)];
          setActiveTabPath(nextTab?.path ?? null);
        }
        return newTabs;
      });
      delete fileContentCache.current[path];
    },
    [activeTabPath]
  );

  // Track dirty state from editor
  const handleTabDirtyChange = useCallback(
    (dirty: boolean) => {
      if (!activeTabPath) return;
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === activeTabPath ? { ...t, dirty } : t))
      );
    },
    [activeTabPath]
  );

  // Track content changes from editor (for tab switching)
  const handleTabContentChange = useCallback(
    (content: string) => {
      if (activeTabPath) {
        fileContentCache.current[activeTabPath] = content;
      }
    },
    [activeTabPath]
  );

  // Handle file save
  const handleFileSave = useCallback(
    async (path: string, content: string) => {
      try {
        await ws.writeFile(path, content);
        await ws.listFiles("/");
        toast.success(`Saved ${path.split("/").pop()}`);
      } catch (err) {
        toast.error(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [ws]
  );

  // Handle create file
  const handleCreateFile = useCallback(
    async (path: string) => {
      try {
        await ws.writeFile(path, "");
        toast.success(`Created ${path.split("/").pop()}`);
      } catch (err) {
        toast.error(`Create failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [ws]
  );

  // Handle package install
  const handlePackageInstall = useCallback(
    async (packages: string[], dev?: boolean) => {
      await ws.installPackages(packages, dev);
    },
    [ws]
  );

  // Wrapped delete with toast
  const handleDeleteFile = useCallback(
    async (path: string) => {
      try {
        await ws.deleteFile(path);
        toast.success(`Deleted ${path.split("/").pop()}`);
      } catch (err) {
        toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [ws]
  );

  // Wrapped createDir with toast
  const handleCreateDir = useCallback(
    async (path: string) => {
      try {
        await ws.createDir(path);
        toast.success(`Created folder ${path.split("/").pop()}`);
      } catch (err) {
        toast.error(`Create folder failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [ws]
  );

  // Register a directory as a plugin
  const handleRegisterAsPlugin = useCallback(
    async (dirPath: string) => {
      try {
        const result = await ws.registerDirectoryAsPlugin(dirPath);
        toast.success(`Registered "${result.pluginSlug}" as plugin`);
        await ws.listFiles("/");
      } catch (err) {
        toast.error(`Register plugin failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [ws]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspace"
        description={
          isOrgContext
            ? "Your isolated Docker workspace for plugin development (organization)"
            : "Your isolated Docker workspace for plugin development"
        }
        icon={<Box className="h-6 w-6 text-purple-400" />}
        breadcrumbs={[{ label: "Dashboard", href: "/" }]}
      />

      {/* No workspace state */}
      {!hasWorkspace && !ws.loading && (
        <NoWorkspaceState
          onCreate={ws.createWorkspace}
          loading={ws.loading}
          error={ws.error}
        />
      )}

      {/* Loading initial state */}
      {Boolean(ws.loading && !hasWorkspace) && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      )}

      {/* Workspace exists */}
      {hasWorkspace ? (
        <div className="space-y-4">
          {/* Status + Plugin panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WorkspaceStatusPanel
              workspace={ws.workspace}
              stats={ws.stats}
              loading={ws.loading}
              error={ws.error}
              isFreeTier={isFreeTier}
              onStart={ws.startWorkspace}
              onStop={ws.stopWorkspace}
              onDestroy={ws.destroyWorkspace}
              onRefresh={ws.refreshStatus}
              onUpdateAutoStop={isFreeTier ? undefined : ws.updateAutoStop}
            />
            <WorkspacePluginManager
              plugins={ws.plugins}
              onStart={ws.startPlugin}
              onStop={ws.stopPlugin}
              onRestart={ws.restartPlugin}
              onRefresh={ws.refreshPlugins}
              onValidate={ws.validatePlugin}
            />
          </div>

          {/* IDE area when running */}
          {isRunning ? (
            <div className="border border-border rounded-lg overflow-hidden bg-card/30 resize-y min-h-[300px]" style={{ height: "calc(100vh - 20rem)" }}>
              <PanelGroup orientation="horizontal" id="workspace-layout" defaultLayout={savedLayout} onLayoutChanged={handleLayoutChanged} className="h-full">
                {/* Left sidebar: File explorer (resizable) */}
                <Panel id="file-explorer" defaultSize={50} minSize={10} collapsible>
                  <div className="h-full overflow-hidden border-r border-border">
                    <WorkspaceFileExplorer
                      files={ws.files}
                      onFileSelect={handleFileSelect}
                      onRefresh={ws.listFiles}
                      onCreateFile={handleCreateFile}
                      onCreateDir={handleCreateDir}
                      onDelete={handleDeleteFile}
                      onStartPlugin={ws.startPlugin}
                      onRegisterAsPlugin={handleRegisterAsPlugin}
                      onUploadFile={handleFileSave}
                      selectedPath={activeTabPath ?? undefined}
                    />
                  </div>
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-border/50 hover:bg-primary/50 transition-colors duration-150 cursor-col-resize flex items-center justify-center group">
                  <div className="w-0.5 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-primary/60 transition-colors" />
                </PanelResizeHandle>

                {/* Center: Editor + Tabs */}
                <Panel id="main-content" minSize={20}>
                  <div className="flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
                    <Tabs defaultValue="editor" className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between border-b border-border px-2 flex-shrink-0">
                        <TabsList className="h-9">
                          <TabsTrigger value="editor" className="text-xs">
                            Editor
                          </TabsTrigger>
                          <TabsTrigger value="logs" className="text-xs">
                            Logs
                          </TabsTrigger>
                          <TabsTrigger value="network" className="text-xs">
                            <Network className="h-3 w-3 mr-1" />
                            Network
                          </TabsTrigger>
                          <TabsTrigger value="gateways" className="text-xs">
                            <Link2 className="h-3 w-3 mr-1" />
                            Gateways
                          </TabsTrigger>
                        </TabsList>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setTerminalOpen(!terminalOpen)}
                        >
                          <Terminal className="h-3.5 w-3.5 mr-1" />
                          Terminal
                        </Button>
                      </div>

                      <TabsContent value="editor" className="flex-1 flex flex-col m-0 min-h-0">
                        {/* File Tab Bar */}
                        {openTabs.length > 0 ? (
                          <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto flex-shrink-0">
                            {openTabs.map((tab) => (
                              <div
                                key={tab.path}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border cursor-pointer hover:bg-muted/50 select-none min-w-0",
                                  tab.path === activeTabPath && "bg-card border-b-2 border-b-primary"
                                )}
                                onClick={() => setActiveTabPath(tab.path)}
                              >
                                {tab.dirty ? <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" /> : null}
                                <span className="truncate max-w-[120px]">{tab.name}</span>
                                <button
                                  className="ml-1 p-0.5 rounded hover:bg-muted-foreground/20 flex-shrink-0"
                                  onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.path); }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {loadingFile ? (
                          <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <WorkspaceCodeEditor
                            filePath={activeTabPath}
                            content={activeTabPath ? (fileContentCache.current[activeTabPath] ?? "") : ""}
                            onSave={handleFileSave}
                            onDirtyChange={handleTabDirtyChange}
                            onContentChange={handleTabContentChange}
                          />
                        )}
                      </TabsContent>

                      <TabsContent value="logs" className="flex-1 flex flex-col m-0 min-h-0">
                        <WorkspaceLogViewer
                          logs={ws.logs}
                          onFetch={ws.fetchLogs}
                        />
                      </TabsContent>

                      <TabsContent value="network" className="flex-1 flex flex-col m-0 min-h-0 p-3">
                        <WorkspaceNetworkPanel containerId={ws.workspace?.id ?? null} />
                      </TabsContent>

                      <TabsContent value="gateways" className="flex-1 flex flex-col m-0 min-h-0 p-3">
                        <WorkspaceGatewaysPanel containerId={ws.workspace?.id ?? null} />
                      </TabsContent>
                    </Tabs>

                    {/* Terminal panel (bottom) */}
                    <WorkspaceTerminalView
                      containerId={ws.workspace?.id ?? null}
                      visible={terminalOpen}
                      onClose={() => setTerminalOpen(false)}
                    />
                  </div>
                </Panel>

              </PanelGroup>
            </div>
          ) : null}

          {/* Git & Package & Backup panels */}
          {isRunning ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
              <PackageInstallPanel onInstall={handlePackageInstall} />
              <WorkspaceBackupPanel
                containerId={ws.workspace?.id ?? null}
                containerStatus={ws.workspace?.status}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
