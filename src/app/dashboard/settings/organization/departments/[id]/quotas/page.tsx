"use client";

/**
 * Department Quota Management Page
 *
 * Page for editing individual department resource quotas.
 * Accessed from the Owner dashboard.
 *
 * @module app/dashboard/settings/organization/departments/[id]/quotas/page
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
import {
    AlertTriangle,
    ArrowLeft,
    Loader2,
    Save,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

// Form input type (string-based for form fields)
interface QuotaFormInput {
  maxWorkflows: string;
  maxPlugins: string;
  maxApiCalls: string;
  maxStorage: string;
}

// Helper to parse string to number or null
function parseQuotaValue(val: string): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

// Helper to format number/null to string for form
function formatQuotaValue(val: number | null): string {
  return val === null ? "" : val.toString();
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isActive: boolean;
  quotas: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxApiCalls: number | null;
    maxStorage: number | null;
  };
}

interface OrgLimits {
  maxWorkflows: number | null;
  maxPlugins: number | null;
  maxApiCalls: number | null;
  maxStorage: number | null;
}

function DeptQuotaContent() {
  const params = useParams();
  const router = useRouter();
  const { context, token } = useAuth();

  const departmentId = params.id as string;

  const [department, setDepartment] = useState<Department | null>(null);
  const [orgLimits, setOrgLimits] = useState<OrgLimits>({
    maxWorkflows: null,
    maxPlugins: null,
    maxApiCalls: null,
    maxStorage: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if user is owner or admin
  const isOwnerOrAdmin =
    context.type === "organization" &&
    (context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN");

  // Redirect if not authorized
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard");
    } else if (!isOwnerOrAdmin) {
      router.push("/dashboard");
    }
  }, [context, router, isOwnerOrAdmin]);

  const form = useForm<QuotaFormInput>({
    defaultValues: {
      maxWorkflows: "",
      maxPlugins: "",
      maxApiCalls: "",
      maxStorage: "",
    },
  });

  const fetchData = useCallback(async () => {
    if (!token || !departmentId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch department details
      const deptRes = await fetch(`/api/departments/${departmentId}`, {
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

      // Fetch department quotas
      const quotaRes = await fetch(`/api/departments/${departmentId}/quotas`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        const quotas = quotaData.data || {};
        form.reset({
          maxWorkflows: formatQuotaValue(quotas.maxWorkflows),
          maxPlugins: formatQuotaValue(quotas.maxPlugins),
          maxApiCalls: formatQuotaValue(quotas.maxApiCalls),
          maxStorage: formatQuotaValue(quotas.maxStorage),
        });
      }

      // Fetch org limits
      const orgLimitsRes = await fetch("/api/quota/limits", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (orgLimitsRes.ok) {
        const limitsData = await orgLimitsRes.json();
        setOrgLimits(limitsData.data || {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [token, departmentId, form]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onSubmit = async (data: QuotaFormInput) => {
    if (!departmentId) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Convert string values to numbers
      const quotaData = {
        maxWorkflows: parseQuotaValue(data.maxWorkflows),
        maxPlugins: parseQuotaValue(data.maxPlugins),
        maxApiCalls: parseQuotaValue(data.maxApiCalls),
        maxStorage: parseQuotaValue(data.maxStorage),
      };

      const res = await fetch(`/api/departments/${departmentId}/quotas`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(quotaData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to save quotas");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quotas");
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
            <Link href="/dashboard/admin/resources">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
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
          <Link href="/dashboard/admin/resources">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{department?.name} Quotas</h1>
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

      {/* Quota Form */}
      <Card>
        <CardHeader>
          <CardTitle>Resource Quotas</CardTitle>
          <CardDescription>
            Set limits for this department. Enter -1 for unlimited. Leave empty
            to inherit from organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="maxWorkflows"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Workflows</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit from org"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Organization limit: {formatLimit(orgLimits.maxWorkflows)}
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
                      <FormLabel>Max Plugins</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit from org"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Organization limit: {formatLimit(orgLimits.maxPlugins)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxApiCalls"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max API Calls (per day)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit from org"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Organization limit: {formatLimit(orgLimits.maxApiCalls)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxStorage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Storage (MB)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Inherit from org"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Organization limit: {formatLimit(orgLimits.maxStorage)}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {Boolean(error) && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              {success ? <p className="text-sm text-green-600">
                  Quotas saved successfully!
                </p> : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/dashboard/admin/resources")}
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
                      Save Quotas
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

export default function DeptQuotaPage() {
  return (
    <ProtectedRoute>
      <DeptQuotaContent />
    </ProtectedRoute>
  );
}
