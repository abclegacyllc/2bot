"use client";

/**
 * Organization Plan Upgrade Page
 *
 * Displays available organization plans and allows admins to upgrade.
 * Uses centralized plan data from @/shared/constants/org-plans.ts
 *
 * @module app/(dashboard)/organizations/[orgSlug]/billing/upgrade/page
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
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    ALL_ORG_PLAN_TYPES,
    INCLUDED_ORG_WORKSPACE_POOL,
    ORG_PLAN_LIMITS,
    ORG_PLAN_ORDER,
    type OrgPlanType,
} from "@/shared/constants/org-plans";
import type { LucideIcon } from "lucide-react";
import {
    AlertCircle,
    ArrowLeft,
    Building2,
    Check,
    Crown,
    Info,
    Loader2,
    Rocket,
    Sparkles,
    Star,
    Users,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

const ORG_PLAN_ICONS: Record<OrgPlanType, LucideIcon> = {
  ORG_FREE: Users,
  ORG_STARTER: Zap,
  ORG_GROWTH: Star,
  ORG_PRO: Star,
  ORG_BUSINESS: Rocket,
  ORG_ENTERPRISE: Crown,
};

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

function formatPrice(cents: number | null): string {
  if (cents === null) return "Custom";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

function OrgUpgradeContent() {
  const { token } = useAuth();
  const router = useRouter();
  const { orgId, orgName: hookOrgName, orgRole, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const [upgrading, setUpgrading] = useState<OrgPlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const fetcher = createFetcher(token);

  // Check context - must be after hooks
  const isOrgContext = isFound && !!orgId;
  const canManageBilling = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";
  const orgName = hookOrgName || "Organization";

  // Fetch current subscription
  const { data: subData, isLoading } = useSWR<{
    success: boolean;
    data: { plan: string };
  }>(
    token && orgId ? apiUrl(`/organizations/${orgId}/billing/subscription`) : null,
    fetcher
  );

  // Redirect if not in org context - AFTER all hooks
  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/billing/upgrade");
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

  const currentPlan = (subData?.data?.plan as OrgPlanType) || "ORG_FREE";

  const isCurrentOrgPlan = (planId: OrgPlanType): boolean => {
    return currentPlan === planId;
  };

  const handleUpgrade = async (planId: OrgPlanType) => {
    if (!canManageBilling || isCurrentOrgPlan(planId)) return;

    setUpgrading(planId);
    setError(null);

    try {
      const res = await fetch(apiUrl(`/organizations/${orgId}/billing/checkout`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          plan: planId,
          billingCycle 
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
      setUpgrading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Building2 className="h-8 w-8 text-purple-400" />
              Upgrade Organization Plan
            </h1>
            <p className="text-muted-foreground mt-1">
              Choose the best plan for {orgName}
            </p>
          </div>
          <Link href={buildOrgUrl("/billing")}>
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

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center gap-2 p-1 bg-muted/30 rounded-lg w-fit mx-auto">
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

        {/* Billing Change Info */}
        {currentPlan !== "ORG_FREE" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>
              Upgrades take effect immediately. Downgrades apply at the end of your current billing period.
            </span>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ALL_ORG_PLAN_TYPES.map((planId) => {
            const plan = ORG_PLAN_LIMITS[planId];
            const Icon = ORG_PLAN_ICONS[planId];
            const poolTier = INCLUDED_ORG_WORKSPACE_POOL[planId];
            const hasPool = poolTier !== "NONE" && plan.pool.ramMb !== null;
            const isCurrent = isCurrentOrgPlan(planId);
            const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
            const isPopular = planId === "ORG_PRO";

            return (
              <Card
                key={planId}
                className={`relative border-border bg-card/50 ${
                  isPopular ? "border-purple-500 ring-1 ring-purple-500" : ""
                } ${isCurrent ? "border-green-500" : ""}`}
              >
                {isPopular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600">Most Popular</Badge>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-green-600">Current Plan</Badge>
                  </div>
                )}
                <CardHeader className="text-center pt-8">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-purple-400" />
                  </div>
                  <CardTitle className="text-foreground">{plan.displayName}</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {plan.description}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {formatPrice(price)}
                    </span>
                    {price !== null && price > 0 && (
                      <span className="text-muted-foreground">
                        /{billingCycle === "yearly" ? "year" : "month"}
                      </span>
                    )}
                    {billingCycle === "yearly" && plan.priceMonthly !== null && plan.priceMonthly > 0 && (
                      <p className="text-xs text-green-400 mt-1">Save ${(plan.priceMonthly * 2) / 100}/year</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.seats.included === -1 ? "Unlimited" : plan.seats.included} members
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.sharedGateways === -1 ? "Unlimited" : plan.sharedGateways} gateways
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.sharedWorkflows === -1 ? "Unlimited" : plan.sharedWorkflows} workflows
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.sharedPlugins === -1 ? "Unlimited" : plan.sharedPlugins} plugins
                    </li>
                    {hasPool ? (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                        {plan.pool.ramMb && plan.pool.ramMb >= 1024 
                          ? `${(plan.pool.ramMb / 1024).toFixed(0)}GB` 
                          : `${plan.pool.ramMb}MB`} shared RAM pool
                      </li>
                    ) : (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-green-400" />
                        {plan.executionsPerMonth?.toLocaleString()} executions/month
                      </li>
                    )}
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.sharedAiTokensPerMonth === -1 ? "Unlimited" : (plan.sharedAiTokensPerMonth / 1000).toLocaleString()}K AI tokens/month
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.historyDays} days history
                    </li>
                  </ul>

                  {canManageBilling && (
                    <Button
                      className={`w-full ${
                        isCurrent
                          ? "bg-green-600 hover:bg-green-700"
                          : ORG_PLAN_ORDER[planId] > ORG_PLAN_ORDER[currentPlan]
                            ? "bg-purple-600 hover:bg-purple-700"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                      disabled={isCurrent || upgrading !== null || planId === "ORG_FREE" || planId === "ORG_ENTERPRISE"}
                      onClick={() => handleUpgrade(planId)}
                    >
                      {upgrading === planId ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrent ? (
                        "Current Plan"
                      ) : planId === "ORG_FREE" ? (
                        "Free Plan"
                      ) : planId === "ORG_ENTERPRISE" ? (
                        "Contact Sales"
                      ) : ORG_PLAN_ORDER[planId] > ORG_PLAN_ORDER[currentPlan] ? (
                        "Upgrade"
                      ) : (
                        "Downgrade"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function OrgUpgradePage() {
  return (
    <ProtectedRoute>
      <OrgUpgradeContent />
    </ProtectedRoute>
  );
}
