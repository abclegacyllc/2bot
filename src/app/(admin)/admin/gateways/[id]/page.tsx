"use client";

/**
 * Admin Gateway Detail Page
 *
 * View and manage individual gateway:
 * - Gateway information and configuration
 * - Connection status and error history
 * - Usage statistics
 * - Admin actions (disconnect, clear errors, toggle status)
 *
 * @module app/(admin)/admin/gateways/[id]/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApiUrl } from "@/shared/config/urls";
import {
  AlertTriangle,
  Bot,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Power,
  RefreshCw,
  User,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface GatewayDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  lastError: string | null;
  lastErrorAt: string | null;
  lastConnectedAt: string | null;
  config: unknown;
  createdAt: string;
  updatedAt: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  workflowCount: number;
  aiUsageCount: number;
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    CONNECTED: { icon: CheckCircle, color: "bg-green-600 text-white", label: "Connected" },
    DISCONNECTED: { icon: Clock, color: "bg-muted text-muted-foreground", label: "Disconnected" },
    ERROR: { icon: AlertTriangle, color: "bg-red-600 text-white", label: "Error" },
  } as const;

  const statusConfig = config[status as keyof typeof config] ?? config.DISCONNECTED;
  const Icon = statusConfig.icon;

  return (
    <Badge className={statusConfig.color}>
      <Icon className="h-3 w-3 mr-1" />
      {statusConfig.label}
    </Badge>
  );
}

export default function AdminGatewayDetailPage() {
  const { token } = useAuth();
  const params = useParams();
  const gatewayId = params.id as string;

  const [gateway, setGateway] = useState<GatewayDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchGateway = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(adminApiUrl(`/gateways/${gatewayId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch gateway");
      }

      const data = await res.json();
      setGateway(data.data.gateway);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token, gatewayId]);

  useEffect(() => {
    fetchGateway();
  }, [fetchGateway]);

  const handleClearError = async () => {
    if (!token) return;
    setActionLoading(true);

    try {
      const res = await fetch(adminApiUrl(`/gateways/${gatewayId}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clearError: true }),
      });

      if (!res.ok) {
        throw new Error("Failed to clear error");
      }

      await fetchGateway();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token || !confirm("Are you sure you want to force disconnect this gateway?")) return;
    setActionLoading(true);

    try {
      const res = await fetch(adminApiUrl(`/gateways/${gatewayId}/disconnect`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to disconnect gateway");
      }

      await fetchGateway();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (newStatus: string) => {
    if (!token) return;
    setActionLoading(true);

    try {
      const res = await fetch(adminApiUrl(`/gateways/${gatewayId}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      await fetchGateway();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading gateway details...</div>
      </div>
    );
  }

  if (!gateway) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">Gateway not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title={gateway.name}
        description={gateway.id}
        icon={<Bot className="h-6 w-6 text-purple-500" />}
        breadcrumbs={[{ label: "Gateways", href: "/admin/gateways" }]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={gateway.status} />
            <Badge variant="outline">{gateway.type}</Badge>
          </div>
        }
      />

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Actions</CardTitle>
          <CardDescription>Manage gateway status and errors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {gateway.lastError ? <Button
                variant="outline"
                onClick={handleClearError}
                disabled={actionLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear Error
              </Button> : null}
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={actionLoading || gateway.status === "DISCONNECTED"}
              className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
            >
              <Power className="h-4 w-4 mr-2" />
              Force Disconnect
            </Button>
            {gateway.status === "DISCONNECTED" && (
              <Button
                variant="outline"
                onClick={() => handleToggleStatus("CONNECTED")}
                disabled={actionLoading}
                className="border-green-500 text-green-500 hover:bg-green-500 hover:text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Connected
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gateway Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Owner Info */}
        <Card>
          <CardHeader>
            <CardTitle>Owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {gateway.organizationId ? (
                <Building2 className="h-5 w-5 text-purple-500" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium text-foreground">
                  {gateway.organizationName || gateway.userName || "No name"}
                </div>
                <div className="text-sm text-muted-foreground">{gateway.userEmail}</div>
              </div>
            </div>
            {gateway.organizationId ? <Link href={`/admin/organizations/${gateway.organizationId}`}>
                <Button variant="outline" size="sm" className="w-full">
                  View Organization
                </Button>
              </Link> : null}
            {!gateway.organizationId && (
              <Link href={`/admin/users/${gateway.userId}`}>
                <Button variant="outline" size="sm" className="w-full">
                  View User
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Workflows</div>
              <div className="text-2xl font-bold text-foreground">
                {gateway.workflowCount}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">AI Usage Records</div>
              <div className="text-2xl font-bold text-foreground">
                {gateway.aiUsageCount.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection Info */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Created</div>
              <div className="flex items-center gap-2 text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {new Date(gateway.createdAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Last Updated</div>
              <div className="flex items-center gap-2 text-foreground">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                {new Date(gateway.updatedAt).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Last Connected</div>
              <div className="flex items-center gap-2 text-foreground">
                <Zap className="h-4 w-4 text-green-500" />
                {gateway.lastConnectedAt
                  ? new Date(gateway.lastConnectedAt).toLocaleString()
                  : "Never"}
              </div>
            </div>
          </div>

          {/* Error Info */}
          {gateway.lastError ? <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-red-500 mb-1">Last Error</div>
                  <div className="text-sm text-foreground mb-2">{gateway.lastError}</div>
                  {gateway.lastErrorAt ? <div className="text-xs text-muted-foreground">
                      {new Date(gateway.lastErrorAt).toLocaleString()}
                    </div> : null}
                </div>
              </div>
            </div> : null}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Gateway-specific settings (non-sensitive)</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm text-foreground">
            {JSON.stringify(gateway.config, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
