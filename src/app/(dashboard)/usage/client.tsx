"use client";

/**
 * Usage Dashboard Client Component
 *
 * Client-side dashboard that fetches and displays
 * the user's resource usage, limits, and history.
 * Uses centralized plan data from @/shared/constants/plans.ts
 *
 * @module app/(dashboard)/dashboard/usage/client
 */

import { useAuth } from "@/components/providers/auth-provider";
import {
    UpgradePrompt,
    UsageHistoryChart,
    UsageOverview,
    generateMockUsageData,
} from "@/components/quota";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/shared/config/urls";
import { PLAN_LIMITS } from "@/shared/constants/plans";
import { ArrowRight, RefreshCw, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface UsageData {
  executions: {
    current: number;
    limit: number | null;
    resetsAt: string;
  };
  gateways: {
    current: number;
    limit: number | null;
  };
  plugins: {
    current: number;
    limit: number | null;
  };
  workflows: {
    current: number;
    limit: number | null;
  };
  dailyHistory: Array<{
    date: string;
    executions: number;
  }>;
  plan: {
    name: string;
    type: "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
  };
}

// ===========================================
// Main Component
// ===========================================

export function UsageDashboardClient() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(apiUrl("/usage"), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch usage data");
      }

      const data = await response.json();
      setUsage(data);
    } catch (err) {
      console.error("Error fetching usage:", err);
      setError("Failed to load usage data");

      // Use mock data with centralized FREE plan limits for development/demo
      const freeLimits = PLAN_LIMITS.FREE;
      setUsage({
        executions: {
          current: 750,
          limit: freeLimits.executionsPerMonth,
          resetsAt: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
        gateways: { current: 2, limit: freeLimits.gateways },
        plugins: { current: 3, limit: freeLimits.plugins },
        workflows: { current: 5, limit: freeLimits.workflows },
        dailyHistory: generateMockUsageData(14, 50),
        plan: { name: "Free", type: "FREE" },
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUsage();
    }
  }, [user, fetchUsage]);

  const handleUpgrade = () => {
    router.push("/settings?tab=billing");
  };

  // Loading state
  if (authLoading || loading) {
    return <UsageDashboardSkeleton />;
  }

  // Error state with mock data fallback
  if (error && !usage) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchUsage}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const isFreePlan = usage.plan.type === "FREE" || usage.plan.type === "STARTER";

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usage</h1>
          <p className="text-muted-foreground">
            Monitor your resource usage and plan limits
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchUsage}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Usage overview grid */}
      <UsageOverview
        executions={{
          current: usage.executions.current,
          limit: usage.executions.limit,
          resetsAt: usage.executions.resetsAt
            ? new Date(usage.executions.resetsAt)
            : undefined,
        }}
        gateways={{
          current: usage.gateways.current,
          limit: usage.gateways.limit,
        }}
        plugins={{
          current: usage.plugins.current,
          limit: usage.plugins.limit,
        }}
        workflows={{
          current: usage.workflows.current,
          limit: usage.workflows.limit,
        }}
        planName={usage.plan.name}
        onUpgrade={handleUpgrade}
      />

      {/* Usage history chart */}
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>
            Daily workflow and API executions over the last 14 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageHistoryChart
            data={usage.dailyHistory}
            limit={
              usage.executions.limit
                ? Math.round(usage.executions.limit / 30)
                : null
            }
            period="daily"
          />
        </CardContent>
      </Card>

      {/* Upgrade prompt for free users */}
      {isFreePlan && (
        <UpgradePrompt
          resource="executions"
          currentPlan={usage.plan.name}
          suggestedPlan="Starter"
          currentLimit={usage.executions.limit ?? undefined}
          suggestedLimit={PLAN_LIMITS.STARTER.executionsPerMonth ?? undefined}
          onUpgrade={handleUpgrade}
          variant="card"
        />
      )}

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => router.push("/settings?tab=billing")}>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Upgrade Plan</CardTitle>
              <CardDescription>
                Get more executions and resources
              </CardDescription>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        </Card>

        <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => router.push("/settings")}>
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Manage Subscription</CardTitle>
              <CardDescription>
                View billing history and invoices
              </CardDescription>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

// ===========================================
// Skeleton Loading Component
// ===========================================

function UsageDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-10" />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>

      {/* Chart skeleton */}
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
