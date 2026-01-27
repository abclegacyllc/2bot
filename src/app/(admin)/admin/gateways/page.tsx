"use client";

/**
 * Admin Gateways Page
 *
 * Gateway management for administrators:
 * - View all gateways with pagination
 * - Filter by status and type
 * - View gateway details and owner
 *
 * @module app/(admin)/admin/gateways/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Bot,
    Building2,
    Calendar,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Clock,
    User,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface AdminGateway {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  lastActivityAt: string | null;
  executionCount: number;
  owner: {
    id: string;
    email: string;
    name: string | null;
    type: "user" | "organization";
    organizationName?: string;
  };
}

interface GatewaysResponse {
  gateways: AdminGateway[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function GatewayRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-40 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-24 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-32 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-24 bg-muted" />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    ACTIVE: { icon: CheckCircle, color: "bg-green-600" },
    INACTIVE: { icon: XCircle, color: "bg-muted" },
    SUSPENDED: { icon: Clock, color: "bg-yellow-600" },
    ERROR: { icon: AlertTriangle, color: "bg-red-600" },
  } as const;

  const statusConfig = config[status as keyof typeof config] ?? config.INACTIVE;
  const Icon = statusConfig.icon;
  const color = statusConfig.color;

  return (
    <Badge className={color}>
      <Icon className="h-3 w-3 mr-1" />
      {status}
    </Badge>
  );
}

export default function AdminGatewaysPage() {
  const { token } = useAuth();
  const [gateways, setGateways] = useState<AdminGateway[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const fetchGateways = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);

      const response = await fetch(apiUrl(`/admin/gateways?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch gateways");
      }

      const data = await response.json();
      if (data.success && data.data) {
        setGateways(data.data.gateways || []);
        setPagination(data.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      } else {
        throw new Error(data.error?.message || "Failed to fetch gateways");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter, typeFilter, token]);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status === statusFilter ? "" : status);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleTypeFilter = (type: string) => {
    setTypeFilter(type === typeFilter ? "" : type);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Get unique types from gateways
  const gatewayTypes = [...new Set(gateways.map((g) => g.type))].filter(Boolean);

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
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot className="h-6 w-6 text-purple-400" />
          Gateways
        </h1>
        <p className="text-muted-foreground">
          {pagination.total} total gateways
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground py-1">Status:</span>
          {["ACTIVE", "INACTIVE", "SUSPENDED", "ERROR"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => handleStatusFilter(status)}
              className={`border-border ${
                statusFilter === status ? "bg-purple-600" : ""
              }`}
            >
              {status}
            </Button>
          ))}
        </div>

        {gatewayTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground py-1">Type:</span>
            {gatewayTypes.map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                size="sm"
                onClick={() => handleTypeFilter(type)}
                className={`border-border ${
                  typeFilter === type ? "bg-purple-600" : ""
                }`}
              >
                {type}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Gateways table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Gateway
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Executions
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <GatewayRowSkeleton />
                    <GatewayRowSkeleton />
                    <GatewayRowSkeleton />
                    <GatewayRowSkeleton />
                    <GatewayRowSkeleton />
                  </>
                ) : gateways.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No gateways found
                    </td>
                  </tr>
                ) : (
                  gateways.map((gateway) => (
                    <tr
                      key={gateway.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">
                          {gateway.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {gateway.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-border text-foreground">
                          {gateway.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={gateway.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {gateway.owner.type === "organization" ? (
                            <Building2 className="h-4 w-4 text-purple-400" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="text-foreground text-sm">
                              {gateway.owner.type === "organization"
                                ? gateway.owner.organizationName
                                : gateway.owner.name || "No name"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {gateway.owner.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {gateway.executionCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(gateway.createdAt)}
                        </div>
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
    </div>
  );
}
