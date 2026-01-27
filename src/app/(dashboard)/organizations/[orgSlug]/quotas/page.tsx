"use client";

/**
 * Organization Quota Management Page
 *
 * Admin interface for managing department and member quota allocations.
 * Shows org pool usage and allows admins to allocate resources to departments.
 *
 * URL: /organizations/[orgSlug]/quotas
 *
 * @module app/(dashboard)/organizations/[orgSlug]/quotas/page
 */

import { DeptAllocationForm } from "@/components/organization/dept-allocation-form";
import { DeptAllocationTable } from "@/components/organization/dept-allocation-table";
import { QuotaUsageBar } from "@/components/organization/quota-usage-bar";
import { useAuth } from "@/components/providers/auth-provider";
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
  ArrowLeft,
  Loader2,
  PieChart,
  Plus,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ===================================
// Types
// ===================================

interface OrgInfo {
  id: string;
  name: string;
  plan: string;
}

interface QuotaAllocation {
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  aiTokenBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
}

interface UnallocatedResources {
  gateways: number | null;
  workflows: number | null;
  plugins: number | null;
  aiTokenBudget: number | null;
  ramMb: number | null;
  cpuCores: number | null;
  storageMb: number | null;
}

interface OrgAllocationSummary {
  orgLimits: QuotaAllocation;
  allocatedToDepts: QuotaAllocation;
  unallocated: UnallocatedResources;
  deptCount: number;
}

interface DeptAllocation {
  id: string;
  departmentId: string;
  departmentName: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  aiTokenBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: string;
  setByName?: string;
  updatedAt: string;
}

interface Department {
  id: string;
  name: string;
}

// ===================================
// Main Component
// ===================================

export default function QuotaManagementPage() {
  const router = useRouter();
  const { token, context, user } = useAuth();
  const { orgId, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();

  // State
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [summary, setSummary] = useState<OrgAllocationSummary | null>(null);
  const [allocations, setAllocations] = useState<DeptAllocation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDept, setEditingDept] = useState<DeptAllocation | null>(null);

  // ===================================
  // Data Fetching
  // ===================================

  const fetchData = useCallback(async () => {
    if (!token || !orgId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch org info, allocation summary, and departments in parallel
      const [orgRes, summaryRes, allocRes, deptRes] = await Promise.all([
        fetch(apiUrl(`/orgs/${orgId}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/orgs/${orgId}/quotas/summary`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/orgs/${orgId}/quotas/departments`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/orgs/${orgId}/departments`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!orgRes.ok) {
        if (orgRes.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to fetch organization");
      }

      const [orgData, summaryData, allocData, deptData] = await Promise.all([
        orgRes.json(),
        summaryRes.ok ? summaryRes.json() : { data: null },
        allocRes.ok ? allocRes.json() : { data: [] },
        deptRes.ok ? deptRes.json() : { data: [] },
      ]);

      setOrg(orgData.data);
      setSummary(summaryData.data);
      setAllocations(allocData.data || []);
      setDepartments(deptData.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    if (isFound && orgId) {
      fetchData();
    }
  }, [isFound, orgId, fetchData]);

  // ===================================
  // Handlers
  // ===================================

  const handleAllocationSaved = () => {
    setShowAddForm(false);
    setEditingDept(null);
    fetchData();
  };

  const handleDelete = async (departmentId: string) => {
    if (!token) return;

    try {
      const res = await fetch(
        apiUrl(`/orgs/${orgId}/quotas/departments/${departmentId}`),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error("Failed to remove allocation");
      }

      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  // ===================================
  // Render
  // ===================================

  // Show loading while resolving org
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show not found if org doesn't exist
  if (!isFound || !orgId) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium text-foreground">Organization not found</p>
              <p className="mt-2">The organization you're looking for doesn't exist or you don't have access.</p>
              <Button className="mt-4" asChild>
                <Link href="/">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>{error}</p>
              <Button className="mt-4" onClick={() => fetchData()}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get departments without allocations
  const allocatedDeptIds = new Set(allocations.map((a) => a.departmentId));
  const unallocatedDepts = departments.filter(
    (d) => !allocatedDeptIds.has(d.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={buildOrgUrl("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6" />
              Quota Management
            </h1>
            <p className="text-muted-foreground">
              {org?.name} · <Badge variant="outline">{org?.plan}</Badge>
            </p>
          </div>
        </div>
        {unallocatedDepts.length > 0 && !showAddForm && !editingDept && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Allocate to Department
          </Button>
        )}
      </div>

      {/* Organization Pool Usage */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Organization Pool Usage
            </CardTitle>
            <CardDescription>
              Resources from your {org?.plan} plan allocated to departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <QuotaUsageBar
                label="Gateways"
                used={summary.allocatedToDepts.maxGateways ?? 0}
                limit={summary.orgLimits.maxGateways}
                remaining={summary.unallocated.gateways}
              />
              <QuotaUsageBar
                label="Workflows"
                used={summary.allocatedToDepts.maxWorkflows ?? 0}
                limit={summary.orgLimits.maxWorkflows}
                remaining={summary.unallocated.workflows}
              />
              <QuotaUsageBar
                label="Plugins"
                used={summary.allocatedToDepts.maxPlugins ?? 0}
                limit={summary.orgLimits.maxPlugins}
                remaining={summary.unallocated.plugins}
              />
              <QuotaUsageBar
                label="AI Tokens"
                used={summary.allocatedToDepts.aiTokenBudget ?? 0}
                limit={summary.orgLimits.aiTokenBudget}
                remaining={summary.unallocated.aiTokenBudget}
                formatValue={(v) =>
                  v >= 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                    ? `${(v / 1000).toFixed(0)}K`
                    : v.toString()
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingDept) && summary && (
        <DeptAllocationForm
          orgId={orgId}
          token={token!}
          departments={editingDept ? [] : unallocatedDepts}
          existingAllocation={editingDept}
          orgLimits={summary.orgLimits}
          unallocated={summary.unallocated}
          onSaved={handleAllocationSaved}
          onCancel={() => {
            setShowAddForm(false);
            setEditingDept(null);
          }}
        />
      )}

      {/* Department Allocations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Department Allocations</CardTitle>
          <CardDescription>
            {allocations.length} of {departments.length} departments have
            specific allocations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <PieChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No department allocations yet</p>
              <p className="text-sm mt-1">
                Departments use the organization pool by default
              </p>
              {unallocatedDepts.length > 0 && (
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Allocation
                </Button>
              )}
            </div>
          ) : (
            <DeptAllocationTable
              allocations={allocations}
              onEdit={setEditingDept}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
