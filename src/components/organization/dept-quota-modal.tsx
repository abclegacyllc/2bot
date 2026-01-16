"use client";

/**
 * Department Quota Modal
 *
 * Modal for editing department resource quotas.
 * Shows current usage and validates against organization limits.
 *
 * Access: Organization Owner or Admin
 *
 * @module components/organization/dept-quota-modal
 */

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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

interface DeptQuotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: {
    id: string;
    name: string;
  } | null;
  orgLimits: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxApiCalls: number | null;
    maxStorage: number | null;
  };
  currentQuotas: {
    maxWorkflows: number | null;
    maxPlugins: number | null;
    maxApiCalls: number | null;
    maxStorage: number | null;
  };
  token: string;
  onSaved: () => void;
}

export function DeptQuotaModal({
  open,
  onOpenChange,
  department,
  orgLimits,
  currentQuotas,
  token,
  onSaved,
}: DeptQuotaModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<QuotaFormInput>({
    defaultValues: {
      maxWorkflows: formatQuotaValue(currentQuotas.maxWorkflows),
      maxPlugins: formatQuotaValue(currentQuotas.maxPlugins),
      maxApiCalls: formatQuotaValue(currentQuotas.maxApiCalls),
      maxStorage: formatQuotaValue(currentQuotas.maxStorage),
    },
  });

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      form.reset({
        maxWorkflows: formatQuotaValue(currentQuotas.maxWorkflows),
        maxPlugins: formatQuotaValue(currentQuotas.maxPlugins),
        maxApiCalls: formatQuotaValue(currentQuotas.maxApiCalls),
        maxStorage: formatQuotaValue(currentQuotas.maxStorage),
      });
      setError(null);
    }
  }, [open, currentQuotas, form]);

  const onSubmit = async (data: QuotaFormInput) => {
    if (!department) return;

    setIsSaving(true);
    setError(null);

    try {
      // Convert string values to numbers
      const quotaData = {
        maxWorkflows: parseQuotaValue(data.maxWorkflows),
        maxPlugins: parseQuotaValue(data.maxPlugins),
        maxApiCalls: parseQuotaValue(data.maxApiCalls),
        maxStorage: parseQuotaValue(data.maxStorage),
      };

      const res = await fetch(`/api/departments/${department.id}/quotas`, {
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

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quotas");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to format limit display
  const formatLimit = (limit: number | null): string => {
    if (limit === null || limit === -1) return "Unlimited";
    return limit.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Quota for {department?.name}</DialogTitle>
          <DialogDescription>
            Configure resource limits for this department. Enter -1 for
            unlimited.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="maxWorkflows"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Workflows</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 10"
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
                      placeholder="e.g., 5"
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
                      placeholder="e.g., 10000"
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
                      placeholder="e.g., 500"
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

            {Boolean(error) && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
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
                  "Save Quotas"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
