"use client";

/**
 * Admin Audit Logs Page
 *
 * View and search system audit logs:
 * - Filter by action, resource, user, status
 * - Date range filtering
 * - Pagination
 * - View metadata details
 *
 * @module app/(admin)/admin/audit-logs/page
 */

import { useAuth } from "@/components/providers/auth-provider";
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
import { Skeleton } from "@/components/ui/skeleton";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Calendar,
    ChevronLeft,
    ChevronRight,
    FileText,
    Filter,
    Search,
    X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface AuditLog {
  id: string;
  userId: string | null;
  organizationId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  createdAt: string;
}

function LogRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-32 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-24 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-20 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-28 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-20 bg-muted" />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return <Badge className="bg-green-600">Success</Badge>;
  }
  if (status === "failure") {
    return <Badge variant="destructive">Failure</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default function AdminAuditLogsPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (actionFilter) params.set("action", actionFilter);
      if (resourceFilter && resourceFilter !== "all") params.set("resource", resourceFilter);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await fetch(adminApiUrl(`/audit-logs?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      if (data.success && data.data) {
        setLogs(data.data.logs || []);
        setPagination(
          data.data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 }
        );
      } else {
        throw new Error(data.error?.message || "Failed to fetch audit logs");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    actionFilter,
    resourceFilter,
    statusFilter,
    startDate,
    endDate,
    token,
  ]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setActionFilter("");
    setResourceFilter("");
    setStatusFilter("");
    setStartDate("");
    setEndDate("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="bg-card border-red-800 p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground">{pagination.total} total events</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <form onSubmit={handleFilterSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Action filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Action</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search actions..."
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="pl-10 bg-card border-border text-foreground"
                  />
                </div>
              </div>

              {/* Resource filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Resource</label>
                <Select value={resourceFilter} onValueChange={setResourceFilter}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue placeholder="All resources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="gateway">Gateway</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="plugin">Plugin</SelectItem>
                    <SelectItem value="workflow">Workflow</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-card border-border">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failure">Failure</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Date Range</label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-card border-border text-foreground"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-card border-border text-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="default" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Apply Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="border-border"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Audit logs table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Resource
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    User/Org ID
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <LogRowSkeleton />
                    <LogRowSkeleton />
                    <LogRowSkeleton />
                    <LogRowSkeleton />
                    <LogRowSkeleton />
                  </>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-sm text-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(log.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-sm bg-muted px-2 py-1 rounded text-foreground">
                          {log.action}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{log.resource}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-muted-foreground">
                          {log.userId
                            ? `U: ${log.userId.slice(0, 8)}...`
                            : log.organizationId
                            ? `O: ${log.organizationId.slice(0, 8)}...`
                            : "—"}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {log.ipAddress || "—"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page <= 1}
                  className="border-border"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="border-border"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected log details modal */}
      {selectedLog ? <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedLog(null)}
        >
          <Card
            className="bg-card border-border max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  Audit Log Details
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedLog(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Action</div>
                  <code className="text-sm bg-muted px-2 py-1 rounded text-foreground">
                    {selectedLog.action}
                  </code>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Resource</div>
                  <div className="text-foreground">
                    {selectedLog.resource}
                    {selectedLog.resourceId ? <code className="ml-2 text-xs bg-muted px-2 py-1 rounded">
                        {selectedLog.resourceId}
                      </code> : null}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <StatusBadge status={selectedLog.status} />
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Timestamp</div>
                  <div className="text-foreground">
                    {formatDate(selectedLog.createdAt)}
                  </div>
                </div>

                {selectedLog.userId ? <div>
                    <div className="text-sm text-muted-foreground">User ID</div>
                    <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                      {selectedLog.userId}
                    </code>
                  </div> : null}

                {selectedLog.organizationId ? <div>
                    <div className="text-sm text-muted-foreground">
                      Organization ID
                    </div>
                    <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">
                      {selectedLog.organizationId}
                    </code>
                  </div> : null}

                {selectedLog.ipAddress ? <div>
                    <div className="text-sm text-muted-foreground">IP Address</div>
                    <div className="text-foreground">{selectedLog.ipAddress}</div>
                  </div> : null}

                {selectedLog.userAgent ? <div>
                    <div className="text-sm text-muted-foreground">User Agent</div>
                    <div className="text-sm text-foreground break-all">
                      {selectedLog.userAgent}
                    </div>
                  </div> : null}

                {selectedLog.metadata && typeof selectedLog.metadata === 'object' ? (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Metadata</div>
                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto text-foreground">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div> : null}
    </div>
  );
}
