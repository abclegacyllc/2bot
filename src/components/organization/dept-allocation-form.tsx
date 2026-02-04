"use client";

/**
 * Department Allocation Form
 *
 * Form for creating or editing department quota allocations.
 * Validates against org limits and shows remaining pool resources.
 *
 * @module components/organization/dept-allocation-form
 */

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/shared/config/urls";
import type {
    DeptAllocationRecord,
    QuotaAllocation,
    UnallocatedResources
} from "@/shared/types/resources";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// ===================================
// Types
// ===================================

// Use DeptAllocationRecord from shared types, renamed for local use
type DeptAllocation = DeptAllocationRecord;

interface Department {
  id: string;
  name: string;
  hasAllocation?: boolean;
}

interface DeptAllocationFormProps {
  orgId: string;
  token: string;
  departments: Department[]; // Available departments (for new allocation)
  existingAllocation?: DeptAllocation | null; // For editing
  orgLimits: QuotaAllocation;
  unallocated: UnallocatedResources;
  onSaved: () => void;
  onCancel: () => void;
}

// ===================================
// Form Schema
// ===================================

const formSchema = z.object({
  departmentId: z.string().min(1, "Select a department"),
  maxGateways: z.string().optional(),
  maxWorkflows: z.string().optional(),
  maxPlugins: z.string().optional(),
  creditBudget: z.string().optional(),
  allocMode: z.enum(["SOFT_CAP", "HARD_CAP", "RESERVED", "UNLIMITED"]),
});

type FormValues = z.infer<typeof formSchema>;

// ===================================
// Helpers
// ===================================

function parseNumber(val: string | undefined): number | null {
  if (!val || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function formatNumber(num: number | null): string {
  if (num === null) return "";
  return num.toString();
}

function formatLimit(num: number | null): string {
  if (num === null) return "Unlimited";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

// ===================================
// Component
// ===================================

export function DeptAllocationForm({
  orgId,
  token,
  departments,
  existingAllocation,
  orgLimits,
  unallocated,
  onSaved,
  onCancel,
}: DeptAllocationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!existingAllocation;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      departmentId: existingAllocation?.departmentId ?? "",
      maxGateways: formatNumber(existingAllocation?.maxGateways ?? null),
      maxWorkflows: formatNumber(existingAllocation?.maxWorkflows ?? null),
      maxPlugins: formatNumber(existingAllocation?.maxPlugins ?? null),
      creditBudget: formatNumber(existingAllocation?.creditBudget ?? null),
      allocMode: (existingAllocation?.allocMode as FormValues["allocMode"]) ?? "SOFT_CAP",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const body = {
        maxGateways: parseNumber(values.maxGateways),
        maxWorkflows: parseNumber(values.maxWorkflows),
        maxPlugins: parseNumber(values.maxPlugins),
        creditBudget: parseNumber(values.creditBudget),
        allocMode: values.allocMode,
      };

      const url = apiUrl(`/orgs/${orgId}/quotas/departments/${values.departmentId}`);
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save allocation");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing
            ? `Edit Allocation: ${existingAllocation?.departmentName}`
            : "Allocate to Department"}
        </CardTitle>
        <CardDescription>
          Set quota limits for department resources. Leave empty for unlimited.
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Department Select (only for new allocation) */}
            {!isEditing && (
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Quota Fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="maxGateways"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Gateways</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Unlimited"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Available: {formatLimit(unallocated.gateways)}
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
                    <FormLabel>Max Workflows</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Unlimited"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Available: {formatLimit(unallocated.workflows)}
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
                        min="0"
                        placeholder="Unlimited"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Available: {formatLimit(unallocated.plugins)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditBudget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AI Token Budget</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Unlimited"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Available: {formatLimit(unallocated.creditBudget)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Allocation Mode */}
            <FormField
              control={form.control}
              name="allocMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enforcement Mode</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="SOFT_CAP">
                        Soft Cap - Warning at limit
                      </SelectItem>
                      <SelectItem value="HARD_CAP">
                        Hard Cap - Blocked at limit
                      </SelectItem>
                      <SelectItem value="RESERVED">
                        Reserved - Guaranteed allocation
                      </SelectItem>
                      <SelectItem value="UNLIMITED">
                        Unlimited - No restrictions
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How strictly to enforce the quota limits
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? "Update Allocation" : "Create Allocation"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
