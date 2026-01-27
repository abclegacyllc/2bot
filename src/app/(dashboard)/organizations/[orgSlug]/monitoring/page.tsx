"use client";

/**
 * Monitoring Dashboard Page
 *
 * Displays real-time usage metrics, historical charts, and health status.
 * Owner/Admin view for organization-wide resource monitoring.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/monitoring/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { UsageCharts, type UsageDataPoint } from "@/components/organization";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import Link from "next/link";
import { useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface RealTimeUsage {
  apiCalls: number;
  workflowRuns: number;
  pluginExecutions: number;
  storageUsed: number;
  errors: number;
  periodStart: string;
  periodType: string;
}

interface QuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem & { resetsAt: string | null };
  storage: QuotaItem;
  gateways: QuotaItem;
}

interface QuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

type PeriodType = "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";

// ===========================================
// Component
// ===========================================

function MonitoringContent() {
  const { context, token } = useAuth();
  const { orgId, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const [period, setPeriod] = useState<PeriodType>("DAILY");
  const [realTimeUsage, setRealTimeUsage] = useState<RealTimeUsage | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [historyData, setHistoryData] = useState<UsageDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount and period change
  useEffect(() => {
    if (!isFound || !orgId || !token) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch org quota status using org-specific endpoint
        const statusRes = await fetch(apiUrl(`/orgs/${orgId}/quota`), {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!statusRes.ok) {
          throw new Error("Failed to fetch organization quota data");
        }

        const statusData = await statusRes.json();
        setQuotaStatus(statusData.data);

        // Real-time usage - synthesize from quota status for now
        // TODO: Add org-specific realtime endpoint /api/orgs/:orgId/quota/realtime
        const now = new Date();
        setRealTimeUsage({
          apiCalls: statusData.data?.apiCalls?.used || 0,
          workflowRuns: statusData.data?.workflows?.used || 0,
          pluginExecutions: statusData.data?.plugins?.used || 0,
          storageUsed: statusData.data?.storage?.used || 0,
          errors: 0, // Not tracked in quota status
          periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          periodType: "MONTHLY",
        });

        // History data - generate mock for now
        // TODO: Add org-specific history endpoint /api/orgs/:orgId/quota/history
        setHistoryData([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh data every 30 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/orgs/${orgId}/quota`), {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setQuotaStatus(data.data);
          // Update realtime from quota status
          const now = new Date();
          setRealTimeUsage({
            apiCalls: data.data?.apiCalls?.used || 0,
            workflowRuns: data.data?.workflows?.used || 0,
            pluginExecutions: data.data?.plugins?.used || 0,
            storageUsed: data.data?.storage?.used || 0,
            errors: 0,
            periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
            periodType: "MONTHLY",
          });
        }
      } catch {
        // Silently fail on refresh
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isFound, orgId, period, token]);

  // Export CSV function
  const exportCsv = () => {
    if (!historyData.length) return;

    const headers = ["Date", "API Calls", "Workflow Runs", "Plugin Executions", "Storage (MB)", "Errors"];
    const rows = historyData.map((d) => [
      new Date(d.periodStart).toISOString(),
      d.apiCalls,
      d.workflowRuns,
      d.pluginExecutions,
      d.storageUsed,
      d.errors,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-report-${period.toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading org check
  if (orgLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading organization...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check access
  if (!isFound || !orgId) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <Card className="border-border bg-card/50">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-medium text-foreground">Organization not found</p>
            <p className="text-muted-foreground mt-2">
              The organization you're looking for doesn't exist or you don't have access.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4">
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Real-time usage metrics and historical data
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Period Selector */}
            <div className="flex gap-2">
              {(["HOURLY", "DAILY", "WEEKLY", "MONTHLY"] as PeriodType[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                  className={period === p ? "" : "border-border text-muted-foreground"}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
            <Button variant="outline" className="border-border" onClick={exportCsv}>
              📥 Export CSV
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error ? <Card className="border-red-800 bg-red-900/20">
            <CardContent className="p-4">
              <p className="text-red-400">{error}</p>
            </CardContent>
          </Card> : null}

        {/* Loading State */}
        {loading ? <Card className="border-border bg-card/50">
            <CardContent className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading monitoring data...</p>
            </CardContent>
          </Card> : null}

        {/* Real-Time Stats Cards */}
        {!loading && realTimeUsage ? <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-muted-foreground">API Calls Today</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{realTimeUsage.apiCalls.toLocaleString()}</p>
                {quotaStatus ? <p className="text-sm text-muted-foreground">
                    {quotaStatus.apiCalls.isUnlimited 
                      ? "Unlimited" 
                      : `of ${quotaStatus.apiCalls.limit?.toLocaleString()}`}
                  </p> : null}
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-muted-foreground">Workflow Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{realTimeUsage.workflowRuns.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Today</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-muted-foreground">Plugin Executions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{realTimeUsage.pluginExecutions.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Today</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-muted-foreground">Storage Used</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{realTimeUsage.storageUsed} MB</p>
                {quotaStatus ? <p className="text-sm text-muted-foreground">
                    {quotaStatus.storage.isUnlimited 
                      ? "Unlimited" 
                      : `of ${quotaStatus.storage.limit} MB`}
                  </p> : null}
              </CardContent>
            </Card>

            <Card className={`border-border ${realTimeUsage.errors > 0 ? 'bg-red-900/20' : 'bg-card/50'}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-muted-foreground">Errors Today</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${realTimeUsage.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {realTimeUsage.errors}
                </p>
                <p className="text-sm text-muted-foreground">
                  {realTimeUsage.errors === 0 ? "All systems healthy" : "Needs attention"}
                </p>
              </CardContent>
            </Card>
          </div> : null}

        {/* Health Status Cards */}
        {!loading && quotaStatus ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    quotaStatus.apiCalls.percentage < 80 ? 'bg-green-500' :
                    quotaStatus.apiCalls.percentage < 95 ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  Health Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg ${
                  quotaStatus.apiCalls.percentage < 80 ? 'text-green-400' :
                  quotaStatus.apiCalls.percentage < 95 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {quotaStatus.apiCalls.percentage < 80 ? '✓ All systems operational' :
                   quotaStatus.apiCalls.percentage < 95 ? '⚠ Approaching limits' : '⚠ Critical usage'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-foreground">Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-foreground">
                  {realTimeUsage && realTimeUsage.apiCalls > 0
                    ? ((realTimeUsage.errors / realTimeUsage.apiCalls) * 100).toFixed(2)
                    : 0}%
                </p>
                <p className="text-sm text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50">
              <CardHeader>
                <CardTitle className="text-foreground">API Quota Reset</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-foreground">
                  {quotaStatus.apiCalls.resetsAt
                    ? new Date(quotaStatus.apiCalls.resetsAt).toLocaleString()
                    : "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">Daily limit resets</p>
              </CardContent>
            </Card>
          </div> : null}

        {/* Usage Charts */}
        {!loading && historyData.length > 0 && (
          <UsageCharts data={historyData} period={period} />
        )}

        {/* Empty State */}
        {!loading && historyData.length === 0 && !error && (
          <Card className="border-border bg-card/50">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                No usage data available for the selected period.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Data will appear here as your organization uses the platform.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <ProtectedRoute>
      <MonitoringContent />
    </ProtectedRoute>
  );
}
