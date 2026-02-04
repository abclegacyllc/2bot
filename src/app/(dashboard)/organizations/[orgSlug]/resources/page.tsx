"use client";

/**
 * Owner Resource Dashboard
 *
 * Overview of organization resource usage across all departments.
 * Shows org-wide usage, department breakdown, and quick actions.
 * Uses new hierarchical resource types (Phase 3 migration).
 *
 * Access: Organization Owner only
 *
 * @module app/(dashboard)/organizations/[orgSlug]/resources/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import {
    isOrgStatus,
    ResourceOverview,
    useResourceStatus,
} from "@/components/resources";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    Activity,
    AlertTriangle,
    Building2,
    Download,
    Loader2,
    OctagonX,
    Pause,
    Puzzle,
    Users,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Types for API responses
interface DepartmentUsage {
  id: string;
  name: string;
  memberCount: number;
  usage: {
    workflows: number;
    plugins: number;
    gateways: number;
    creditSpent: number;
  };
  limits: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxGateways: number | null;
    creditBudget: number | null;
  };
  isActive: boolean;
}

interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
}

function OwnerDashboardContent() {
  const router = useRouter();
  const { context, token } = useAuth();
  const { orgId, orgRole, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();

  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [departments, setDepartments] = useState<DepartmentUsage[]>([]);
  
  // Use new resource status hook
  const { status: resourceStatus, refresh: refreshResourceStatus } = useResourceStatus({ orgId: orgId || undefined });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isEmergencyStopping, setIsEmergencyStopping] = useState(false);
  const [stoppingDeptId, setStoppingDeptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use org-permissions hook for permission checks
  const { can, role } = useOrgPermissions();
  const isOwner = isFound && role === "ORG_OWNER";
  
  // Permission checks for specific actions
  const canEmergencyStop = role === "ORG_OWNER" || role === "ORG_ADMIN";
  const canUpdateQuotas = can("org:departments:manage_quotas");

  // Redirect if not owner or not found
  useEffect(() => {
    if (!orgLoading && (!isFound || role !== "ORG_OWNER")) {
      router.push("/");
    }
  }, [orgLoading, isFound, role, router]);

  const fetchData = useCallback(async () => {
    if (!token || !isFound || !orgId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch organization info
      const orgRes = await fetch(apiUrl(`/orgs/${orgId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!orgRes.ok) {
        throw new Error("Failed to fetch organization");
      }

      const orgData = await orgRes.json();
      setOrg(orgData.data);

      // Resource status is now fetched via useResourceStatus hook
      await refreshResourceStatus();

      // Fetch departments with usage
      const deptRes = await fetch(
        apiUrl(`/orgs/${orgId}/departments`),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (deptRes.ok) {
        const deptData = await deptRes.json();
        // Map departments to our format
        const deptUsage: DepartmentUsage[] = (deptData.data || []).map(
          (dept: {
            id: string;
            name: string;
            memberCount?: number;
            isActive?: boolean;
            quotas?: {
              maxWorkflows?: number;
              maxPlugins?: number;
              maxGateways?: number;
              creditBudget?: number;
            };
          }) => ({
            id: dept.id,
            name: dept.name,
            memberCount: dept.memberCount || 0,
            isActive: dept.isActive !== false,
            usage: {
              workflows: 0, // Will be filled when we have usage tracking
              plugins: 0,
              gateways: 0,
              creditSpent: 0,
            },
            limits: {
              maxWorkflows: dept.quotas?.maxWorkflows ?? null,
              maxPlugins: dept.quotas?.maxPlugins ?? null,
              maxGateways: dept.quotas?.maxGateways ?? null,
              creditBudget: dept.quotas?.creditBudget ?? null,
            },
          })
        );
        setDepartments(deptUsage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, isFound, orgId, refreshResourceStatus]);

  useEffect(() => {
    if (isFound && orgId) {
      fetchData();
    }
  }, [isFound, orgId, fetchData]);

  const handleExportReport = async () => {
    if (!token) return;

    setIsExporting(true);
    try {
      // Generate report data
      const reportData = {
        organization: org,
        resourceStatus,
        departments,
        generatedAt: new Date().toISOString(),
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(reportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${org?.slug || "org"}-usage-report-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleEmergencyStopAll = async () => {
    if (!token || !org) return;

    setIsEmergencyStopping(true);
    try {
      const res = await fetch(apiUrl(`/orgs/${org.id}/emergency-stop`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to emergency stop");
      }

      // Refresh data
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emergency stop failed");
    } finally {
      setIsEmergencyStopping(false);
    }
  };

  const handleEmergencyStopDept = async (deptId: string) => {
    if (!token || !orgId) return;

    setStoppingDeptId(deptId);
    try {
      const res = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}/emergency-stop`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to emergency stop department");
      }

      // Update local state
      setDepartments((prev) =>
        prev.map((dept) =>
          dept.id === deptId ? { ...dept, isActive: false } : dept
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emergency stop failed");
    } finally {
      setStoppingDeptId(null);
    }
  };

  // Helper to format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!isOwner) {
    return null;
  }

  if (orgLoading || isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-medium">Error Loading Dashboard</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button onClick={fetchData} variant="outline" className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resource Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and manage organization resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Building2 className="mr-1 h-3 w-3" />
            {org?.name}
          </Badge>
          <Badge variant="secondary">{org?.plan}</Badge>
        </div>
      </div>

      {/* Organization-wide Usage */}
      {resourceStatus && isOrgStatus(resourceStatus) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Overall Usage
            </CardTitle>
            <CardDescription>
              Current resource usage across the organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResourceOverview status={resourceStatus} />
          </CardContent>
        </Card>
      )}

      {/* Department Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Department Breakdown
          </CardTitle>
          <CardDescription>
            Resource allocation and usage by department
          </CardDescription>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 opacity-50" />
              <p className="mt-4">No departments created yet</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href={buildOrgUrl("/departments/create")}>
                  Create Department
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{dept.name}</span>
                      {!dept.isActive && (
                        <Badge variant="destructive" className="text-xs">
                          Stopped
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {dept.memberCount} members
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {dept.usage.workflows}/
                        {dept.limits.maxWorkflows ?? "∞"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Puzzle className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {dept.usage.plugins}/{dept.limits.maxPlugins ?? "∞"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {dept.usage.gateways}/
                        {dept.limits.maxGateways ?? "∞"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {canUpdateQuotas && (
                      <Button asChild variant="outline" size="sm">
                        <Link
                          href={buildOrgUrl(`/departments/${dept.id}/quotas`)}
                        >
                          Edit Allocation
                        </Link>
                      </Button>
                    )}

                    {canEmergencyStop && dept.isActive ? <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={stoppingDeptId === dept.id}
                          >
                            {stoppingDeptId === dept.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Emergency Stop Department?
                            </AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-2">
                                <p>
                                  This will immediately stop{" "}
                                  <strong>{dept.name}</strong>:
                                </p>
                                <ul className="list-inside list-disc space-y-1">
                                  <li>Disable the department</li>
                                  <li>Pause all department workflows</li>
                                  <li>Pause all employee personal workflows</li>
                                </ul>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleEmergencyStopDept(dept.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Stop Department
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={handleExportReport}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export Report
        </Button>

        {canEmergencyStop && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isEmergencyStopping}>
                {isEmergencyStopping ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <OctagonX className="mr-2 h-4 w-4" />
                )}
                Emergency Stop All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Emergency Stop Organization?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>This will immediately:</p>
                    <ul className="list-inside list-disc space-y-1">
                      <li>Disable all departments</li>
                      <li>Pause all organization workflows</li>
                      <li>Pause all employee personal workflows</li>
                    </ul>
                    <p className="font-medium text-destructive">
                      This action can be reversed, but will disrupt all operations.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEmergencyStopAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Stop All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

export default function OwnerResourceDashboard() {
  return (
    <ProtectedRoute>
      <OwnerDashboardContent />
    </ProtectedRoute>
  );
}
