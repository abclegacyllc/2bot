"use client";

/**
 * Org Usage Dashboard Client Component
 *
 * Client-side dashboard that fetches and displays
 * the organization's resource usage, department breakdown, and member usage.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/usage/client
 */

import { DeptUsageBreakdown } from "@/components/organization/dept-usage-breakdown";
import { MemberUsageTable } from "@/components/organization/member-usage-table";
import { OrgUsageOverview } from "@/components/organization/org-usage-overview";
import { useAuth } from "@/components/providers/auth-provider";
import { generateMockUsageData, UsageHistoryChart } from "@/components/quota";
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
import { ArrowLeft, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ===========================================
// Types
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

interface OrgUsageData {
  organization: {
    id: string;
    name: string;
    plan: {
      name: string;
      type: string;
    };
  };
  executions: {
    current: number;
    limit: number | null;
    resetsAt: string;
  };
  gateways: {
    current: number;
    limit: number | null;
  };
  plugins: {
    current: number;
    limit: number | null;
  };
  workflows: {
    current: number;
    limit: number | null;
  };
  teamMembers: {
    current: number;
    limit: number | null;
  };
  departments: DepartmentUsage[];
  members: MemberUsage[];
  dailyHistory: Array<{
    date: string;
    executions: number;
  }>;
}

// ===========================================
// Main Component
// ===========================================

export function OrgUsageDashboardClient() {
  const { user, isLoading: authLoading } = useAuth();
  const { orgId, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const router = useRouter();

  const [usage, setUsage] = useState<OrgUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    if (!user || !orgId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(apiUrl(`/orgs/${orgId}/usage`), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch organization usage data");
      }

      const data = await response.json();
      setUsage(data.data);
    } catch (err) {
      console.error("Error fetching org usage:", err);
      setError("Failed to load usage data");

      // Use mock data for development/demo
      setUsage(generateMockOrgUsage(orgId));
    } finally {
      setLoading(false);
    }
  }, [user, orgId]);

  useEffect(() => {
    if (user) {
      fetchUsage();
    }
  }, [user, fetchUsage]);

  const handleUpgrade = () => {
    router.push(buildOrgUrl("/billing"));
  };

  // Loading state
  if (authLoading || orgLoading || loading) {
    return <OrgUsageDashboardSkeleton />;
  }

  // Org not found
  if (!isFound || !orgId) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-foreground">Organization not found</p>
        <p className="text-muted-foreground mt-2">The organization you're looking for doesn't exist or you don't have access.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Error state
  if (error && !usage) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchUsage}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

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
            <h1 className="text-3xl font-bold">{usage.organization.name}</h1>
            <p className="text-muted-foreground">
              Organization usage and resource allocation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchUsage}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href={buildOrgUrl("/quotas")}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Manage Quotas
            </Button>
          </Link>
        </div>
      </div>

      {/* Usage overview grid */}
      <OrgUsageOverview
        orgName={usage.organization.name}
        executions={{
          current: usage.executions.current,
          limit: usage.executions.limit,
          resetsAt: usage.executions.resetsAt
            ? new Date(usage.executions.resetsAt)
            : undefined,
        }}
        gateways={{
          current: usage.gateways.current,
          limit: usage.gateways.limit,
        }}
        plugins={{
          current: usage.plugins.current,
          limit: usage.plugins.limit,
        }}
        workflows={{
          current: usage.workflows.current,
          limit: usage.workflows.limit,
        }}
        teamMembers={{
          current: usage.teamMembers.current,
          limit: usage.teamMembers.limit,
        }}
        planName={usage.organization.plan.name}
        onUpgrade={handleUpgrade}
      />

      {/* Usage history chart */}
      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>
            Daily workflow and API executions over the last 14 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageHistoryChart
            data={usage.dailyHistory}
            limit={
              usage.executions.limit
                ? Math.round(usage.executions.limit / 30)
                : null
            }
            period="daily"
          />
        </CardContent>
      </Card>

      {/* Tabs for department and member breakdown */}
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4">
          <DeptUsageBreakdown orgId={orgId} departments={usage.departments} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MemberUsageTable members={usage.members} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================
// Skeleton Loading Component
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

      {/* Grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>

      {/* Chart skeleton */}
      <Skeleton className="h-80 rounded-lg" />

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

// ===========================================
// Mock Data Generator
// ===========================================

function generateMockOrgUsage(orgId: string): OrgUsageData {
  const resetsAt = new Date();
  resetsAt.setMonth(resetsAt.getMonth() + 1);
  resetsAt.setDate(1);

  return {
    organization: {
      id: orgId,
      name: "Acme Corp",
      plan: {
        name: "Business",
        type: "BUSINESS",
      },
    },
    executions: {
      current: 45000,
      limit: 100000,
      resetsAt: resetsAt.toISOString(),
    },
    gateways: {
      current: 8,
      limit: 20,
    },
    plugins: {
      current: 15,
      limit: null,
    },
    workflows: {
      current: 25,
      limit: null,
    },
    teamMembers: {
      current: 12,
      limit: 25,
    },
    departments: [
      {
        id: "dept-1",
        name: "Engineering",
        executions: { current: 25000, allocated: 50000 },
        members: 6,
      },
      {
        id: "dept-2",
        name: "Data Science",
        executions: { current: 15000, allocated: 30000 },
        members: 4,
      },
      {
        id: "dept-3",
        name: "Product",
        executions: { current: 5000, allocated: 20000 },
        members: 2,
      },
    ],
    members: [
      {
        id: "user-1",
        name: "Alice Chen",
        email: "alice@acme.com",
        role: "OWNER",
        departmentName: "Engineering",
        executions: { current: 8000, allocated: 10000 },
      },
      {
        id: "user-2",
        name: "Bob Smith",
        email: "bob@acme.com",
        role: "ADMIN",
        departmentName: "Engineering",
        executions: { current: 6500, allocated: 8000 },
      },
      {
        id: "user-3",
        name: "Carol Davis",
        email: "carol@acme.com",
        role: "MANAGER",
        departmentName: "Data Science",
        executions: { current: 12000, allocated: 15000 },
      },
      {
        id: "user-4",
        name: "Dan Wilson",
        email: "dan@acme.com",
        role: "MEMBER",
        departmentName: "Product",
        executions: { current: 2500, allocated: 5000 },
      },
    ],
    dailyHistory: generateMockUsageData(14, 3000),
  };
}
