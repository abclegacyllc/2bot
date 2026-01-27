"use client";

/**
 * Organization Workspace Pool Management Page
 *
 * Allows org admins to add or upgrade shared workspace pool resources.
 * Uses centralized data from @/shared/constants/org-workspace-addons.ts
 *
 * @module app/(dashboard)/organizations/billing/workspace/page
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
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import { INCLUDED_ORG_WORKSPACE_POOL, ORG_PLAN_LIMITS, type OrgPlanType } from "@/shared/constants/org-plans";
import {
    ALL_ORG_BOOSTER_TIERS,
    ALLOWED_ORG_BOOSTERS_BY_PLAN,
    getMinRequiredPlanForBooster,
    ORG_WORKSPACE_BOOSTERS,
    type OrgWorkspaceBoosterTier,
} from "@/shared/constants/org-workspace-addons";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    Cpu,
    HardDrive,
    Info,
    Loader2,
    Lock,
    MemoryStick,
    Plus,
    Server
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

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

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Workspace Booster Card Component
 */
function WorkspaceBoosterCard({
  tier,
  currentOrgPlan,
  isCurrent,
  isAllowed,
  onPurchase,
  loading,
  billingCycle = "monthly",
  canManageBilling,
}: {
  tier: OrgWorkspaceBoosterTier;
  currentOrgPlan: OrgPlanType;
  isCurrent: boolean;
  isAllowed: boolean;
  onPurchase: (tier: OrgWorkspaceBoosterTier) => void;
  loading: boolean;
  billingCycle?: "monthly" | "yearly";
  canManageBilling: boolean;
}) {
  const booster = ORG_WORKSPACE_BOOSTERS[tier];
  const isLocked = !isAllowed && !isCurrent;
  const price = billingCycle === "yearly" ? booster.priceYearly : booster.priceMonthly;
  const minRequiredPlan = getMinRequiredPlanForBooster(tier);

  // Format specs for display
  const ramGb = booster.ramMb >= 1024 ? (booster.ramMb / 1024).toFixed(0) : `${booster.ramMb / 1024}`;
  const storageGb = booster.storageMb >= 1024 ? (booster.storageMb / 1024).toFixed(0) : `${booster.storageMb / 1024}`;

  return (
    <Card
      className={cn(
        "relative border-border bg-card/50 transition-all duration-200 hover:border-purple-500/50",
        isCurrent && "border-green-500/50 bg-green-500/5",
        isLocked && "opacity-60"
      )}
    >
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-green-600 text-white">Owned</Badge>
        </div>
      )}

      {isLocked && minRequiredPlan && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
            <Lock className="h-3 w-3 mr-1" />
            Requires {ORG_PLAN_LIMITS[minRequiredPlan].displayName}+
          </Badge>
        </div>
      )}

      <CardHeader className="text-center pt-8">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
          <Server className="h-6 w-6 text-purple-400" />
        </div>
        <CardTitle className="text-foreground text-xl">{booster.displayName}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {booster.description}
        </CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold text-foreground">
            {formatPrice(price)}
          </span>
          <span className="text-muted-foreground">/{billingCycle === "yearly" ? "year" : "month"}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="space-y-4">
          {/* RAM */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MemoryStick className="h-4 w-4" />
              <span>RAM</span>
            </div>
            <span className="font-medium text-foreground">{ramGb}GB</span>
          </div>

          {/* CPU */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="h-4 w-4" />
              <span>CPU</span>
            </div>
            <span className="font-medium text-foreground">
              {booster.cpuCores} {booster.cpuCores === 1 ? "Core" : "Cores"}
            </span>
          </div>

          {/* Storage */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>Storage</span>
            </div>
            <span className="font-medium text-foreground">{storageGb}GB SSD</span>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        {isCurrent ? (
          <Button
            variant="outline"
            className="w-full border-green-500/50 text-green-500"
            disabled
          >
            <Check className="mr-2 h-4 w-4" />
            Active
          </Button>
        ) : isLocked ? (
          <Button variant="outline" className="w-full" disabled>
            <Lock className="mr-2 h-4 w-4" />
            Upgrade Plan to Unlock
          </Button>
        ) : canManageBilling ? (
          <Button
            className="w-full bg-purple-600 hover:bg-purple-700"
            onClick={() => onPurchase(tier)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add to Pool
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            View Only
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function OrgWorkspaceContent() {
  const { token, context } = useAuth();
  const router = useRouter();
  const [purchasing, setPurchasing] = useState<OrgWorkspaceBoosterTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const fetcher = createFetcher(token);

  // Check context - must be after hooks
  const isOrgContext = context.type === "organization" && !!context.organizationId;
  const canManageBilling = context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN";
  const orgId = context.organizationId;
  const orgName = context.organizationName || "Organization";

  // Fetch current subscription
  const { data: subData, isLoading } = useSWR<{
    success: boolean;
    data: { plan: string; workspaceBooster?: string };
  }>(
    token && orgId ? apiUrl(`/organizations/${orgId}/billing/subscription`) : null,
    fetcher
  );

  // Redirect if not in org context - AFTER all hooks
  useEffect(() => {
    if (!isOrgContext) {
      router.push("/billing/workspace");
    }
  }, [isOrgContext, router]);

  // Show nothing while redirecting
  if (!isOrgContext) {
    return null;
  }

  const currentOrgPlan = (subData?.data?.plan as OrgPlanType) || "ORG_FREE";
  const currentBooster = subData?.data?.workspaceBooster as OrgWorkspaceBoosterTier | undefined;
  const planLimits = ORG_PLAN_LIMITS[currentOrgPlan] || ORG_PLAN_LIMITS.ORG_FREE;
  const poolTier = INCLUDED_ORG_WORKSPACE_POOL[currentOrgPlan] || "NONE";
  const hasIncludedPool = poolTier !== "NONE" && planLimits.pool?.ramMb !== null;

  // Get allowed boosters for current plan
  const allowedBoosters = ALLOWED_ORG_BOOSTERS_BY_PLAN[currentOrgPlan] ?? [];

  const handlePurchase = async (tier: OrgWorkspaceBoosterTier) => {
    if (!canManageBilling) return;

    setPurchasing(tier);
    setError(null);

    try {
      const res = await fetch(apiUrl(`/organizations/${orgId}/billing/workspace`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier,
          billingCycle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start checkout");
      }

      const { data } = await res.json();
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setPurchasing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Server className="h-8 w-8 text-purple-400" />
              Organization Workspace Pool
            </h1>
            <p className="text-muted-foreground mt-1">
              Add shared compute resources for {orgName}
            </p>
          </div>
          <Link href="/organizations/billing">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Billing
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

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Current Plan Info */}
        <Alert className="border-border bg-muted/30">
          <Info className="h-4 w-4" />
          <AlertTitle>Current Plan: {planLimits.displayName}</AlertTitle>
          <AlertDescription>
            {hasIncludedPool 
              ? `Your plan includes a ${poolTier} workspace pool. Boosters will add to your shared resources.`
              : "Your plan uses serverless execution. Purchase a workspace booster to unlock shared pool resources."
            }
          </AlertDescription>
        </Alert>

        {/* Pool Summary (like user WorkspaceSummary) */}
        {hasIncludedPool ? (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Server className="h-5 w-5 text-green-400" />
                Your Pool Resources
              </CardTitle>
              <CardDescription>
                Included resources from {planLimits.displayName} plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* RAM */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MemoryStick className="h-4 w-4" />
                      <span>Total RAM</span>
                    </div>
                    <span className="font-bold text-foreground">
                      {planLimits.pool.ramMb && planLimits.pool.ramMb >= 1024
                        ? `${(planLimits.pool.ramMb / 1024).toFixed(0)}GB`
                        : `${planLimits.pool.ramMb}MB`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    From {planLimits.displayName} plan
                  </div>
                </div>

                {/* CPU */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Cpu className="h-4 w-4" />
                      <span>Total CPU</span>
                    </div>
                    <span className="font-bold text-foreground">
                      {planLimits.pool.cpuCores} {planLimits.pool.cpuCores === 1 ? "Core" : "Cores"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    From {planLimits.displayName} plan
                  </div>
                </div>

                {/* Storage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <HardDrive className="h-4 w-4" />
                      <span>Total Storage</span>
                    </div>
                    <span className="font-bold text-foreground">
                      {planLimits.pool.storageMb && planLimits.pool.storageMb >= 1024
                        ? `${(planLimits.pool.storageMb / 1024).toFixed(0)}GB`
                        : `${planLimits.pool.storageMb}MB`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    From {planLimits.displayName} plan
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Server className="h-5 w-5 text-muted-foreground" />
                No Pool Active
              </CardTitle>
              <CardDescription>
                Your organization is on serverless mode with limited executions.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Available Pool Boosters */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Available Pool Boosters
          </h2>
          <p className="text-muted-foreground mb-6">
            All boosters add to your shared pool resources.{" "}
            {allowedBoosters.length < ALL_ORG_BOOSTER_TIERS.length && (
              <Link href="/organizations/billing/upgrade" className="text-purple-400 hover:underline">
                Upgrade your plan
              </Link>
            )}{" "}
            {allowedBoosters.length < ALL_ORG_BOOSTER_TIERS.length && "to unlock more options."}
          </p>

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center gap-2 p-1 bg-muted/30 rounded-lg w-fit mx-auto mb-6">
            <Button
              variant={billingCycle === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("monthly")}
              className={billingCycle === "monthly" ? "bg-purple-600" : ""}
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("yearly")}
              className={billingCycle === "yearly" ? "bg-purple-600" : ""}
            >
              Yearly
              <Badge className="ml-2 bg-green-600 text-xs">2 months free</Badge>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {ALL_ORG_BOOSTER_TIERS.map((tier) => {
              const isCurrent = currentBooster === tier;
              const isAllowed = allowedBoosters.includes(tier);

              return (
                <WorkspaceBoosterCard
                  key={tier}
                  tier={tier}
                  currentOrgPlan={currentOrgPlan}
                  isCurrent={isCurrent}
                  isAllowed={isAllowed}
                  onPurchase={handlePurchase}
                  loading={purchasing === tier}
                  billingCycle={billingCycle}
                  canManageBilling={canManageBilling}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrgWorkspacePage() {
  return (
    <ProtectedRoute>
      <OrgWorkspaceContent />
    </ProtectedRoute>
  );
}
