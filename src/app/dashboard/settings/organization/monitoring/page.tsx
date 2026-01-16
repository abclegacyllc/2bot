"use client";

/**
 * Monitoring Dashboard Page
 *
 * Displays real-time usage metrics, historical charts, and health status.
 * Owner/Admin view for organization-wide resource monitoring.
 *
 * @module app/dashboard/settings/organization/monitoring/page
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
  const { context } = useAuth();
  const isOrgContext = context.type === "organization";
  const [period, setPeriod] = useState<PeriodType>("DAILY");
  const [realTimeUsage, setRealTimeUsage] = useState<RealTimeUsage | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [historyData, setHistoryData] = useState<UsageDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data on mount and period change
  useEffect(() => {
    if (!isOrgContext || !context?.organizationId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch real-time usage, quota status, and history in parallel
        const [realtimeRes, statusRes, historyRes] = await Promise.all([
          fetch("/api/quota/realtime", {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch("/api/quota/status", {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
          fetch(`/api/quota/history?periodType=${period}`, {
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }),
        ]);

        if (!realtimeRes.ok || !statusRes.ok || !historyRes.ok) {
          throw new Error("Failed to fetch monitoring data");
        }

        const [realtimeData, statusData, historyDataRes] = await Promise.all([
          realtimeRes.json(),
          statusRes.json(),
          historyRes.json(),
        ]);

        setRealTimeUsage(realtimeData.data);
        setQuotaStatus(statusData.data);
        setHistoryData(historyDataRes.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh real-time data every 30 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/quota/realtime", {
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setRealTimeUsage(data.data);
        }
      } catch {
        // Silently fail on refresh
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOrgContext, context?.organizationId, period]);

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

  // Check access
  if (!isOrgContext) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8">
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="p-6">
            <p className="text-slate-400">
              Please switch to an organization context to view monitoring data.
            </p>
            <Link href="/dashboard">
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
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
            <p className="text-slate-400 mt-1">
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
                  className={period === p ? "" : "border-slate-700 text-slate-400"}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
            <Button variant="outline" className="border-slate-700" onClick={exportCsv}>
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
        {loading ? <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-slate-400">Loading monitoring data...</p>
            </CardContent>
          </Card> : null}

        {/* Real-Time Stats Cards */}
        {!loading && realTimeUsage ? <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">API Calls Today</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{realTimeUsage.apiCalls.toLocaleString()}</p>
                {quotaStatus ? <p className="text-sm text-slate-500">
                    {quotaStatus.apiCalls.isUnlimited 
                      ? "Unlimited" 
                      : `of ${quotaStatus.apiCalls.limit?.toLocaleString()}`}
                  </p> : null}
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Workflow Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{realTimeUsage.workflowRuns.toLocaleString()}</p>
                <p className="text-sm text-slate-500">Today</p>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Plugin Executions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{realTimeUsage.pluginExecutions.toLocaleString()}</p>
                <p className="text-sm text-slate-500">Today</p>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Storage Used</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-white">{realTimeUsage.storageUsed} MB</p>
                {quotaStatus ? <p className="text-sm text-slate-500">
                    {quotaStatus.storage.isUnlimited 
                      ? "Unlimited" 
                      : `of ${quotaStatus.storage.limit} MB`}
                  </p> : null}
              </CardContent>
            </Card>

            <Card className={`border-slate-800 ${realTimeUsage.errors > 0 ? 'bg-red-900/20' : 'bg-slate-900/50'}`}>
              <CardHeader className="pb-2">
                <CardDescription className="text-slate-400">Errors Today</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${realTimeUsage.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {realTimeUsage.errors}
                </p>
                <p className="text-sm text-slate-500">
                  {realTimeUsage.errors === 0 ? "All systems healthy" : "Needs attention"}
                </p>
              </CardContent>
            </Card>
          </div> : null}

        {/* Health Status Cards */}
        {!loading && quotaStatus ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
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

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-white">Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-slate-300">
                  {realTimeUsage && realTimeUsage.apiCalls > 0
                    ? ((realTimeUsage.errors / realTimeUsage.apiCalls) * 100).toFixed(2)
                    : 0}%
                </p>
                <p className="text-sm text-slate-500">Last 24 hours</p>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-white">API Quota Reset</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg text-slate-300">
                  {quotaStatus.apiCalls.resetsAt
                    ? new Date(quotaStatus.apiCalls.resetsAt).toLocaleString()
                    : "N/A"}
                </p>
                <p className="text-sm text-slate-500">Daily limit resets</p>
              </CardContent>
            </Card>
          </div> : null}

        {/* Usage Charts */}
        {!loading && historyData.length > 0 && (
          <UsageCharts data={historyData} period={period} />
        )}

        {/* Empty State */}
        {!loading && historyData.length === 0 && !error && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardContent className="p-8 text-center">
              <p className="text-slate-400">
                No usage data available for the selected period.
              </p>
              <p className="text-sm text-slate-500 mt-2">
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
