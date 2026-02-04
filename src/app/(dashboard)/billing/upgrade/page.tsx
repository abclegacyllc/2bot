"use client";

/**
 * Plan Upgrade Page
 *
 * Displays available subscription plans and allows users to upgrade.
 * Uses centralized plan data from @/shared/constants/plans.ts
 *
 * @module app/(dashboard)/billing/upgrade/page
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
import { apiUrl } from "@/shared/config/urls";
import {
    ALL_PLAN_TYPES,
    INCLUDED_WORKSPACE_TIER,
    PLAN_LIMITS,
    PLAN_ORDER,
    type PlanType,
} from "@/shared/constants/plans";
import type { LucideIcon } from "lucide-react";
import {
    AlertCircle,
    ArrowLeft,
    Building,
    Check,
    CreditCard,
    Crown,
    Info,
    Loader2,
    Sparkles,
    Star,
    Users,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// Map plan IDs to icons
const PLAN_ICONS: Record<PlanType, LucideIcon> = {
  FREE: Users,
  STARTER: Zap,
  PRO: Star,
  BUSINESS: Building,
  ENTERPRISE: Crown,
};

function formatPrice(cents: number | null): string {
  if (cents === null) return "Custom";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

function UpgradeContent() {
  const { context, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [error, setError] = useState<string | null>(null);

  const currentPlan = (context.plan || "FREE") as PlanType;

  const handleUpgrade = async (planId: PlanType) => {
    setSelectedPlan(planId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/billing/checkout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: planId, billingCycle }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error("Failed to create checkout session:", err);
      setError(err instanceof Error ? err.message : "Failed to create checkout session");
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  if (authLoading) {
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
              <CreditCard className="h-8 w-8 text-purple-400" />
              Upgrade Plan
            </h1>
            <p className="text-muted-foreground mt-1">
              Choose the best plan for your needs
            </p>
          </div>
          <Link href="/billing">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Billing
            </Button>
          </Link>
        </div>

        {/* Error Alert */}
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
        {currentPlan !== "FREE" && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>
              Upgrades take effect immediately. Downgrades apply at the end of your current billing period.
            </span>
          </div>
        )}

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ALL_PLAN_TYPES.map((planId) => {
            const plan = PLAN_LIMITS[planId];
            const Icon = PLAN_ICONS[planId];
            const workspaceTier = INCLUDED_WORKSPACE_TIER[planId];
            const hasWorkspace = workspaceTier !== null && plan.workspace !== null;
            const isCurrent = currentPlan === planId;
            const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
            const isPopular = planId === "PRO";

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
                      {plan.gateways === -1 ? "Unlimited" : plan.gateways} gateways
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.workflows === -1 ? "Unlimited" : plan.workflows} workflows
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.plugins === -1 ? "Unlimited" : plan.plugins} plugins
                    </li>
                    {hasWorkspace ? (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                        {plan.workspace && plan.workspace.ramMb >= 1024 
                          ? `${(plan.workspace.ramMb / 1024).toFixed(0)}GB` 
                          : `${plan.workspace?.ramMb}MB`} dedicated workspace
                      </li>
                    ) : (
                      <li className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-green-400" />
                        {plan.workflowRunsPerMonth?.toLocaleString()} workflow runs/month
                      </li>
                    )}
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.creditsPerMonth === -1 ? "Unlimited" : (plan.creditsPerMonth / 1000).toLocaleString()}K credits/month
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-400" />
                      {plan.historyDays} days history
                    </li>
                  </ul>

                  <Button
                    className={`w-full ${
                      isCurrent
                        ? "bg-green-600 hover:bg-green-700"
                        : PLAN_ORDER[planId] > PLAN_ORDER[currentPlan]
                          ? "bg-purple-600 hover:bg-purple-700"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}
                    disabled={isCurrent || loading || planId === "FREE" || planId === "ENTERPRISE"}
                    onClick={() => handleUpgrade(planId)}
                  >
                    {loading && selectedPlan === planId ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrent ? (
                      "Current Plan"
                    ) : planId === "FREE" ? (
                      "Free Plan"
                    ) : planId === "ENTERPRISE" ? (
                      "Contact Sales"
                    ) : PLAN_ORDER[planId] > PLAN_ORDER[currentPlan] ? (
                      "Upgrade"
                    ) : (
                      "Downgrade"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <ProtectedRoute>
      <UpgradeContent />
    </ProtectedRoute>
  );
}
