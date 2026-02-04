"use client";

/**
 * Department Detail Page
 *
 * Shows department resources overview and employee breakdown.
 * URL: /organizations/[orgId]/departments/[deptId]
 *
 * Access: Department Manager or Org Admin/Owner
 *
 * @module app/(dashboard)/organizations/[orgId]/departments/[deptId]/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import {
    DeptResourceView,
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
    ArrowLeft,
    Building2,
    Loader2,
    Pause,
    Puzzle,
    Settings,
    User,
    Users,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Types for API responses
interface DepartmentInfo {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isActive: boolean;
}

interface EmployeeUsage {
  id: string;
  name: string;
  email: string;
  role: "MANAGER" | "MEMBER";
  usage: {
    workflows: number;
    plugins: number;
    gateways: number;
  };
  limits: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxGateways: number | null;
  };
  isPaused: boolean;
}

export default function DepartmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuth();
  const { orgId, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const { can, role } = useOrgPermissions();

  const deptId = params.deptId as string;

  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [employees, setEmployees] = useState<EmployeeUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pausingEmployee, setPausingEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Permission checks
  const canUpdateDepartment = can("org:departments:update");
  const canUpdateQuotas = can("org:departments:manage_quotas");
  const canEmergencyStop = role === "ORG_OWNER" || role === "ORG_ADMIN";

  // Check if user can access manager dashboard
  const canAccess = isFound && orgId;

  // Redirect if not in org context
  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/");
    }
  }, [orgLoading, isFound, router]);

  const fetchData = useCallback(async () => {
    if (!token || !deptId || !orgId) return;

    setIsLoading(true)
    setError(null);

    try {
      // Using URL-based routes (Phase 6.7) - /orgs/:orgId/departments/:deptId for org departments
      // Fetch department info
      const deptRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!deptRes.ok) {
        if (deptRes.status === 404) {
          throw new Error("Department not found");
        }
        if (deptRes.status === 403) {
          throw new Error("You don't have access to this department");
        }
        throw new Error("Failed to fetch department");
      }

      const deptData = await deptRes.json();
      setDepartment(deptData.data);

      // Resource status is fetched via DeptResourceView component

      // Fetch department members
      const membersRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}/members`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const employeeUsage: EmployeeUsage[] = (membersData.data || []).map(
          (member: {
            id: string;
            role: "MANAGER" | "MEMBER";
            user: { id: string; name: string | null; email: string };
            quotas?: {
              maxWorkflows?: number;
              maxPlugins?: number;
              maxGateways?: number;
            };
          }) => ({
            id: member.user.id,
            name: member.user.name || member.user.email.split("@")[0],
            email: member.user.email,
            role: member.role,
            usage: {
              workflows: 0,
              plugins: 0,
              gateways: 0,
            },
            limits: {
              maxWorkflows: member.quotas?.maxWorkflows ?? null,
              maxPlugins: member.quotas?.maxPlugins ?? null,
              maxGateways: member.quotas?.maxGateways ?? null,
            },
            isPaused: false,
          })
        );
        setEmployees(employeeUsage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, deptId, orgId]);

  useEffect(() => {
    if (deptId) {
      fetchData();
    }
  }, [fetchData, deptId]);

  const handlePauseEmployee = async (userId: string) => {
    if (!token || !deptId) return;

    setPausingEmployee(userId);
    try {
      const res = await fetch(
        apiUrl(`/orgs/${orgId}/departments/${deptId}/members/${userId}/emergency-stop`),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to pause employee");
      }

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === userId ? { ...emp, isPaused: true } : emp
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause employee");
    } finally {
      setPausingEmployee(null);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!canAccess) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-red-800 bg-red-900/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <CardTitle className="text-red-400">Error</CardTitle>
            </div>
            <CardDescription className="text-red-300">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={fetchData} variant="outline" className="border-border">
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(buildOrgUrl("/departments"))}
              className="border-border"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Departments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Link href={buildOrgUrl("")} className="hover:text-foreground">
              Organization
            </Link>
            <span>/</span>
            <Link href={buildOrgUrl("/departments")} className="hover:text-foreground">
              Departments
            </Link>
            <span>/</span>
            <span className="text-foreground">{department?.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Department Resources</h1>
          <p className="text-muted-foreground">
            Monitor and manage department resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm border-border">
            <Building2 className="mr-1 h-3 w-3" />
            {department?.name}
          </Badge>
          {department && !department.isActive && (
            <Badge variant="destructive">Stopped</Badge>
          )}
          {canUpdateDepartment && (
            <Link href={buildOrgUrl(`/departments/${deptId}/quotas`)}>
              <Button variant="outline" size="sm" className="border-border">
                <Settings className="mr-1 h-4 w-4" />
                Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Department Usage */}
      {orgId && deptId && (
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Department Usage
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Current resource usage for {department?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeptResourceView orgId={orgId} deptId={deptId} />
          </CardContent>
        </Card>
      )}

      {/* Employee Breakdown */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employee Breakdown
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Resource usage by team member
          </CardDescription>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 opacity-50" />
              <p className="mt-4">No employees in this department</p>
            </div>
          ) : (
            <div className="space-y-4">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <User className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{emp.name}</span>
                        {emp.role === "MANAGER" && (
                          <Badge variant="secondary" className="text-xs">
                            Manager
                          </Badge>
                        )}
                        {emp.isPaused && (
                          <Badge variant="destructive" className="text-xs">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{emp.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-foreground">
                    <div className="flex items-center gap-1">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {emp.usage.workflows}/{emp.limits.maxWorkflows ?? "∞"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Puzzle className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {emp.usage.plugins}/{emp.limits.maxPlugins ?? "∞"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {emp.usage.gateways}/{emp.limits.maxGateways ?? "∞"}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {canUpdateQuotas && (
                        <Button asChild variant="outline" size="sm" className="border-border">
                          <Link
                            href={buildOrgUrl(`/departments/${deptId}/employees/${emp.id}/quotas`)}
                          >
                            Edit
                          </Link>
                        </Button>
                      )}

                      {canEmergencyStop && !emp.isPaused && emp.role !== "MANAGER" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              disabled={pausingEmployee === emp.id}
                            >
                              {pausingEmployee === emp.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-foreground">
                                Pause Employee Workflows?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-muted-foreground">
                                <div className="space-y-2">
                                  <p>
                                    This will immediately pause all workflows for{" "}
                                    <strong className="text-foreground">{emp.name}</strong>:
                                  </p>
                                  <ul className="list-inside list-disc space-y-1">
                                    <li>Personal workflows will be paused</li>
                                    <li>They can still view but not run workflows</li>
                                  </ul>
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-border">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handlePauseEmployee(emp.id)}
                                className="bg-red-600 text-foreground hover:bg-red-700"
                              >
                                Pause
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
