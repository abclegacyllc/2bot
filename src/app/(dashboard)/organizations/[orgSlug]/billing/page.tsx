"use client";

/**
 * Organization Billing Page
 *
 * Displays current organization subscription plan, status, and usage limits.
 * Allows org admins to upgrade or manage their subscription.
 * Uses centralized plan data from @/shared/constants/org-plans.ts
 *
 * @module app/(dashboard)/organizations/[orgSlug]/billing/page
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
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import { INCLUDED_ORG_WORKSPACE_POOL, ORG_PLAN_LIMITS, type OrgPlanType } from "@/shared/constants/org-plans";
import {
    AlertCircle,
    ArrowLeft,
    Bot,
    Building2,
    Cpu,
    CreditCard,
    Database,
    FolderTree,
    GitBranch,
    HardDrive,
    Loader2,
    MemoryStick,
    Server,
    Settings,
    Sparkles,
    Users,
    Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

interface OrgSubscriptionInfo {
  plan: string;
  status: "active" | "past_due" | "canceled" | "none";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

interface OrgUsageInfo {
  gateways: number;
  plugins: number;
  workflows: number;
  members: number;
  departments: number;
  executionsThisMonth: number;
  aiTokensThisMonth: number;
}

// This matches what the quota API actually returns
interface OrgQuota {
  gateways: { used: number; limit: number | null; percentage: number; isUnlimited: boolean };
  workflows: { used: number; limit: number | null; percentage: number; isUnlimited: boolean };
  plugins: { used: number; limit: number | null; percentage: number; isUnlimited: boolean };
  apiCalls: { used: number; limit: number | null; percentage: number; isUnlimited: boolean; resetsAt: string | null };
  storage: { used: number; limit: number | null; percentage: number; isUnlimited: boolean };
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
  max: number | null;
  unit?: string;
}) {
  const isUnlimited = max === null || max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        <span className={`text-sm font-medium ${isNearLimit ? "text-yellow-400" : "text-foreground"}`}>
          {current.toLocaleString()}
          {unit} / {isUnlimited ? "∞" : `${max?.toLocaleString()}${unit}`}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={`h-2 ${isNearLimit ? "[&>div]:bg-yellow-500" : "[&>div]:bg-purple-500"}`}
        />
      )}
    </div>
  );
}

function OrgBillingContent() {
  const { token } = useAuth();
  const router = useRouter();
  const { orgId, orgName: hookOrgName, orgRole, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();

  const fetcher = createFetcher(token);

  // Check permissions - must be after hooks but before rendering
  const isOrgContext = isFound && !!orgId;
  const canManageBilling = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const orgName = hookOrgName || "Organization";

  // Fetch organization subscription info
  const { data: subData, error: subError, isLoading: subLoading } = useSWR<{
    success: boolean;
    data: OrgSubscriptionInfo;
  }>(
    token && orgId ? apiUrl(`/organizations/${orgId}/billing/subscription`) : null,
    fetcher
  );

  // Fetch organization usage/quota
  const { data: quotaData, error: quotaError, isLoading: quotaLoading } = useSWR<{
    success: boolean;
    data: OrgQuota;
  }>(
    token && orgId ? apiUrl(`/organizations/${orgId}/quota`) : null,
    fetcher
  );

  // Fetch organization details for member count
  const { data: orgData } = useSWR<{
    success: boolean;
    data: { memberCount?: number };
  }>(
    token && orgId ? apiUrl(`/orgs/${orgId}`) : null,
    fetcher
  );

  // Fetch departments for department count
  const { data: deptsData } = useSWR<{
    success: boolean;
    data: { id: string }[];
  }>(
    token && orgId ? apiUrl(`/orgs/${orgId}/departments`) : null,
    fetcher
  );

  // Redirect if not in org context - AFTER all hooks
  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/billing");
    }
  }, [orgLoading, isFound, router]);

  // Show loading while determining org
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isOrgContext) {
    return null;
  }

  const subscription = subData?.data;
  const quota = quotaData?.data;
  const isLoading = subLoading || quotaLoading;
  const error = subError || quotaError;

  // Get plan limits from centralized constants
  const currentOrgPlan = (subscription?.plan as OrgPlanType) || "ORG_FREE";
  const planLimits = ORG_PLAN_LIMITS[currentOrgPlan] || ORG_PLAN_LIMITS.ORG_FREE;
  const poolTier = INCLUDED_ORG_WORKSPACE_POOL[currentOrgPlan];
  const hasWorkspacePool = poolTier !== "NONE" && planLimits.pool.ramMb !== null;

  // Usage from quota and org data
  const usage: OrgUsageInfo = {
    gateways: quota?.gateways?.used ?? 0,
    plugins: quota?.plugins?.used ?? 0,
    workflows: quota?.workflows?.used ?? 0,
    members: orgData?.data?.memberCount ?? 0,
    departments: deptsData?.data?.length ?? 0,
    executionsThisMonth: quota?.apiCalls?.used ?? 0,
    aiTokensThisMonth: 0, // AI tokens not yet tracked in quota
  };

  const getStatusBadge = () => {
    if (!subscription || subscription.status === "none") {
      return <Badge className="bg-gray-600">No Subscription</Badge>;
    }

    switch (subscription.status) {
      case "active":
        return subscription.cancelAtPeriodEnd ? (
          <Badge className="bg-yellow-600">Canceling</Badge>
        ) : (
          <Badge className="bg-green-600">Active</Badge>
        );
      case "past_due":
        return <Badge className="bg-red-600">Past Due</Badge>;
      case "canceled":
        return <Badge className="bg-gray-600">Canceled</Badge>;
      default:
        return <Badge className="bg-gray-600">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Building2 className="h-8 w-8 text-purple-400" />
              Organization Billing
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage {orgName}&apos;s subscription and billing
            </p>
          </div>
          <Link href="/">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Permission Warning */}
        {!canManageBilling && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <AlertTitle className="text-yellow-400">View Only</AlertTitle>
            <AlertDescription className="text-yellow-300/80">
              Only organization owners and admins can manage billing.
            </AlertDescription>
          </Alert>
        )}

        {/* Past Due Alert */}
        {subscription?.status === "past_due" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Payment Failed</AlertTitle>
            <AlertDescription>
              Please update your payment method to continue using the service.
            </AlertDescription>
          </Alert>
        )}

        {/* Cancellation Alert */}
        {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">Subscription Ending</AlertTitle>
            <AlertDescription className="text-yellow-400/80">
              Your {planLimits.displayName} subscription will end on{" "}
              {formatDate(subscription.currentPeriodEnd)}. You can resume your
              subscription from the billing portal.
            </AlertDescription>
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Current Plan Card */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-purple-400" />
              Current Plan
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your organization&apos;s subscription details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-3xl font-bold text-foreground">
                    {planLimits.displayName}
                  </h3>
                  {getStatusBadge()}
                </div>
                <p className="text-muted-foreground mt-2">
                  {planLimits.description}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {subscription?.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
                    <span>Renews on {formatDate(subscription.currentPeriodEnd)}</span>
                  )}
                  {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                    <span className="text-yellow-400">
                      Access until {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {canManageBilling && (
                  <div className="flex gap-3">
                    <Link href={buildOrgUrl("/billing/upgrade")}>
                      <Button className={currentOrgPlan === "ORG_FREE" ? "bg-purple-600 hover:bg-purple-700" : "border-border text-foreground hover:bg-muted"} variant={currentOrgPlan === "ORG_FREE" ? "default" : "outline"}>
                        {currentOrgPlan === "ORG_FREE" ? (
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
                )}
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
              Your organization&apos;s current usage vs plan limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <LimitItem
                label="Members"
                icon={Users}
                current={usage.members}
                max={planLimits.seats.included}
              />
              <LimitItem
                label="Departments"
                icon={FolderTree}
                current={usage.departments}
                max={planLimits.departments}
              />
              <LimitItem
                label="Gateways"
                icon={Zap}
                current={usage.gateways}
                max={planLimits.sharedGateways}
              />
              <LimitItem
                label="Plugins"
                icon={Database}
                current={usage.plugins}
                max={planLimits.sharedPlugins}
              />
              <LimitItem
                label="Workflows"
                icon={GitBranch}
                current={usage.workflows}
                max={planLimits.sharedWorkflows}
              />
              <LimitItem
                label="AI Tokens/Month"
                icon={Bot}
                current={usage.aiTokensThisMonth}
                max={planLimits.sharedAiTokensPerMonth}
              />
              {planLimits.executionMode === "SERVERLESS" && (
                <LimitItem
                  label="Monthly Executions"
                  icon={Cpu}
                  current={usage.executionsThisMonth}
                  max={planLimits.executionsPerMonth}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Workspace Pool Section */}
        {hasWorkspacePool && (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Server className="h-5 w-5 text-purple-400" />
                Workspace Pool
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Shared compute resources for your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Pool Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <MemoryStick className="h-4 w-4" />
                      <span className="text-sm">RAM Pool</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.pool.ramMb && planLimits.pool.ramMb >= 1024
                        ? `${(planLimits.pool.ramMb / 1024).toFixed(0)}GB`
                        : `${planLimits.pool.ramMb}MB`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Shared across all members
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Cpu className="h-4 w-4" />
                      <span className="text-sm">CPU Pool</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.pool.cpuCores} {planLimits.pool.cpuCores === 1 ? "Core" : "Cores"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Shared across all members
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <HardDrive className="h-4 w-4" />
                      <span className="text-sm">Storage Pool</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {planLimits.pool.storageMb && planLimits.pool.storageMb >= 1024
                        ? `${(planLimits.pool.storageMb / 1024).toFixed(0)}GB`
                        : `${planLimits.pool.storageMb}MB`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Shared across all members
                    </p>
                  </div>
                </div>

                {/* Add More Button */}
                {canManageBilling && (
                  <Link href={buildOrgUrl("/billing/workspace")}>
                    <Button variant="outline" className="w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10">
                      <Server className="mr-2 h-4 w-4" />
                      Add More Pool Resources
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Workspace Pool - Show for ORG_FREE */}
        {!hasWorkspacePool && (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Server className="h-5 w-5 text-purple-400" />
                Workspace Pool
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Shared compute resources for your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-6 rounded-lg bg-muted/20 border border-dashed border-border text-center">
                  <Server className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h4 className="font-medium text-foreground">No Workspace Pool</h4>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Your plan uses serverless execution with {planLimits.executionsPerMonth?.toLocaleString()} monthly executions.
                  </p>
                  {canManageBilling && (
                    <Link href={buildOrgUrl("/billing/workspace")}>
                      <Button className="bg-purple-600 hover:bg-purple-700">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Get Workspace Pool
                      </Button>
                    </Link>
                  )}
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Add a workspace pool to unlock unlimited executions for your organization.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upgrade CTA for free orgs */}
        {currentOrgPlan === "ORG_FREE" && canManageBilling && (
          <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-background/50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Ready to scale your organization?
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    Upgrade to get more members, shared workspace pool, and higher limits.
                  </p>
                </div>
                <Link href={buildOrgUrl("/billing/upgrade")}>
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

export default function OrgBillingPage() {
  return (
    <ProtectedRoute>
      <OrgBillingContent />
    </ProtectedRoute>
  );
}
