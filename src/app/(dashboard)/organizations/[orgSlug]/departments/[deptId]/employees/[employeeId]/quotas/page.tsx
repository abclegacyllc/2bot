"use client";

/**
 * Employee Quota Management Page
 *
 * Full page for editing employee quotas within a department.
 * URL: /organizations/[orgId]/departments/[deptId]/employees/[employeeId]/quotas
 *
 * Access: Department Manager or Org Admin/Owner
 *
 * @module app/(dashboard)/organizations/[orgId]/departments/[deptId]/employees/[employeeId]/quotas/page
 */

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    Loader2,
    Puzzle,
    User,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

// Types
interface EmployeeInfo {
  id: string;
  name: string;
  email: string;
  role: "MANAGER" | "MEMBER";
}

interface EmployeeUsage {
  workflows: number;
  plugins: number;
  apiCalls: number;
}

interface DepartmentLimits {
  maxWorkflows: number | null;
  maxPlugins: number | null;
  maxApiCalls: number | null;
}

interface DepartmentInfo {
  id: string;
  name: string;
}

interface QuotaFormInput {
  maxWorkflows: string;
  maxPlugins: string;
  maxApiCalls: string;
}

function formatQuotaValue(value: number | null): string {
  if (value === null || value === -1) return "";
  return value.toString();
}

function parseQuotaValue(val: string): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

export default function EmployeeQuotaPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuth();
  const { orgId, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();

  const deptId = params.deptId as string;
  const employeeId = params.employeeId as string;

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [currentUsage, setCurrentUsage] = useState<EmployeeUsage>({
    workflows: 0,
    plugins: 0,
    apiCalls: 0,
  });
  const [departmentLimits, setDepartmentLimits] = useState<DepartmentLimits>({
    maxWorkflows: null,
    maxPlugins: null,
    maxApiCalls: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { register, handleSubmit, reset, watch } = useForm<QuotaFormInput>({
    defaultValues: {
      maxWorkflows: "",
      maxPlugins: "",
      maxApiCalls: "",
    },
  });

  const watchedValues = watch();
  const canAccess = isFound && orgId;

  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/");
    }
  }, [orgLoading, isFound, router]);

  const fetchData = useCallback(async () => {
    if (!token || !deptId || !employeeId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Using URL-based routes (Phase 6.7) - /orgs/:orgId/departments/:deptId for org departments
      // Fetch department info
      const deptRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!deptRes.ok) {
        throw new Error("Failed to fetch department");
      }

      const deptData = await deptRes.json();
      setDepartment(deptData.data);

      // Fetch department quotas/limits
      const deptQuotaRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}/quotas`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deptQuotaRes.ok) {
        const deptQuotaData = await deptQuotaRes.json();
        setDepartmentLimits({
          maxWorkflows: deptQuotaData.data?.maxWorkflows ?? null,
          maxPlugins: deptQuotaData.data?.maxPlugins ?? null,
          maxApiCalls: deptQuotaData.data?.maxApiCalls ?? null,
        });
      }

      // Fetch department members to get employee info
      const membersRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}/members`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!membersRes.ok) {
        throw new Error("Failed to fetch department members");
      }

      const membersData = await membersRes.json();
      const memberInfo = (membersData.data || []).find(
        (m: { user: { id: string } }) => m.user.id === employeeId
      );

      if (!memberInfo) {
        throw new Error("Employee not found in department");
      }

      setEmployee({
        id: memberInfo.user.id,
        name: memberInfo.user.name || memberInfo.user.email.split("@")[0],
        email: memberInfo.user.email,
        role: memberInfo.role,
      });

      setCurrentUsage({
        workflows: 0,
        plugins: 0,
        apiCalls: 0,
      });

      const empLimits = memberInfo.quotas || {};
      reset({
        maxWorkflows: formatQuotaValue(empLimits.maxWorkflows ?? null),
        maxPlugins: formatQuotaValue(empLimits.maxPlugins ?? null),
        maxApiCalls: formatQuotaValue(empLimits.maxApiCalls ?? null),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, deptId, employeeId, reset]);

  useEffect(() => {
    if (deptId && employeeId) {
      fetchData();
    }
  }, [fetchData, deptId, employeeId]);

  const validateAgainstDeptLimits = (
    values: QuotaFormInput
  ): Record<string, string> => {
    const errors: Record<string, string> = {};

    const workflowVal = parseQuotaValue(values.maxWorkflows);
    const pluginVal = parseQuotaValue(values.maxPlugins);
    const apiCallVal = parseQuotaValue(values.maxApiCalls);

    if (workflowVal !== null && departmentLimits.maxWorkflows !== null) {
      if (workflowVal > departmentLimits.maxWorkflows) {
        errors.maxWorkflows = `Cannot exceed department limit (${departmentLimits.maxWorkflows})`;
      }
    }
    if (workflowVal !== null && workflowVal < currentUsage.workflows) {
      errors.maxWorkflows = `Cannot be less than current usage (${currentUsage.workflows})`;
    }

    if (pluginVal !== null && departmentLimits.maxPlugins !== null) {
      if (pluginVal > departmentLimits.maxPlugins) {
        errors.maxPlugins = `Cannot exceed department limit (${departmentLimits.maxPlugins})`;
      }
    }
    if (pluginVal !== null && pluginVal < currentUsage.plugins) {
      errors.maxPlugins = `Cannot be less than current usage (${currentUsage.plugins})`;
    }

    if (apiCallVal !== null && departmentLimits.maxApiCalls !== null) {
      if (apiCallVal > departmentLimits.maxApiCalls) {
        errors.maxApiCalls = `Cannot exceed department limit (${departmentLimits.maxApiCalls.toLocaleString()})`;
      }
    }

    return errors;
  };

  useEffect(() => {
    const errors = validateAgainstDeptLimits(watchedValues);
    setValidationErrors(errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedValues.maxWorkflows,
    watchedValues.maxPlugins,
    watchedValues.maxApiCalls,
  ]);

  const onSubmit = async (data: QuotaFormInput) => {
    if (!deptId || !employeeId || !token) return;

    const errors = validateAgainstDeptLimits(data);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const body = {
        maxWorkflows: parseQuotaValue(data.maxWorkflows),
        maxPlugins: parseQuotaValue(data.maxPlugins),
        maxApiCalls: parseQuotaValue(data.maxApiCalls),
      };

      const res = await fetch(
        apiUrl(`/orgs/${orgId}/departments/${deptId}/members/${employeeId}/quotas`),
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const resData = await res.json();
        throw new Error(resData.error?.message || "Failed to update quotas");
      }

      setSuccessMessage("Employee quotas updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quotas");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldStatus = (fieldName: keyof QuotaFormInput): "ok" | "error" => {
    if (validationErrors[fieldName]) return "error";
    return "ok";
  };

  const backUrl = buildOrgUrl(`/departments/${deptId}`);

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

  if (error && !employee) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-red-800 bg-red-900/20">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-12 w-12 text-red-400" />
            <p className="mt-4 text-lg font-medium text-foreground">Error Loading Data</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button onClick={fetchData} variant="outline" className="mt-4 border-border">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Link href={buildOrgUrl("")} className="hover:text-foreground">
          Organization
        </Link>
        <span>/</span>
        <Link href={buildOrgUrl("/departments")} className="hover:text-foreground">
          Departments
        </Link>
        <span>/</span>
        <Link href={backUrl} className="hover:text-foreground">
          {department?.name}
        </Link>
        <span>/</span>
        <span className="text-foreground">Employee Quotas</span>
      </div>

      {/* Back Button */}
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
        <Link href={backUrl}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Department
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Employee Quotas</h1>
        <p className="text-muted-foreground">
          Manage resource limits for {employee?.name}
        </p>
      </div>

      {/* Employee Info Card */}
      {employee && (
        <Card className="border-border bg-card/50">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <User className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-foreground">{employee.name}</span>
                {employee.role === "MANAGER" && (
                  <Badge variant="secondary">Manager</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{employee.email}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quota Form */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground">Resource Limits</CardTitle>
          <CardDescription className="text-muted-foreground">
            Set limits for this employee. Leave empty for unlimited (within department limits).
            {department && (
              <span className="ml-1">
                Department: <strong className="text-foreground">{department.name}</strong>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-800 bg-red-900/20 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {successMessage && (
              <div className="rounded-md border border-green-800 bg-green-900/20 p-3 text-sm text-green-400">
                {successMessage}
              </div>
            )}

            {/* Workflows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxWorkflows" className="flex items-center gap-2 text-foreground">
                  <Workflow className="h-4 w-4 text-blue-400" />
                  Max Workflows
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-border">
                    Using: {currentUsage.workflows}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.maxWorkflows ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxWorkflows"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxWorkflows")}
                className={`bg-muted border-border text-foreground ${
                  getFieldStatus("maxWorkflows") === "error" ? "border-red-500" : ""
                }`}
              />
              {validationErrors.maxWorkflows && (
                <p className="text-sm text-red-400">{validationErrors.maxWorkflows}</p>
              )}
            </div>

            {/* Plugins */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxPlugins" className="flex items-center gap-2 text-foreground">
                  <Puzzle className="h-4 w-4 text-purple-400" />
                  Max Plugins
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-border">
                    Using: {currentUsage.plugins}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.maxPlugins ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxPlugins"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxPlugins")}
                className={`bg-muted border-border text-foreground ${
                  getFieldStatus("maxPlugins") === "error" ? "border-red-500" : ""
                }`}
              />
              {validationErrors.maxPlugins && (
                <p className="text-sm text-red-400">{validationErrors.maxPlugins}</p>
              )}
            </div>

            {/* API Calls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxApiCalls" className="flex items-center gap-2 text-foreground">
                  <Activity className="h-4 w-4 text-green-400" />
                  Max API Calls (per month)
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-border">
                    Using: {currentUsage.apiCalls.toLocaleString()}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.maxApiCalls?.toLocaleString() ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxApiCalls"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxApiCalls")}
                className={`bg-muted border-border text-foreground ${
                  getFieldStatus("maxApiCalls") === "error" ? "border-red-500" : ""
                }`}
              />
              {validationErrors.maxApiCalls && (
                <p className="text-sm text-red-400">{validationErrors.maxApiCalls}</p>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(backUrl)}
                className="border-border"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || Object.keys(validationErrors).length > 0}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Quotas"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
