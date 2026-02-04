"use client";

/**
 * Billing Settings Page
 *
 * Displays current subscription plan, status, and usage limits.
 * Allows users to upgrade or manage their subscription.
 * Uses new hierarchical resource types (Phase 3 migration).
 *
 * @module app/(dashboard)/billing/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import {
    isPersonalStatus,
    ResourcePoolCard,
    useResourceStatus,
    type ResourcePoolItem,
} from "@/components/resources";
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
import { apiUrl } from "@/shared/config/urls";
import { getPlanDisplayName, PLAN_LIMITS, type PlanType } from "@/shared/constants/plans";
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
    workflowRunsPerMonth: number | null; // null = unlimited
    creditsPerMonth: number;
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

  // Use new resource status hook for quota data
  const { status: resourceStatus, isLoading: resourceLoading } = useResourceStatus();

  const isLoading = authLoading || subLoading || resourceLoading;
  const subscription = subscriptionData?.data;

  // Build usage from resource status API - fallback to zeros if not loaded
  const usage: UsageInfo = resourceStatus && isPersonalStatus(resourceStatus) ? {
    gateways: resourceStatus.automation.gateways.count.used,
    plugins: resourceStatus.automation.plugins.count.used,
    executionsToday: resourceStatus.billing.credits.usage.ai.total.current,
    ramUsedMb: resourceStatus.workspace?.compute.ram.allocated ?? 0,
  } : {
    gateways: 0,
    plugins: 0,
    executionsToday: 0,
    ramUsedMb: 0,
  };

  // For extracting quota data for limit display
  const quota = resourceStatus && isPersonalStatus(resourceStatus) ? {
    gateways: resourceStatus.automation.gateways.count,
    plugins: resourceStatus.automation.plugins.count,
    workflows: resourceStatus.automation.workflows.count,
    workflowRuns: resourceStatus.automation.workflows.metrics.runs,
    gatewayRequests: resourceStatus.automation.gateways.metrics.requests,
    pluginExecutions: resourceStatus.automation.plugins.metrics.executions,
    credits: resourceStatus.billing.credits.usage.ai.total,
    workspace: resourceStatus.workspace,
  } : null;

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
              Your {getPlanDisplayName(subscription.plan as PlanType)} subscription will end on{" "}
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
                    {getPlanDisplayName(currentPlan as PlanType)}
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

        {/* Automation Pool */}
        <ResourcePoolCard
          title="Automation Pool"
          description="Your gateways, plugins, and workflows"
          icon={Zap}
          items={[
            {
              label: "Gateways",
              icon: Server,
              current: usage.gateways,
              limit: quota?.gateways?.limit ?? planLimits.gateways,
            },
            {
              label: "Plugins",
              icon: Database,
              current: usage.plugins,
              limit: quota?.plugins?.limit ?? planLimits.plugins,
            },
            {
              label: "Workflows",
              icon: GitBranch,
              current: quota?.workflows?.used ?? 0,
              limit: quota?.workflows?.limit ?? planLimits.workflows,
            },
          ] satisfies ResourcePoolItem[]}
        />

        {/* Automation Usage Pool */}
        <ResourcePoolCard
          title="Usage This Period"
          description="Request and execution metrics"
          icon={Cpu}
          items={[
            {
              label: "Gateway Requests",
              icon: Zap,
              current: quota?.gatewayRequests?.current ?? 0,
              limit: quota?.gatewayRequests?.limit ?? null,
              period: quota?.gatewayRequests?.period,
              resetsAt: quota?.gatewayRequests?.resetsAt,
            },
            {
              label: "Plugin Executions",
              icon: Cpu,
              current: quota?.pluginExecutions?.current ?? 0,
              limit: quota?.pluginExecutions?.limit ?? null,
              period: quota?.pluginExecutions?.period,
              resetsAt: quota?.pluginExecutions?.resetsAt,
            },
            {
              label: "Workflow Runs",
              icon: GitBranch,
              current: quota?.workflowRuns?.current ?? 0,
              limit: quota?.workflowRuns?.limit ?? planLimits.workflowRunsPerMonth,
              period: quota?.workflowRuns?.period,
              resetsAt: quota?.workflowRuns?.resetsAt,
            },
          ] satisfies ResourcePoolItem[]}
        />

        {/* Billing Pool */}
        <ResourcePoolCard
          title="Billing Pool"
          description="Your AI credits and spending"
          icon={Bot}
          items={[
            {
              label: "Credits/Month",
              icon: Bot,
              current: quota?.credits?.current ?? 0,
              limit: quota?.credits?.limit ?? planLimits.creditsPerMonth,
            },
          ] satisfies ResourcePoolItem[]}
        />

        {/* Workspace Pool */}
        {planLimits.workspace ? (
          <ResourcePoolCard
            title="Workspace Pool"
            description="Compute resources for automation execution"
            icon={Server}
            columns={3}
            items={[
              {
                label: "RAM",
                icon: MemoryStick,
                current: quota?.workspace?.compute?.ram?.allocated ?? 0,
                limit: planLimits.workspace.ramMb,
                unit: "MB",
              },
              {
                label: "CPU",
                icon: Cpu,
                current: quota?.workspace?.compute?.cpu?.allocated ?? 0,
                limit: planLimits.workspace.cpuCores,
                unit: "cores",
              },
              {
                label: "Storage",
                icon: HardDrive,
                current: quota?.workspace?.storage?.allocation?.allocated ?? 0,
                limit: planLimits.workspace.storageMb,
                unit: "MB",
              },
            ] satisfies ResourcePoolItem[]}
            actions={
              <Link href="/billing/workspace">
                <Button variant="outline" size="sm" className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
                  <Server className="mr-2 h-4 w-4" />
                  Add Resources
                </Button>
              </Link>
            }
          />
        ) : (
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
              <div className="space-y-4">
                <div className="p-6 rounded-lg bg-muted/20 border border-dashed border-border text-center">
                  <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h4 className="font-medium text-foreground">No Workspace Included</h4>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Your plan uses serverless execution with {planLimits.workflowRunsPerMonth?.toLocaleString()} monthly workflow runs.
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
            </CardContent>
          </Card>
        )}

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
