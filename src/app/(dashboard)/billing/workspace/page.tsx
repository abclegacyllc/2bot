"use client";

/**
 * Workspace Add-ons Page
 *
 * Allows users to purchase/manage workspace add-ons to expand compute resources.
 * - FREE/STARTER users: Buy workspace to enable unlimited executions
 * - PRO+ users: Add more resources on top of included workspace (STACKING)
 *
 * Uses centralized data from @/shared/constants/workspace-addons.ts
 *
 * @module app/(dashboard)/billing/workspace/page
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
import { getPlanDisplayName, INCLUDED_WORKSPACE_TIER, PLAN_LIMITS, type PlanType } from "@/shared/constants/plans";
import {
    ALL_ADDON_TIERS,
    calculateTotalWorkspace,
    canPurchaseAddon,
    getMinRequiredPlanForAddon,
    WORKSPACE_ADDONS,
    WORKSPACE_PRICING,
    WORKSPACE_SPECS,
    type WorkspaceAddonTier
} from "@/shared/constants/workspace-addons";
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
import { useState } from "react";

/**
 * Workspace Tier Card Component
 */
function WorkspaceTierCard({
  tier,
  currentPlan,
  isOwned,
  onPurchase,
  loading,
  billingCycle = "monthly",
}: {
  tier: WorkspaceAddonTier;
  currentPlan: PlanType;
  isOwned: boolean;
  onPurchase: (tier: WorkspaceAddonTier) => void;
  loading: boolean;
  billingCycle?: "monthly" | "yearly";
}) {
  const addon = WORKSPACE_ADDONS[tier];
  const specs = WORKSPACE_SPECS[tier];
  const pricing = WORKSPACE_PRICING[tier];
  const canPurchase = canPurchaseAddon(currentPlan, tier);
  const isLocked = !canPurchase && !isOwned;
  const price = billingCycle === "yearly" ? pricing.priceYearly : pricing.priceMonthly;
  const minRequiredPlan = getMinRequiredPlanForAddon(tier);

  // Format specs for display
  const ramGb = specs.ramMb / 1024;
  const storageGb = specs.storageMb / 1024;

  return (
    <Card
      className={cn(
        "relative border-border bg-card/50 transition-all duration-200 hover:border-purple-500/50",
        isOwned && "border-green-500/50 bg-green-500/5",
        isLocked && "opacity-60"
      )}
    >
      {isOwned && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-green-600 text-white">Owned</Badge>
        </div>
      )}

      {isLocked && minRequiredPlan && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
            <Lock className="h-3 w-3 mr-1" />
            Requires {PLAN_LIMITS[minRequiredPlan].displayName}+
          </Badge>
        </div>
      )}

      <CardHeader className="text-center pt-8">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
          <Server className="h-6 w-6 text-purple-400" />
        </div>
        <CardTitle className="text-foreground text-xl">{addon.displayName}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {addon.description}
        </CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold text-foreground">
            ${price / 100}
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
              {specs.cpuCores} {specs.cpuCores === 1 ? "Core" : "Cores"}
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
        {isOwned ? (
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
        ) : (
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
            Add to Subscription
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/**
 * Current Workspace Summary Component
 */
function WorkspaceSummary({
  currentPlan,
  ownedAddons,
}: {
  currentPlan: PlanType;
  ownedAddons: WorkspaceAddonTier[];
}) {
  const includedTier = INCLUDED_WORKSPACE_TIER[currentPlan];
  const planLimits = PLAN_LIMITS[currentPlan];
  const hasIncludedWorkspace = includedTier !== null;

  // Calculate total workspace resources
  const totalWorkspace = calculateTotalWorkspace(planLimits.workspace, ownedAddons);
  const hasAnyWorkspace = hasIncludedWorkspace || ownedAddons.length > 0;

  if (!hasAnyWorkspace) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            No Workspace Active
          </CardTitle>
          <CardDescription>
            You&apos;re currently on serverless mode with limited executions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card/50">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Server className="h-5 w-5 text-green-400" />
          Your Workspace Resources
        </CardTitle>
        <CardDescription>
          Combined resources from your plan{ownedAddons.length > 0 ? " + add-ons" : ""}
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
                {totalWorkspace.ramMb >= 1024
                  ? `${(totalWorkspace.ramMb / 1024).toFixed(0)}GB`
                  : `${totalWorkspace.ramMb}MB`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {hasIncludedWorkspace && includedTier !== 'CUSTOM' && (
                <span>{WORKSPACE_SPECS[includedTier].ramMb / 1024}GB from plan</span>
              )}
              {ownedAddons.length > 0 && (
                <span>
                  {hasIncludedWorkspace && " + "}
                  {ownedAddons.reduce((sum, t) => sum + WORKSPACE_SPECS[t].ramMb, 0) / 1024}GB from add-ons
                </span>
              )}
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
                {totalWorkspace.cpuCores} {totalWorkspace.cpuCores === 1 ? "Core" : "Cores"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {hasIncludedWorkspace && includedTier !== 'CUSTOM' && (
                <span>{WORKSPACE_SPECS[includedTier].cpuCores} from plan</span>
              )}
              {ownedAddons.length > 0 && (
                <span>
                  {hasIncludedWorkspace && " + "}
                  {ownedAddons.reduce((sum, t) => sum + WORKSPACE_SPECS[t].cpuCores, 0)} from add-ons
                </span>
              )}
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
                {totalWorkspace.storageMb >= 1024
                  ? `${(totalWorkspace.storageMb / 1024).toFixed(0)}GB`
                  : `${totalWorkspace.storageMb}MB`}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {hasIncludedWorkspace && includedTier !== 'CUSTOM' && (
                <span>{WORKSPACE_SPECS[includedTier].storageMb / 1024}GB from plan</span>
              )}
              {ownedAddons.length > 0 && (
                <span>
                  {hasIncludedWorkspace && " + "}
                  {ownedAddons.reduce((sum, t) => sum + WORKSPACE_SPECS[t].storageMb, 0) / 1024}GB from add-ons
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Main Workspace Page Content
 */
function WorkspaceContent() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [purchaseLoading, setPurchaseLoading] = useState<WorkspaceAddonTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  // Get current plan (default to FREE)
  const currentPlan = (user?.plan as PlanType) || "FREE";
  const planLimits = PLAN_LIMITS[currentPlan];

  // TODO: Fetch owned add-ons from user data / subscription
  // For now, use empty array - this should come from user.workspaceAddons
  const ownedAddons: WorkspaceAddonTier[] = [];

  const handlePurchase = async (tier: WorkspaceAddonTier) => {
    setPurchaseLoading(tier);
    setError(null);

    try {
      const response = await fetch(apiUrl("/billing/workspace-addon"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier, billingCycle }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to purchase workspace add-on");
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error("Failed to purchase workspace add-on:", err);
      setError(err instanceof Error ? err.message : "Failed to purchase workspace add-on");
    } finally {
      setPurchaseLoading(null);
    }
  };

  if (authLoading) {
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
              Workspace Add-ons
            </h1>
            <p className="text-muted-foreground mt-1">
              Expand your compute resources or unlock unlimited executions
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Plan Info */}
        <Alert className="border-border bg-muted/30">
          <Info className="h-4 w-4" />
          <AlertTitle>Current Plan: {getPlanDisplayName(currentPlan as PlanType)}</AlertTitle>
          <AlertDescription>
            {INCLUDED_WORKSPACE_TIER[currentPlan] 
              ? `Your plan includes the ${INCLUDED_WORKSPACE_TIER[currentPlan]} workspace tier. Add-ons will stack on top.`
              : "Your plan uses serverless execution. Purchase a workspace add-on to unlock unlimited executions."
            }
          </AlertDescription>
        </Alert>

        {/* Workspace Summary */}
        <WorkspaceSummary currentPlan={currentPlan} ownedAddons={ownedAddons} />

        {/* Add-on Tiers */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Available Workspace Add-ons
          </h2>
          <p className="text-muted-foreground mb-6">
            All add-ons stack with your included workspace resources. Purchase multiple for more power.
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
            {ALL_ADDON_TIERS.map((tier) => (
              <WorkspaceTierCard
                key={tier}
                tier={tier}
                currentPlan={currentPlan}
                isOwned={ownedAddons.includes(tier)}
                onPurchase={handlePurchase}
                loading={purchaseLoading === tier}
                billingCycle={billingCycle}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceAddonsPage() {
  return (
    <ProtectedRoute>
      <WorkspaceContent />
    </ProtectedRoute>
  );
}
