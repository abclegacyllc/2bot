"use client";

/**
 * Employee Allocation Management Page
 *
 * Full page for editing employee allocations within a department.
 * URL: /organizations/[orgId]/departments/[deptId]/employees/[employeeId]/quotas
 *
 * Access: Department Manager or Org Admin/Owner
 *
 * @module app/(dashboard)/organizations/[orgId]/departments/[deptId]/employees/[employeeId]/quotas/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { MemberResourceView } from "@/components/resources";
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
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertCircle,
    ArrowLeft,
    Bot,
    Cpu,
    GitBranch,
    HardDrive,
    Loader2,
    MemoryStick,
    Server,
    User,
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

interface DepartmentLimits {
  maxGateways: number | null;
  maxWorkflows: number | null;
  creditBudget: number | null;
  ramMb: number | null;
  cpuCores: number | null;
  storageMb: number | null;
}

interface DepartmentInfo {
  id: string;
  name: string;
}

interface AllocationFormInput {
  maxGateways: string;
  maxWorkflows: string;
  creditBudget: string;
  ramMb: string;
  cpuCores: string;
  storageMb: string;
}

function formatAllocationValue(value: number | null): string {
  if (value === null || value === -1) return "";
  return value.toString();
}

function parseAllocationValue(val: string): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

export default function EmployeeAllocationPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuth();
  const { orgId, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const { can } = useOrgPermissions();

  const deptId = params.deptId as string;
  const employeeId = params.employeeId as string;

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [departmentLimits, setDepartmentLimits] = useState<DepartmentLimits>({
    maxGateways: null,
    maxWorkflows: null,
    creditBudget: null,
    ramMb: null,
    cpuCores: null,
    storageMb: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { register, handleSubmit, reset, watch } = useForm<AllocationFormInput>({
    defaultValues: {
      maxGateways: "",
      maxWorkflows: "",
      creditBudget: "",
      ramMb: "",
      cpuCores: "",
      storageMb: "",
    },
  });

  const watchedValues = watch();
  const canAccess = isFound && orgId;
  
  // Permission check - only those who can manage allocations should access this page
  const canUpdateAllocations = can("org:departments:manage_quotas");

  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/");
    }
  }, [orgLoading, isFound, router]);

  // Redirect if user doesn't have permission to update allocations
  useEffect(() => {
    if (!orgLoading && isFound && !canUpdateAllocations) {
      router.push(buildOrgUrl(`/departments/${deptId}`));
    }
  }, [orgLoading, isFound, canUpdateAllocations, router, buildOrgUrl, deptId]);

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

      // Fetch department allocation/limits
      const deptAllocRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${deptId}/allocations`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (deptAllocRes.ok) {
        const deptAllocData = await deptAllocRes.json();
        setDepartmentLimits({
          maxGateways: deptAllocData.data?.maxGateways ?? null,
          maxWorkflows: deptAllocData.data?.maxWorkflows ?? null,
          creditBudget: deptAllocData.data?.creditBudget ?? null,
          ramMb: deptAllocData.data?.ramMb ?? null,
          cpuCores: deptAllocData.data?.cpuCores ?? null,
          storageMb: deptAllocData.data?.storageMb ?? null,
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

      const empLimits = memberInfo.allocation || memberInfo.quotas || {};
      reset({
        maxGateways: formatAllocationValue(empLimits.maxGateways ?? null),
        maxWorkflows: formatAllocationValue(empLimits.maxWorkflows ?? null),
        creditBudget: formatAllocationValue(empLimits.creditBudget ?? null),
        ramMb: formatAllocationValue(empLimits.ramMb ?? null),
        cpuCores: formatAllocationValue(empLimits.cpuCores ?? null),
        storageMb: formatAllocationValue(empLimits.storageMb ?? null),
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
    values: AllocationFormInput
  ): Record<string, string> => {
    const errors: Record<string, string> = {};

    const gatewayVal = parseAllocationValue(values.maxGateways);
    const workflowVal = parseAllocationValue(values.maxWorkflows);
    const creditVal = parseAllocationValue(values.creditBudget);
    const ramVal = parseAllocationValue(values.ramMb);
    const cpuVal = parseAllocationValue(values.cpuCores);
    const storageVal = parseAllocationValue(values.storageMb);

    if (gatewayVal !== null && departmentLimits.maxGateways !== null) {
      if (gatewayVal > departmentLimits.maxGateways) {
        errors.maxGateways = `Cannot exceed department limit (${departmentLimits.maxGateways})`;
      }
    }

    if (workflowVal !== null && departmentLimits.maxWorkflows !== null) {
      if (workflowVal > departmentLimits.maxWorkflows) {
        errors.maxWorkflows = `Cannot exceed department limit (${departmentLimits.maxWorkflows})`;
      }
    }

    if (creditVal !== null && departmentLimits.creditBudget !== null) {
      if (creditVal > departmentLimits.creditBudget) {
        errors.creditBudget = `Cannot exceed department budget (${departmentLimits.creditBudget})`;
      }
    }

    if (ramVal !== null && departmentLimits.ramMb !== null) {
      if (ramVal > departmentLimits.ramMb) {
        errors.ramMb = `Cannot exceed department limit (${departmentLimits.ramMb} MB)`;
      }
    }

    if (cpuVal !== null && departmentLimits.cpuCores !== null) {
      if (cpuVal > departmentLimits.cpuCores) {
        errors.cpuCores = `Cannot exceed department limit (${departmentLimits.cpuCores} cores)`;
      }
    }

    if (storageVal !== null && departmentLimits.storageMb !== null) {
      if (storageVal > departmentLimits.storageMb) {
        errors.storageMb = `Cannot exceed department limit (${departmentLimits.storageMb} MB)`;
      }
    }

    return errors;
  };

  useEffect(() => {
    const errors = validateAgainstDeptLimits(watchedValues);
    setValidationErrors(errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedValues.maxGateways,
    watchedValues.maxWorkflows,
    watchedValues.creditBudget,
    watchedValues.ramMb,
    watchedValues.cpuCores,
    watchedValues.storageMb,
  ]);

  const onSubmit = async (data: AllocationFormInput) => {
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
        maxGateways: parseAllocationValue(data.maxGateways),
        maxWorkflows: parseAllocationValue(data.maxWorkflows),
        creditBudget: parseAllocationValue(data.creditBudget),
        ramMb: parseAllocationValue(data.ramMb),
        cpuCores: parseAllocationValue(data.cpuCores),
        storageMb: parseAllocationValue(data.storageMb),
      };

      const res = await fetch(
        apiUrl(`/orgs/${orgId}/departments/${deptId}/members/${employeeId}/allocations`),
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
        throw new Error(resData.error?.message || "Failed to update allocation");
      }

      setSuccessMessage("Employee allocation updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save allocation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFieldStatus = (fieldName: string): "ok" | "error" => {
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
        <span className="text-foreground">Employee Allocation</span>
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
        <h1 className="text-2xl font-bold text-foreground">Employee Allocation</h1>
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

      {/* Current Status - Shows member's current allocation and usage */}
      {orgId && deptId && employeeId && (
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Server className="h-5 w-5 text-purple-400" />
              Current Status
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Current allocation and usage for this member
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemberResourceView
              orgId={orgId}
              deptId={deptId}
              memberId={employeeId}
              compact
            />
          </CardContent>
        </Card>
      )}

      {/* Automation Allocation */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Server className="h-5 w-5 text-purple-400" />
            Automation Allocation
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Set automation limits. Leave empty to inherit from department.
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

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Gateways */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="maxGateways" className="flex items-center gap-2 text-foreground">
                    <Server className="h-4 w-4 text-blue-400" />
                    Max Gateways
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.maxGateways ?? "∞"}
                  </Badge>
                </div>
                <Input
                  id="maxGateways"
                  type="number"
                  min={0}
                  placeholder="Inherit"
                  {...register("maxGateways")}
                  className={`bg-muted border-border text-foreground ${
                    getFieldStatus("maxGateways") === "error" ? "border-red-500" : ""
                  }`}
                />
                {validationErrors.maxGateways && (
                  <p className="text-sm text-red-400">{validationErrors.maxGateways}</p>
                )}
              </div>

              {/* Workflows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="maxWorkflows" className="flex items-center gap-2 text-foreground">
                    <GitBranch className="h-4 w-4 text-purple-400" />
                    Max Workflows
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.maxWorkflows ?? "∞"}
                  </Badge>
                </div>
                <Input
                  id="maxWorkflows"
                  type="number"
                  min={0}
                  placeholder="Inherit"
                  {...register("maxWorkflows")}
                  className={`bg-muted border-border text-foreground ${
                    getFieldStatus("maxWorkflows") === "error" ? "border-red-500" : ""
                  }`}
                />
                {validationErrors.maxWorkflows && (
                  <p className="text-sm text-red-400">{validationErrors.maxWorkflows}</p>
                )}
              </div>
            </div>

            {/* Budget Allocation */}
            <div className="border-t pt-6">
              <h4 className="text-sm font-medium mb-4 flex items-center gap-2 text-foreground">
                <Bot className="h-4 w-4 text-yellow-400" />
                Budget Allocation
              </h4>
              <div className="space-y-2 max-w-md">
                <div className="flex items-center justify-between">
                  <Label htmlFor="creditBudget" className="text-foreground">
                    Monthly Credit Budget
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    Dept: {departmentLimits.creditBudget ?? "∞"}
                  </Badge>
                </div>
                <Input
                  id="creditBudget"
                  type="number"
                  min={0}
                  placeholder="Inherit from department"
                  {...register("creditBudget")}
                  className={`bg-muted border-border text-foreground ${
                    getFieldStatus("creditBudget") === "error" ? "border-red-500" : ""
                  }`}
                />
                {validationErrors.creditBudget && (
                  <p className="text-sm text-red-400">{validationErrors.creditBudget}</p>
                )}
              </div>
            </div>

            {/* Workspace Allocation */}
            <div className="border-t pt-6">
              <h4 className="text-sm font-medium mb-4 flex items-center gap-2 text-foreground">
                <Cpu className="h-4 w-4 text-orange-400" />
                Workspace Allocation
              </h4>
              <div className="grid gap-6 sm:grid-cols-3">
                {/* RAM */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ramMb" className="flex items-center gap-2 text-foreground">
                      <MemoryStick className="h-4 w-4 text-cyan-400" />
                      RAM (MB)
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      Dept: {departmentLimits.ramMb ?? "∞"}
                    </Badge>
                  </div>
                  <Input
                    id="ramMb"
                    type="number"
                    min={0}
                    placeholder="Inherit"
                    {...register("ramMb")}
                    className={`bg-muted border-border text-foreground ${
                      getFieldStatus("ramMb") === "error" ? "border-red-500" : ""
                    }`}
                  />
                  {validationErrors.ramMb && (
                    <p className="text-sm text-red-400">{validationErrors.ramMb}</p>
                  )}
                </div>

                {/* CPU */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="cpuCores" className="flex items-center gap-2 text-foreground">
                      <Cpu className="h-4 w-4 text-orange-400" />
                      CPU (cores)
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      Dept: {departmentLimits.cpuCores ?? "∞"}
                    </Badge>
                  </div>
                  <Input
                    id="cpuCores"
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="Inherit"
                    {...register("cpuCores")}
                    className={`bg-muted border-border text-foreground ${
                      getFieldStatus("cpuCores") === "error" ? "border-red-500" : ""
                    }`}
                  />
                  {validationErrors.cpuCores && (
                    <p className="text-sm text-red-400">{validationErrors.cpuCores}</p>
                  )}
                </div>

                {/* Storage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="storageMb" className="flex items-center gap-2 text-foreground">
                      <HardDrive className="h-4 w-4 text-pink-400" />
                      Storage (MB)
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      Dept: {departmentLimits.storageMb ?? "∞"}
                    </Badge>
                  </div>
                  <Input
                    id="storageMb"
                    type="number"
                    min={0}
                    placeholder="Inherit"
                    {...register("storageMb")}
                    className={`bg-muted border-border text-foreground ${
                      getFieldStatus("storageMb") === "error" ? "border-red-500" : ""
                    }`}
                  />
                  {validationErrors.storageMb && (
                    <p className="text-sm text-red-400">{validationErrors.storageMb}</p>
                  )}
                </div>
              </div>
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
                  "Save Allocation"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
