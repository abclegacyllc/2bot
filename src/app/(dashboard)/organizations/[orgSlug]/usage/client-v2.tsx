"use client";

/**
 * Org Usage Dashboard V2 Client Component
 *
 * Uses the new hierarchical resource status types and components.
 * This is the Phase 3 migration path for the org usage dashboard.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/usage/client-v2
 */

import { DeptUsageBreakdown } from "@/components/organization/dept-usage-breakdown";
import { MemberUsageTable } from "@/components/organization/member-usage-table";
import { useAuth } from "@/components/providers/auth-provider";
import {
    isOrgStatus,
    ResourceOverview,
    useResourceStatus,
} from "@/components/resources";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import { AlertCircle, ArrowLeft, RefreshCw, Settings, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types for department/member breakdown
// ===========================================

interface DepartmentUsage {
  id: string;
  name: string;
  executions: {
    current: number;
    allocated: number | null;
  };
  members: number;
}

interface MemberUsage {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
  departmentName?: string;
  executions: {
    current: number;
    allocated: number | null;
  };
}

// ===========================================
// Skeleton Component
// ===========================================

function OrgUsageDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Resource pools skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card/50">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3].map((j) => (
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

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 rounded-lg" />
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

export function OrgUsageDashboardV2Client() {
  const { token, isLoading: authLoading } = useAuth();
  const { orgId, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const router = useRouter();

  // Fetch resource status using new v2 endpoint
  const { status, isLoading: statusLoading, error: statusError, refresh } = useResourceStatus(
    orgId ? { orgId } : {}
  );

  // Separate state for department/member breakdown (not part of resource status)
  const [departments, setDepartments] = useState<DepartmentUsage[]>([]);
  const [members, setMembers] = useState<MemberUsage[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  // Fetch department and member breakdown data
  const fetchBreakdown = useCallback(async () => {
    if (!token || !orgId) return;

    try {
      setBreakdownLoading(true);
      
      // Fetch org usage which includes department/member breakdown
      const response = await fetch(apiUrl(`/orgs/${orgId}/usage`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setDepartments(data.data?.departments || []);
        setMembers(data.data?.members || []);
      }
    } catch (err) {
      console.error("Error fetching breakdown:", err);
      // Continue without breakdown data
    } finally {
      setBreakdownLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    if (token && orgId) {
      fetchBreakdown();
    }
  }, [token, orgId, fetchBreakdown]);

  const handleUpgrade = () => {
    router.push(buildOrgUrl("/billing"));
  };

  const handleRefresh = () => {
    refresh();
    fetchBreakdown();
  };

  // Loading state
  if (authLoading || orgLoading || statusLoading) {
    return <OrgUsageDashboardSkeleton />;
  }

  // Org not found
  if (!isFound || !orgId) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-foreground">Organization not found</p>
        <p className="text-muted-foreground mt-2">
          The organization you're looking for doesn't exist or you don't have access.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Error state
  if (statusError || !status) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={buildOrgUrl("/")}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Zap className="h-8 w-8 text-purple-400" />
                {orgName || "Organization"}
              </h1>
              <p className="text-muted-foreground">Resource usage and allocation</p>
            </div>
          </div>
        </div>
        <ErrorDisplay error={statusError} onRetry={handleRefresh} />
      </div>
    );
  }

  // Get plan name
  const planName = isOrgStatus(status) ? status.plan : "Unknown";

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={buildOrgUrl("/")}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Zap className="h-8 w-8 text-purple-400" />
              {orgName || "Organization"}
            </h1>
            <p className="text-muted-foreground">
              Resource usage and allocation
              {" • "}
              <span className="text-purple-400">{planName} Plan</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href={buildOrgUrl("/quotas")}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Manage Allocations
            </Button>
          </Link>
          {(planName === "ORG_FREE" || planName === "ORG_STARTER") && (
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleUpgrade}>
              Upgrade
            </Button>
          )}
        </div>
      </div>

      {/* Resource Overview using new components */}
      <ResourceOverview status={status} />

      {/* Allocation Summary Card (if org context) */}
      {isOrgStatus(status) && (
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle>Allocation Summary</CardTitle>
            <CardDescription>
              How resources are distributed to departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">
                  {status.allocations.departmentCount}
                </div>
                <div className="text-sm text-muted-foreground">Departments</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">
                  {status.allocations.memberCount}
                </div>
                <div className="text-sm text-muted-foreground">Members</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">
                  {status.allocations.allocated.workflows}
                </div>
                <div className="text-sm text-muted-foreground">Workflows Allocated</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-foreground">
                  {status.allocations.unallocated.workflows ?? "∞"}
                </div>
                <div className="text-sm text-muted-foreground">Unallocated</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for department and member breakdown */}
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4">
          {breakdownLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : departments.length > 0 ? (
            <DeptUsageBreakdown orgId={orgId} departments={departments} />
          ) : (
            <Card className="bg-card/50">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No departments found</p>
                <Link href={buildOrgUrl("/departments")}>
                  <Button variant="outline" className="mt-4">
                    Manage Departments
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          {breakdownLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : members.length > 0 ? (
            <MemberUsageTable members={members} />
          ) : (
            <Card className="bg-card/50">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No members found</p>
                <Link href={buildOrgUrl("/members")}>
                  <Button variant="outline" className="mt-4">
                    Manage Members
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
