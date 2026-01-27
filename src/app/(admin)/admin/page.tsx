"use client";

/**
 * Admin Overview Page
 *
 * Platform statistics and monitoring dashboard:
 * - User counts and growth
 * - Subscription breakdown with MRR
 * - Gateway statistics
 * - Plugin execution metrics
 *
 * @module app/(admin)/admin/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Bot,
    CreditCard,
    DollarSign,
    Users,
    Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

interface AdminStats {
  users: {
    total: number;
    activeToday: number;
    newThisWeek: number;
  };
  subscriptions: {
    free: number;
    starter: number;
    pro: number;
    business: number;
    enterprise: number;
    mrr: number;
  };
  gateways: {
    total: number;
    connected: number;
    errored: number;
    disconnected: number;
  };
  executions: {
    today: number;
    thisWeek: number;
  };
}

function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-20 bg-muted" />
        <Skeleton className="h-4 w-4 bg-muted" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-24 bg-muted" />
        <Skeleton className="h-3 w-32 bg-muted mt-2" />
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;
      try {
        const response = await fetch(apiUrl("/admin/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error("Failed to fetch stats");
        }
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        } else {
          throw new Error(data.error?.message || "Failed to fetch stats");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

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
        <h1 className="text-2xl font-bold text-foreground">Admin Overview</h1>
        <p className="text-muted-foreground">Platform statistics and monitoring</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard
              title="Total Users"
              value={stats.users.total.toLocaleString()}
              subValue={`${stats.users.activeToday} active today, +${stats.users.newThisWeek} this week`}
              icon={Users}
              iconColor="text-blue-400"
            />
            <StatCard
              title="Monthly Revenue"
              value={`$${(stats.subscriptions.mrr / 100).toLocaleString()}`}
              subValue={`${stats.subscriptions.pro + stats.subscriptions.business + stats.subscriptions.enterprise} paid subscriptions`}
              icon={DollarSign}
              iconColor="text-green-400"
            />
            <StatCard
              title="Total Gateways"
              value={stats.gateways.total.toLocaleString()}
              subValue={`${stats.gateways.connected} connected, ${stats.gateways.errored} errors`}
              icon={Bot}
              iconColor="text-purple-400"
            />
            <StatCard
              title="Executions Today"
              value={stats.executions.today.toLocaleString()}
              subValue={`${stats.executions.thisWeek.toLocaleString()} this week`}
              icon={Zap}
              iconColor="text-yellow-400"
            />
          </>
        ) : null}
      </div>

      {/* Detailed breakdown */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subscription breakdown */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-purple-400" />
                Subscription Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">FREE</Badge>
                  <span className="text-muted-foreground">Free tier</span>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.subscriptions.free}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600">PRO</Badge>
                  <span className="text-muted-foreground">$20/mo</span>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.subscriptions.pro}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-600">BUSINESS</Badge>
                  <span className="text-muted-foreground">$50/mo</span>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.subscriptions.business}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-600">ENTERPRISE</Badge>
                  <span className="text-muted-foreground">$200/mo</span>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.subscriptions.enterprise}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Gateway status breakdown */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Bot className="h-5 w-5 text-purple-400" />
                Gateway Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">Connected</Badge>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.gateways.connected}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Disconnected</Badge>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.gateways.disconnected}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Errors</Badge>
                </div>
                <span className="text-foreground font-semibold">
                  {stats.gateways.errored}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Execution stats */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                Execution Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-3xl font-bold text-foreground">
                    {stats.executions.today.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Workflow Runs Today</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-3xl font-bold text-foreground">
                    {stats.executions.thisWeek.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">This Week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
