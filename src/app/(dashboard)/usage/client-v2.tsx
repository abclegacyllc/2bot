"use client";

/**
 * Usage Dashboard V2 Client Component
 *
 * Uses the new hierarchical resource status types and components.
 * This is the Phase 3 migration path for the usage dashboard.
 *
 * @module app/(dashboard)/usage/client-v2
 */

import { useAuth } from "@/components/providers/auth-provider";
import {
    isOrgStatus,
    isPersonalStatus,
    ResourceOverview,
    useResourceStatus,
} from "@/components/resources";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Zap } from "lucide-react";
import Link from "next/link";

// ===========================================
// Skeleton Component
// ===========================================

function UsageDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Pool Cards Skeleton */}
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-card/50">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ===========================================
// Error Component
// ===========================================

function ErrorDisplay({ 
  error, 
  onRetry 
}: { 
  error: Error | null; 
  onRetry: () => void;
}) {
  return (
    <Card className="bg-card/50 border-red-500/50">
      <CardContent className="py-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          Failed to Load Resource Status
        </h3>
        <p className="text-muted-foreground mb-4">
          {error?.message || "An error occurred while loading your resource status."}
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Main Component
// ===========================================

export function UsageDashboardV2Client() {
  const { context, isLoading: authLoading } = useAuth();
  
  // Determine context for API call
  const resourceOptions = context.type === "organization" && context.organizationId
    ? { orgId: context.organizationId }
    : {};
  
  const { status, isLoading, error, refresh } = useResourceStatus(resourceOptions);

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <UsageDashboardSkeleton />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !status) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Zap className="h-8 w-8 text-purple-400" />
                Resource Usage
              </h1>
              <p className="text-muted-foreground mt-1">
                {context.type === "organization"
                  ? `Resources for ${context.organizationName}`
                  : "Your personal resource usage"}
              </p>
            </div>
          </div>
          <ErrorDisplay error={error} onRetry={refresh} />
        </div>
      </div>
    );
  }

  // Get plan name based on context
  const planName = isPersonalStatus(status) 
    ? status.plan 
    : isOrgStatus(status) 
      ? status.plan 
      : "Unknown";

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Zap className="h-8 w-8 text-purple-400" />
              Resource Usage
            </h1>
            <p className="text-muted-foreground mt-1">
              {context.type === "organization"
                ? `Resources for ${context.organizationName}`
                : "Your personal resource usage"}
              {" • "}
              <span className="text-purple-400">{planName} Plan</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Link href={context.type === "organization" ? "/organizations/billing" : "/billing"}>
              <Button className="bg-purple-600 hover:bg-purple-700">
                Manage Plan
              </Button>
            </Link>
          </div>
        </div>

        {/* Resource Overview */}
        <ResourceOverview status={status} />

        {/* Upgrade CTA for Free plans */}
        {(planName === "FREE" || planName === "ORG_FREE") && (
          <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-background/50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Ready to unlock more?
                  </h3>
                  <p className="text-muted-foreground mt-1">
                    Upgrade your plan to get more resources and higher limits.
                  </p>
                </div>
                <Link href={context.type === "organization" ? "/organizations/billing/upgrade" : "/billing/upgrade"}>
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
