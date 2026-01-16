"use client";

/**
 * Manager Resource Dashboard
 *
 * Overview of department resource usage for department managers.
 * Shows department usage and employee breakdown.
 *
 * Access: Department Manager only
 *
 * @module app/dashboard/department/resources/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ResourceOverview } from "@/components/organization/resource-overview";
import { useAuth } from "@/components/providers/auth-provider";
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
import {
    Activity,
    AlertTriangle,
    Building2,
    Loader2,
    Pause,
    Puzzle,
    User,
    Users,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Types for API responses
interface QuotaItem {
  used: number;
  limit: number | null;
  percentage: number;
  isUnlimited: boolean;
}

interface QuotaStatus {
  workflows: QuotaItem;
  plugins: QuotaItem;
  apiCalls: QuotaItem & { resetsAt: string | null };
  storage: QuotaItem;
  gateways: QuotaItem;
}

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
    apiCalls: number;
  };
  limits: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxApiCalls: number | null;
  };
  isPaused: boolean;
}

function ManagerDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { context, token } = useAuth();

  // Get department ID from query or context
  const departmentId = searchParams.get("deptId");

  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [employees, setEmployees] = useState<EmployeeUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pausingEmployee, setPausingEmployee] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user can access manager dashboard
  const canAccess = context.type === "organization";

  // Redirect if not in org context
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard");
    }
  }, [context, router]);

  const fetchData = useCallback(async () => {
    if (!token || !departmentId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch department info
      const deptRes = await fetch(`/api/departments/${departmentId}`, {
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

      // Fetch department quota status
      const quotaRes = await fetch(
        `/api/departments/${departmentId}/quotas`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        // Transform to QuotaStatus format
        const limits = quotaData.data || {};
        setQuotaStatus({
          workflows: {
            used: 0,
            limit: limits.maxWorkflows,
            percentage: 0,
            isUnlimited: limits.maxWorkflows === null || limits.maxWorkflows === -1,
          },
          plugins: {
            used: 0,
            limit: limits.maxPlugins,
            percentage: 0,
            isUnlimited: limits.maxPlugins === null || limits.maxPlugins === -1,
          },
          apiCalls: {
            used: 0,
            limit: limits.maxApiCalls,
            percentage: 0,
            isUnlimited: limits.maxApiCalls === null || limits.maxApiCalls === -1,
            resetsAt: null,
          },
          storage: {
            used: 0,
            limit: limits.maxStorage,
            percentage: 0,
            isUnlimited: limits.maxStorage === null || limits.maxStorage === -1,
          },
          gateways: {
            used: 0,
            limit: null,
            percentage: 0,
            isUnlimited: true,
          },
        });
      }

      // Fetch department members
      const membersRes = await fetch(
        `/api/departments/${departmentId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

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
              maxApiCalls?: number;
            };
          }) => ({
            id: member.user.id,
            name: member.user.name || member.user.email.split("@")[0],
            email: member.user.email,
            role: member.role,
            usage: {
              workflows: 0, // Will be filled when we have usage tracking
              plugins: 0,
              apiCalls: 0,
            },
            limits: {
              maxWorkflows: member.quotas?.maxWorkflows ?? null,
              maxPlugins: member.quotas?.maxPlugins ?? null,
              maxApiCalls: member.quotas?.maxApiCalls ?? null,
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
  }, [token, departmentId]);

  useEffect(() => {
    if (departmentId) {
      fetchData();
    }
  }, [fetchData, departmentId]);

  const handlePauseEmployee = async (userId: string) => {
    if (!token || !departmentId) return;

    setPausingEmployee(userId);
    try {
      const res = await fetch(
        `/api/departments/${departmentId}/members/${userId}/emergency-stop`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to pause employee");
      }

      // Update local state
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

  // Helper to format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (!canAccess) {
    return null;
  }

  if (!departmentId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Building2 className="h-12 w-12 text-muted-foreground opacity-50" />
          <p className="mt-4 text-lg font-medium">No Department Selected</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please select a department to view its resources.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/settings/organization/departments">
              View Departments
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
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
          <h1 className="text-2xl font-bold">Department Resources</h1>
          <p className="text-muted-foreground">
            Monitor and manage department resources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Building2 className="mr-1 h-3 w-3" />
            {department?.name}
          </Badge>
          {department && !department.isActive ? <Badge variant="destructive">Stopped</Badge> : null}
        </div>
      </div>

      {/* Department Usage */}
      {Boolean(quotaStatus) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Department Usage
            </CardTitle>
            <CardDescription>
              Current resource usage for {department?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResourceOverview quotaStatus={quotaStatus!} />
          </CardContent>
        </Card>
      )}

      {/* Employee Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employee Breakdown
          </CardTitle>
          <CardDescription>
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
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{emp.name}</span>
                        {emp.role === "MANAGER" && (
                          <Badge variant="secondary" className="text-xs">
                            Manager
                          </Badge>
                        )}
                        {emp.isPaused ? <Badge variant="destructive" className="text-xs">
                            Paused
                          </Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {emp.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {emp.usage.workflows}/
                        {emp.limits.maxWorkflows ?? "∞"}
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
                        {formatNumber(emp.usage.apiCalls)}/
                        {emp.limits.maxApiCalls
                          ? formatNumber(emp.limits.maxApiCalls)
                          : "∞"}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/dashboard/department/employees/${emp.id}/quotas?deptId=${departmentId}`}
                      >
                        Edit
                      </Link>
                    </Button>

                    {!emp.isPaused && emp.role !== "MANAGER" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={pausingEmployee === emp.id}
                          >
                            {pausingEmployee === emp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Pause Employee Workflows?
                            </AlertDialogTitle>
                            <AlertDialogDescription asChild>
                              <div className="space-y-2">
                                <p>
                                  This will immediately pause all workflows for{" "}
                                  <strong>{emp.name}</strong>:
                                </p>
                                <ul className="list-inside list-disc space-y-1">
                                  <li>Personal workflows will be paused</li>
                                  <li>
                                    They can still view but not run workflows
                                  </li>
                                </ul>
                              </div>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handlePauseEmployee(emp.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Pause
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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

export default function ManagerResourceDashboard() {
  return (
    <ProtectedRoute>
      <ManagerDashboardContent />
    </ProtectedRoute>
  );
}
