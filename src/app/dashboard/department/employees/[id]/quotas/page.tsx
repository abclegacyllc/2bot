"use client";

/**
 * Employee Quota Management Page
 *
 * Full page for editing employee quotas.
 * Provides a detailed view with validation against department limits.
 *
 * Access: Department Manager or Org Admin/Owner
 *
 * @module app/dashboard/department/employees/[id]/quotas/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
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
import { useParams, useRouter, useSearchParams } from "next/navigation";
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

// Form input type
interface QuotaFormInput {
  maxWorkflows: string;
  maxPlugins: string;
  maxApiCalls: string;
}

// Helper functions
function formatQuotaValue(value: number | null): string {
  if (value === null || value === -1) return "";
  return value.toString();
}

function parseQuotaValue(val: string): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function EmployeeQuotaPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { context, token } = useAuth();

  const employeeId = params.id as string;
  const departmentId = searchParams.get("deptId");

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

  // Watch values for validation
  const watchedValues = watch();

  // Check if user can access
  const canAccess = context.type === "organization";

  // Redirect if not in org context
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard");
    }
  }, [context, router]);

  const fetchData = useCallback(async () => {
    if (!token || !departmentId || !employeeId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch department info
      const deptRes = await fetch(`/api/departments/${departmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!deptRes.ok) {
        throw new Error("Failed to fetch department");
      }

      const deptData = await deptRes.json();
      setDepartment(deptData.data);

      // Fetch department quotas/limits
      const deptQuotaRes = await fetch(
        `/api/departments/${departmentId}/quotas`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (deptQuotaRes.ok) {
        const deptQuotaData = await deptQuotaRes.json();
        setDepartmentLimits({
          maxWorkflows: deptQuotaData.data?.maxWorkflows ?? null,
          maxPlugins: deptQuotaData.data?.maxPlugins ?? null,
          maxApiCalls: deptQuotaData.data?.maxApiCalls ?? null,
        });
      }

      // Fetch department members to get employee info
      const membersRes = await fetch(
        `/api/departments/${departmentId}/members`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

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

      // Set current usage (from tracking - placeholder for now)
      const empLimits = memberInfo.quotas || {};
      setCurrentUsage({
        workflows: 0,
        plugins: 0,
        apiCalls: 0,
      });

      // Reset form with current limits
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
  }, [token, departmentId, employeeId, reset]);

  useEffect(() => {
    if (departmentId && employeeId) {
      fetchData();
    }
  }, [fetchData, departmentId, employeeId]);

  // Validate against department limits
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

  // Update validation errors when values change
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
    if (!departmentId || !employeeId || !token) return;

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
        `/api/departments/${departmentId}/members/${employeeId}/quotas`,
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

  const getFieldStatus = (
    fieldName: keyof QuotaFormInput
  ): "ok" | "error" => {
    if (validationErrors[fieldName]) return "error";
    return "ok";
  };

  if (!canAccess) {
    return null;
  }

  if (!departmentId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground opacity-50" />
          <p className="mt-4 text-lg font-medium">Missing Department</p>
          <p className="mt-2 text-sm text-muted-foreground">
            No department ID provided.
          </p>
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

  if (error && !employee) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-medium">Error Loading Data</p>
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
      {/* Back Button */}
      <Button asChild variant="ghost" size="sm">
        <Link href={`/dashboard/department/resources?deptId=${departmentId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Department
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Employee Quotas</h1>
        <p className="text-muted-foreground">
          Manage resource limits for {employee?.name}
        </p>
      </div>

      {/* Employee Info Card */}
      {Boolean(employee) && (
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <User className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium">{employee!.name}</span>
                {employee!.role === "MANAGER" && (
                  <Badge variant="secondary">Manager</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{employee!.email}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quota Form */}
      <Card>
        <CardHeader>
          <CardTitle>Resource Limits</CardTitle>
          <CardDescription>
            Set limits for this employee. Leave empty for unlimited (within
            department limits).
            {Boolean(department) && (
              <span className="ml-1">
                Department: <strong>{department!.name}</strong>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Messages */}
            {Boolean(error) && (
              <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {Boolean(successMessage) && (
              <div className="rounded-md border border-green-500 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                {successMessage}
              </div>
            )}

            {/* Workflows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="maxWorkflows"
                  className="flex items-center gap-2"
                >
                  <Workflow className="h-4 w-4 text-blue-500" />
                  Max Workflows
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Using: {currentUsage.workflows}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept:{" "}
                    {departmentLimits.maxWorkflows ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxWorkflows"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxWorkflows")}
                className={
                  getFieldStatus("maxWorkflows") === "error"
                    ? "border-destructive"
                    : ""
                }
              />
              {Boolean(validationErrors.maxWorkflows) && (
                <p className="text-sm text-destructive">
                  {validationErrors.maxWorkflows}
                </p>
              )}
            </div>

            {/* Plugins */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="maxPlugins"
                  className="flex items-center gap-2"
                >
                  <Puzzle className="h-4 w-4 text-purple-500" />
                  Max Plugins
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Using: {currentUsage.plugins}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept:{" "}
                    {departmentLimits.maxPlugins ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxPlugins"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxPlugins")}
                className={
                  getFieldStatus("maxPlugins") === "error"
                    ? "border-destructive"
                    : ""
                }
              />
              {Boolean(validationErrors.maxPlugins) && (
                <p className="text-sm text-destructive">
                  {validationErrors.maxPlugins}
                </p>
              )}
            </div>

            {/* API Calls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="maxApiCalls"
                  className="flex items-center gap-2"
                >
                  <Activity className="h-4 w-4 text-green-500" />
                  Max API Calls (per month)
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Using: {currentUsage.apiCalls.toLocaleString()}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    Dept:{" "}
                    {departmentLimits.maxApiCalls?.toLocaleString() ?? "∞"}
                  </Badge>
                </div>
              </div>
              <Input
                id="maxApiCalls"
                type="number"
                min={0}
                placeholder="Unlimited"
                {...register("maxApiCalls")}
                className={
                  getFieldStatus("maxApiCalls") === "error"
                    ? "border-destructive"
                    : ""
                }
              />
              {Boolean(validationErrors.maxApiCalls) && (
                <p className="text-sm text-destructive">
                  {validationErrors.maxApiCalls}
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(
                    `/dashboard/department/resources?deptId=${departmentId}`
                  )
                }
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting || Object.keys(validationErrors).length > 0
                }
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

export default function EmployeeQuotaPage() {
  return (
    <ProtectedRoute>
      <EmployeeQuotaPageContent />
    </ProtectedRoute>
  );
}
