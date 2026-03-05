"use client";

/**
 * Admin Domain ACL Management Page
 *
 * Two-section page for managing workspace egress proxy domain access:
 * 1. User Domain Allowlists - approve/reject/revoke user-requested domains
 * 2. Admin Blacklist - globally block domains from being accessed
 *
 * @module app/(admin)/admin/workspaces/domains/page
 */

import { PageHeader } from "@/components/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Ban,
  CheckCircle,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  ShieldBan,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

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

const STATUS_CONFIG: Record<
  AllowlistStatus,
  { label: string; className: string }
> = {
  APPROVED: { label: "Approved", className: "bg-green-600 text-white" },
  PENDING: { label: "Pending", className: "bg-yellow-600 text-white" },
  REJECTED: { label: "Rejected", className: "bg-red-600 text-white" },
  REVOKED: { label: "Revoked", className: "bg-gray-600 text-white" },
};

const TABS = ["allowlist", "blacklist"] as const;
type Tab = (typeof TABS)[number];

// ===========================================
// Helpers
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
// User Domain Allowlist Section
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
        apiUrl("/workspace/admin/allowed-domains"),
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
        apiUrl(`/workspace/admin/allowed-domains/${id}`),
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
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v)}
        >
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
        <Button
          variant="outline"
          size="icon"
          onClick={fetchAllowlist}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
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
                <TableCell
                  colSpan={6}
                  className="text-center py-12 text-muted-foreground"
                >
                  No domain allowlist entries found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((entry) => {
                const statusCfg = STATUS_CONFIG[entry.status];
                const isActioning = actionLoading === entry.id;
                return (
                  <TableRow
                    key={entry.id}
                    className="border-b border-border/50 hover:bg-muted/30"
                  >
                    <TableCell>
                      <div className="text-sm">
                        {entry.user?.name || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.user?.email || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.domain}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusCfg.className}`}>
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.reason || "—"}
                    </TableCell>
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
                            onClick={() =>
                              handleAction(entry.id, "APPROVED")
                            }
                            title="Approve"
                          >
                            {isActioning ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {entry.status !== "REJECTED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                            disabled={isActioning}
                            onClick={() =>
                              handleAction(entry.id, "REJECTED")
                            }
                            title="Reject"
                          >
                            {isActioning ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {entry.status !== "REVOKED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-400 hover:text-gray-300 hover:bg-gray-950/30"
                            disabled={isActioning}
                            onClick={() =>
                              handleAction(entry.id, "REVOKED")
                            }
                            title="Revoke"
                          >
                            {isActioning ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
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
// Admin Blacklist Section
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
        apiUrl("/workspace/admin/blocked-domains"),
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
        apiUrl(`/workspace/admin/blocked-domains/${id}`),
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
        apiUrl("/workspace/admin/blocked-domains"),
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
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <Input
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="flex-1 max-w-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button
            onClick={handleAdd}
            disabled={addLoading || !newDomain.trim()}
          >
            {addLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add
          </Button>
        </div>
      </Card>

      {/* Refresh */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={fetchBlacklist}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
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
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  No blocked domains. Use the form above to add one.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => {
                const isRemoving = actionLoading === entry.id;
                return (
                  <TableRow
                    key={entry.id}
                    className="border-b border-border/50 hover:bg-muted/30"
                  >
                    <TableCell className="font-mono text-sm">
                      {entry.domain}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {entry.addedBy?.name || entry.addedBy?.email || "—"}
                      </div>
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
                        {isRemoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
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

export default function AdminDomainAclPage() {
  const [activeTab, setActiveTab] = useState<Tab>("allowlist");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain ACL Management"
        description="Manage user domain allowlists and the global domain blacklist for the workspace egress proxy."
      />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("allowlist")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "allowlist"
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          User Domain Allowlists
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
      {activeTab === "allowlist" ? <AllowlistSection /> : <BlacklistSection />}
    </div>
  );
}
