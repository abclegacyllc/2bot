"use client";

/**
 * Billing Settings Page
 *
 * Displays current subscription plan, status, and usage limits.
 * Allows users to upgrade or manage their subscription.
 *
 * @module app/dashboard/settings/billing/page
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
import {
    AlertCircle,
    ArrowLeft,
    Cpu,
    CreditCard,
    Database,
    ExternalLink,
    Settings,
    Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";

interface SubscriptionInfo {
  plan: string;
  status: "active" | "past_due" | "canceled" | "none";
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  limits: {
    maxGateways: number;
    maxPlugins: number;
    maxExecutionsPerDay: number;
    ramMb: number;
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
  max: number;
  unit?: string;
}) {
  const percentage = Math.min((current / max) * 100, 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

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
          {current.toLocaleString()} / {max.toLocaleString()} {unit}
        </span>
      </div>
      <Progress
        value={percentage}
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

  // Create fetcher with auth token
  const fetcher = createFetcher(token);

  const { data: subscriptionData, isLoading: subLoading } =
    useSWR<{ success: boolean; subscription: SubscriptionInfo }>(
      token ? "/api/billing/subscription" : null,
      fetcher
    );

  // Using URL-based routes (Phase 6.7) - /api/user/quota for personal quota
  const { data: quotaData, isLoading: quotaLoading } =
    useSWR<{ success: boolean; data: QuotaStatus }>(
      token ? "/api/user/quota" : null,
      fetcher
    );

  const isLoading = authLoading || subLoading || quotaLoading;
  const subscription = subscriptionData?.subscription;
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
                <Link href="/dashboard">
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
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Failed to open billing portal:", error);
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
          <Link href="/dashboard/settings">
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
                    {subscription?.plan || "FREE"}
                  </p>
                  {getStatusBadge(
                    subscription?.status || "none",
                    subscription?.cancelAtPeriodEnd || false
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription?.status === "active" &&
                    subscription.currentPeriodEnd &&
                    !subscription.cancelAtPeriodEnd && (
                      <>Renews on {formatDate(subscription.currentPeriodEnd)}</>
                    )}
                  {subscription?.status === "none" && "Free forever"}
                  {subscription?.cancelAtPeriodEnd &&
                    subscription.currentPeriodEnd && (
                      <span className="text-yellow-400">
                        Access until {formatDate(subscription.currentPeriodEnd)}
                      </span>
                    )}
                </p>
              </div>

              <div className="flex gap-3">
                {(!subscription?.plan || subscription.plan === "FREE") ? (
                  <Link href="/dashboard/settings/billing/upgrade">
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      <Zap className="mr-2 h-4 w-4" />
                      Upgrade Plan
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="outline"
                    className="border-border text-foreground hover:bg-muted"
                    onClick={handleManageBilling}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Manage Subscription
                  </Button>
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
              Your current usage vs plan limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <LimitItem
                label="Gateways"
                icon={Zap}
                current={usage.gateways}
                max={subscription?.limits?.maxGateways || 3}
              />
              <LimitItem
                label="Plugins"
                icon={Database}
                current={usage.plugins}
                max={subscription?.limits?.maxPlugins || 10}
              />
              <LimitItem
                label="Daily Executions"
                icon={Cpu}
                current={usage.executionsToday}
                max={subscription?.limits?.maxExecutionsPerDay || 1000}
              />
              <LimitItem
                label="RAM Allocation"
                icon={Cpu}
                current={usage.ramUsedMb}
                max={subscription?.limits?.ramMb || 512}
                unit="MB"
              />
            </div>
          </CardContent>
        </Card>

        {/* Upgrade CTA for free users */}
        {subscription?.plan === "FREE" && (
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
                <Link href="/dashboard/settings/billing/upgrade">
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
