"use client";

/**
 * Department Allocation Management Page
 *
 * Page for editing individual department resource allocations.
 * Accessed from the Owner dashboard.
 * Note: URL kept as 'quotas' for backward compatibility, internally uses allocations
 *
 * @module app/(dashboard)/organizations/[orgSlug]/departments/[deptId]/quotas/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { DeptResourceView } from "@/components/resources";
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
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ArrowLeft,
    Bot,
    Cpu,
    Database,
    GitBranch,
    HardDrive,
    Loader2,
    MemoryStick,
    Save,
    Server,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

// Form input type (string-based for form fields)
interface AllocationFormInput {
  maxGateways: string;
  maxPlugins: string;
  maxWorkflows: string;
  creditBudget: string;
  ramMb: string;
  cpuCores: string;
  storageMb: string;
}

// Helper to parse string to number or null
function parseAllocationValue(val: string): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

// Helper to format number/null to string for form
function formatAllocationValue(val: number | null): string {
  return val === null ? "" : val.toString();
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isActive: boolean;
}

interface OrgLimits {
  maxGateways: number | null;
  maxPlugins: number | null;
  maxWorkflows: number | null;
  creditBudget: number | null;
  ramMb: number | null;
  cpuCores: number | null;
  storageMb: number | null;
}

function DeptAllocationContent() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const { orgId, orgRole, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();

  const departmentId = params.deptId as string;

  const [department, setDepartment] = useState<Department | null>(null);
  const [orgLimits, setOrgLimits] = useState<OrgLimits>({
    maxGateways: null,
    maxPlugins: null,
    maxWorkflows: null,
    creditBudget: null,
    ramMb: null,
    cpuCores: null,
    storageMb: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Use org-permissions hook for permission checks
  const { can } = useOrgPermissions();
  const isOwnerOrAdmin = can('org:departments:manage_quotas');

  // Redirect if not authorized
  useEffect(() => {
    if (!orgLoading && !isFound) {
      router.push("/");
    } else if (!orgLoading && isFound && !isOwnerOrAdmin) {
      router.push("/");
    }
  }, [orgLoading, isFound, isOwnerOrAdmin, router]);

  const form = useForm<AllocationFormInput>({
    defaultValues: {
      maxGateways: "",
      maxPlugins: "",
      maxWorkflows: "",
      creditBudget: "",
      ramMb: "",
      cpuCores: "",
      storageMb: "",
    },
  });

  const fetchData = useCallback(async () => {
    if (!token || !departmentId || !orgId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch department details - use org-scoped endpoint
      const deptRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${departmentId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!deptRes.ok) {
        if (deptRes.status === 404) {
          throw new Error("Department not found");
        }
        throw new Error("Failed to fetch department");
      }

      const deptData = await deptRes.json();
      setDepartment(deptData.data);

      // Fetch department allocation - use org-scoped endpoint
      const allocationRes = await fetch(apiUrl(`/orgs/${orgId}/departments/${departmentId}/allocations`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (allocationRes.ok) {
        const allocationData = await allocationRes.json();
        const allocation = allocationData.data || {};
        form.reset({
          maxGateways: formatAllocationValue(allocation.maxGateways),
          maxPlugins: formatAllocationValue(allocation.maxPlugins),
          maxWorkflows: formatAllocationValue(allocation.maxWorkflows),
          creditBudget: formatAllocationValue(allocation.creditBudget),
          ramMb: formatAllocationValue(allocation.ramMb),
          cpuCores: formatAllocationValue(allocation.cpuCores),
          storageMb: formatAllocationValue(allocation.storageMb),
        });
      }

      // Fetch org limits - use org-scoped endpoint
      const orgLimitsRes = await fetch(apiUrl(`/orgs/${orgId}/quota`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (orgLimitsRes.ok) {
        const limitsData = await orgLimitsRes.json();
        // Map status response to OrgLimits format
        const statusData = limitsData.data || {};
        setOrgLimits({
          maxGateways: statusData.gateways?.limit ?? statusData.automation?.gateways?.count?.limit ?? null,
          maxPlugins: statusData.plugins?.limit ?? statusData.automation?.plugins?.count?.limit ?? null,
          maxWorkflows: statusData.workflows?.limit ?? statusData.automation?.workflows?.count?.limit ?? null,
          creditBudget: statusData.credits?.limit ?? statusData.billing?.credits?.monthlyBudget ?? null,
          ramMb: statusData.workspace?.compute?.ram?.limit ?? null,
          cpuCores: statusData.workspace?.compute?.cpu?.limit ?? null,
          storageMb: statusData.workspace?.storage?.allocation?.limit ?? null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, departmentId, orgId, form]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (data: AllocationFormInput) => {
    if (!departmentId || !orgId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Convert string values to numbers - use API field names
      const allocationBody = {
        maxGateways: parseAllocationValue(data.maxGateways),
        maxPlugins: parseAllocationValue(data.maxPlugins),
        maxWorkflows: parseAllocationValue(data.maxWorkflows),
        creditBudget: parseAllocationValue(data.creditBudget),
        ramMb: parseAllocationValue(data.ramMb),
        cpuCores: parseAllocationValue(data.cpuCores),
        storageMb: parseAllocationValue(data.storageMb),
      };

      const res = await fetch(apiUrl(`/orgs/${orgId}/departments/${departmentId}/allocations`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(allocationBody),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to save allocation");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save allocation");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to format limit display
  const formatLimit = (limit: number | null): string => {
    if (limit === null || limit === -1) return "Unlimited";
    return limit.toLocaleString();
  };

  if (!isOwnerOrAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !department) {
    return (
      <Card className="border-destructive">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <p className="mt-4 text-lg font-medium">Error Loading Department</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href={buildOrgUrl("/resources")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Resources
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href={buildOrgUrl("/resources")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{department?.name} Allocation</h1>
          <p className="text-muted-foreground">
            Configure resource limits for this department
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <Users className="mr-1 h-3 w-3" />
            {department?.memberCount ?? 0} members
          </Badge>
          {department && !department.isActive ? <Badge variant="destructive">Stopped</Badge> : null}
        </div>
      </div>

      {/* Current Status - Shows what's allocated and used */}
      {orgId && departmentId && (
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-purple-400" />
              Current Status
            </CardTitle>
            <CardDescription>
              Current allocation and usage for this department
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeptResourceView
              orgId={orgId}
              deptId={departmentId}
              compact
            />
          </CardContent>
        </Card>
      )}

      {/* Automation Allocation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-purple-400" />
            Automation Allocation
          </CardTitle>
          <CardDescription>
            Set automation resource limits. Leave empty to inherit from organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="maxGateways"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-400" />
                        Max Gateways
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Org pool: {formatLimit(orgLimits.maxGateways)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxPlugins"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-green-400" />
                        Max Plugins
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Org pool: {formatLimit(orgLimits.maxPlugins)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxWorkflows"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-purple-400" />
                        Max Workflows
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Org pool: {formatLimit(orgLimits.maxWorkflows)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Budget Allocation */}
              <div className="border-t pt-6">
                <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-yellow-400" />
                  Budget Allocation
                </h4>
                <FormField
                  control={form.control}
                  name="creditBudget"
                  render={({ field }) => (
                    <FormItem className="max-w-md">
                      <FormLabel>Monthly Credit Budget</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit from org"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Org budget: {formatLimit(orgLimits.creditBudget)} credits/month
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Workspace Allocation */}
              <div className="border-t pt-6">
                <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-orange-400" />
                  Workspace Allocation
                </h4>
                <div className="grid gap-6 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="ramMb"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <MemoryStick className="h-4 w-4 text-cyan-400" />
                          RAM (MB)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Inherit"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Org pool: {formatLimit(orgLimits.ramMb)} MB
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cpuCores"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-orange-400" />
                          CPU (cores)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.5"
                            placeholder="Inherit"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Org pool: {formatLimit(orgLimits.cpuCores)} cores
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="storageMb"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-pink-400" />
                          Storage (MB)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Inherit"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Org pool: {formatLimit(orgLimits.storageMb)} MB
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {Boolean(error) && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {success ? <p className="text-sm text-green-600">
                  Allocation saved successfully!
                </p> : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(buildOrgUrl("/resources"))}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Allocation
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DeptAllocationPage() {
  return (
    <ProtectedRoute>
      <DeptAllocationContent />
    </ProtectedRoute>
  );
}
