"use client";

/**
 * Billing Settings Page
 *
 * Displays current subscription plan, status, and usage limits.
 * Allows users to upgrade or manage their subscription.
 * Uses centralized plan data from @/shared/constants/plans.ts
 *
 * @module app/(dashboard)/billing/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiUrl } from "@/shared/config/urls";
import { PLAN_LIMITS, type PlanType } from "@/shared/constants/plans";
import {
    AlertCircle,
    ArrowLeft,
    Bot,
    Cpu,
    CreditCard,
    Database,
    GitBranch,
    HardDrive,
    MemoryStick,
    Server,
    Settings,
    Sparkles,
    Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

interface SubscriptionInfo {
  plan: string;
  status: "active" | "past_due" | "canceled" | "none";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  limits: {
    gateways: number;
    plugins: number;
    executionsPerMonth: number | null; // null = unlimited
    aiTokensPerMonth: number;
    workspace: {
      ramMb: number;
      cpuCores: number;
      storageMb: number;
    } | null;
  };
}

interface UsageInfo {
  gateways: number;
  plugins: number;
  executionsToday: number;
  ramUsedMb: number;
}

const createFetcher = (token: string | null) => async (url: string) => {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch");
  }
  return res.json();
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function LimitItem({
  label,
  icon: Icon,
  current,
  max,
  unit = "",
}: {
  label: string;
  icon: React.ElementType;
  current: number;
  max: number | null; // null or -1 = unlimited
  unit?: string;
}) {
  // Handle unlimited (-1 or null)
  const isUnlimited = max === null || max === -1;
  const effectiveMax = isUnlimited ? 100 : max; // Use 100 for percentage calc when unlimited
  const percentage = isUnlimited ? 0 : Math.min((current / effectiveMax) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  const maxDisplay = isUnlimited ? "Unlimited" : `${max.toLocaleString()}${unit ? ` ${unit}` : ""}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span
          className={
            isAtLimit
              ? "text-red-400"
              : isNearLimit
                ? "text-yellow-400"
                : "text-foreground"
          }
        >
          {current.toLocaleString()}{unit && !isUnlimited ? "" : ""} / {maxDisplay}
        </span>
      </div>
      <Progress
        value={isUnlimited ? 0 : percentage}
        className={`h-2 ${isAtLimit ? "[&>div]:bg-red-500" : isNearLimit ? "[&>div]:bg-yellow-500" : "[&>div]:bg-purple-500"}`}
      />
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-border bg-card/50">
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-64 bg-muted rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-border bg-card/50">
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-2 w-full bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface QuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
  resetsAt?: string;
}

interface QuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem & { resetsAt: string };
  storage: QuotaItem;
  gateways: QuotaItem;
}

function BillingContent() {
  const router = useRouter();
  const { context, isLoading: authLoading, token } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Get plan limits from centralized constants based on user's current plan
  const currentPlan = context.plan as PlanType;
  const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.FREE;

  // Create fetcher with auth token
  const fetcher = createFetcher(token);

  const { data: subscriptionData, isLoading: subLoading } =
    useSWR<{ success: boolean; data: SubscriptionInfo }>(
      token ? apiUrl("/billing/subscription") : null,
      fetcher
    );

  // Using URL-based routes (Phase 6.7) - /user/quota for personal quota
  const { data: quotaData, isLoading: quotaLoading } =
    useSWR<{ success: boolean; data: QuotaStatus }>(
      token ? apiUrl("/user/quota") : null,
      fetcher
    );

  const isLoading = authLoading || subLoading || quotaLoading;
  const subscription = subscriptionData?.data;
  const quota = quotaData?.data;

  // Build usage from quota API - fallback to zeros if not loaded
  const usage: UsageInfo = {
    gateways: quota?.gateways?.used ?? 0,
    plugins: quota?.plugins?.used ?? 0,
    executionsToday: quota?.apiCalls?.used ?? 0,
    ramUsedMb: 0, // RAM tracking not yet implemented
  };

  // For org context, only ADMIN+ can see billing
  if (!authLoading && context.type === "organization") {
    if (!["ORG_OWNER", "ORG_ADMIN"].includes(context.orgRole || "")) {
      return (
        <div className="min-h-screen bg-background p-8">
          <div className="max-w-4xl mx-auto">
            <Card className="border-border bg-card/50">
              <CardContent className="py-12 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Contact your organization admin for billing information.
                </p>
                <Link href="/">
                  <Button
                    variant="outline"
                    className="mt-4 border-border text-foreground"
                  >
                    Back to Dashboard
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <CreditCard className="h-8 w-8" />
                Billing
              </h1>
            </div>
          </div>
          <BillingSkeleton />
        </div>
      </div>
    );
  }

  const handleManageBilling = async () => {
    try {
      setPortalLoading(true);
      setPortalError(null);
      const response = await fetch(apiUrl("/billing/portal"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }
      if (data.url || data.data?.url) {
        window.location.href = data.url || data.data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (error) {
      console.error("Failed to open billing portal:", error);
      setPortalError(error instanceof Error ? error.message : "Failed to open billing portal");
      setPortalLoading(false);
    }
  };

  const getStatusBadge = (status: string, cancelAtPeriodEnd: boolean) => {
    if (cancelAtPeriodEnd) {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-500">
          Canceling
        </Badge>
      );
    }

    const statusConfig = {
      active: { variant: "default" as const, text: "Active" },
      past_due: { variant: "destructive" as const, text: "Past Due" },
      canceled: { variant: "secondary" as const, text: "Canceled" },
      none: { variant: "outline" as const, text: "Free" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.none;
    return <Badge variant={config.variant}>{config.text}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <CreditCard className="h-8 w-8" />
              Billing
            </h1>
            <p className="text-muted-foreground mt-1">
              {context.type === "organization"
                ? `Manage billing for ${context.organizationName}`
                : "Manage your personal subscription"}
            </p>
          </div>
          <Link href="/settings">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        </div>

        {/* Past Due Alert */}
        {subscription?.status === "past_due" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Payment Failed</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                Please update your payment method to continue using the service.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-4"
                onClick={handleManageBilling}
              >
                Update Payment
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Cancellation Alert */}
        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">
              Subscription Ending
            </AlertTitle>
            <AlertDescription className="text-yellow-400/80">
              Your {subscription.plan} subscription will end on{" "}
              {formatDate(subscription.currentPeriodEnd)}. You can resume your
              subscription from the billing portal.
            </AlertDescription>
          </Alert>
        )}

        {/* Current Plan */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-400" />
              Current Plan
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your active subscription details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <p className="text-3xl font-bold text-foreground">
                    {planLimits.displayName.toUpperCase()}
                  </p>
                  {getStatusBadge(
                    subscription?.status || (currentPlan !== "FREE" ? "active" : "none"),
                    subscription?.cancelAtPeriodEnd || false
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription?.status === "active" &&
                    subscription.currentPeriodEnd &&
                    !subscription.cancelAtPeriodEnd && (
                      <>Renews on {formatDate(subscription.currentPeriodEnd)}</>
                    )}
                  {(!subscription?.status || subscription?.status === "none") && currentPlan === "FREE" && planLimits.description}
                  {subscription?.cancelAtPeriodEnd &&
                    subscription.currentPeriodEnd && (
                      <span className="text-yellow-400">
                        Access until {formatDate(subscription.currentPeriodEnd)}
                      </span>
                    )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <Link href="/billing/upgrade">
                    <Button className={currentPlan === "FREE" ? "bg-purple-600 hover:bg-purple-700" : "border-border text-foreground hover:bg-muted"} variant={currentPlan === "FREE" ? "default" : "outline"}>
                      {currentPlan === "FREE" ? (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Upgrade Plan
                        </>
                      ) : (
                        <>
                          <Settings className="mr-2 h-4 w-4" />
                          Manage Subscription
                        </>
                      )}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Plan Limits */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Settings className="h-5 w-5 text-purple-400" />
              Plan Limits
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your current usage vs plan limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <LimitItem
                label="Gateways"
                icon={Zap}
                current={usage.gateways}
                max={planLimits.gateways}
              />
              <LimitItem
                label="Plugins"
                icon={Database}
                current={usage.plugins}
                max={planLimits.plugins}
              />
              <LimitItem
                label="Workflows"
                icon={GitBranch}
                current={quota?.workflows?.used ?? 0}
                max={planLimits.workflows}
              />
              <LimitItem
                label="Monthly Executions"
                icon={Cpu}
                current={usage.executionsToday}
                max={planLimits.executionsPerMonth}
              />
              <LimitItem
                label="AI Tokens/Month"
                icon={Bot}
                current={quota?.apiCalls?.used ?? 0}
                max={planLimits.aiTokensPerMonth}
              />
              <LimitItem
                label="RAM Allocation"
                icon={MemoryStick}
                current={usage.ramUsedMb}
                max={planLimits.workspace?.ramMb ?? null}
                unit="MB"
              />
            </div>
          </CardContent>
        </Card>

        {/* Workspace Section */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Server className="h-5 w-5 text-purple-400" />
              Workspace Resources
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your compute resources for automation execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {planLimits.workspace ? (
              <div className="space-y-6">
                {/* Workspace Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <MemoryStick className="h-4 w-4" />
                      <span className="text-sm">RAM</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.workspace.ramMb >= 1024
                        ? `${(planLimits.workspace.ramMb / 1024).toFixed(0)}GB`
                        : `${planLimits.workspace.ramMb}MB`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Included with {currentPlan}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Cpu className="h-4 w-4" />
                      <span className="text-sm">CPU</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.workspace.cpuCores} {planLimits.workspace.cpuCores === 1 ? "Core" : "Cores"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Included with {currentPlan}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <HardDrive className="h-4 w-4" />
                      <span className="text-sm">Storage</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.workspace.storageMb >= 1024
                        ? `${(planLimits.workspace.storageMb / 1024).toFixed(0)}GB`
                        : `${planLimits.workspace.storageMb}MB`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Included with {currentPlan}
                    </p>
                  </div>
                </div>

                {/* Add More Button */}
                <Link href="/billing/workspace">
                  <Button variant="outline" className="w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
                    <Server className="mr-2 h-4 w-4" />
                    Add More Workspace Resources
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-6 rounded-lg bg-muted/20 border border-dashed border-border text-center">
                  <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h4 className="font-medium text-foreground">No Workspace Included</h4>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Your plan uses serverless execution with {planLimits.executionsPerMonth?.toLocaleString()} monthly executions.
                  </p>
                  <Link href="/billing/workspace">
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Get Unlimited Executions
                    </Button>
                  </Link>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Add a workspace to unlock unlimited executions and dedicated compute resources.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upgrade CTA for free users */}
        {currentPlan === "FREE" && (
          <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-background/50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Ready to unlock more?
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    Upgrade your plan to get more gateways, plugins, and higher
                    execution limits.
                  </p>
                </div>
                <Link href="/billing/upgrade">
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    View Plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <ProtectedRoute>
      <BillingContent />
    </ProtectedRoute>
  );
}
