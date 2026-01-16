"use client";

/**
 * Employee Quota Modal Component
 *
 * Modal for department managers to edit employee quotas.
 * Validates that employee limits don't exceed department limits.
 *
 * @module components/department/employee-quota-modal
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, AlertCircle, Loader2, Puzzle, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

// Types
interface EmployeeInfo {
  id: string;
  name: string;
  email: string;
}

interface EmployeeLimits {
  maxWorkflows: number | null;
  maxPlugins: number | null;
  maxApiCalls: number | null;
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

interface EmployeeQuotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeInfo;
  currentLimits: EmployeeLimits;
  currentUsage: EmployeeUsage;
  departmentLimits: DepartmentLimits;
  departmentId: string;
  token: string;
  onSaved: () => void;
}

// Form input type (all strings for form handling)
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

export function EmployeeQuotaModal({
  open,
  onOpenChange,
  employee,
  currentLimits,
  currentUsage,
  departmentLimits,
  departmentId,
  token,
  onSaved,
}: EmployeeQuotaModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
  } = useForm<QuotaFormInput>({
    defaultValues: {
      maxWorkflows: formatQuotaValue(currentLimits.maxWorkflows),
      maxPlugins: formatQuotaValue(currentLimits.maxPlugins),
      maxApiCalls: formatQuotaValue(currentLimits.maxApiCalls),
    },
  });

  // Reset form when modal opens with current limits
  useEffect(() => {
    if (open) {
      reset({
        maxWorkflows: formatQuotaValue(currentLimits.maxWorkflows),
        maxPlugins: formatQuotaValue(currentLimits.maxPlugins),
        maxApiCalls: formatQuotaValue(currentLimits.maxApiCalls),
      });
      setError(null);
      setValidationErrors({});
    }
  }, [open, currentLimits, reset]);

  // Watch values for real-time validation
  const watchedValues = watch();

  // Validate against department limits
  const validateAgainstDeptLimits = (values: QuotaFormInput): Record<string, string> => {
    const errors: Record<string, string> = {};

    const workflowVal = parseQuotaValue(values.maxWorkflows);
    const pluginVal = parseQuotaValue(values.maxPlugins);
    const apiCallVal = parseQuotaValue(values.maxApiCalls);

    // Check workflows
    if (workflowVal !== null && departmentLimits.maxWorkflows !== null) {
      if (workflowVal > departmentLimits.maxWorkflows) {
        errors.maxWorkflows = `Cannot exceed department limit (${departmentLimits.maxWorkflows})`;
      }
    }
    if (workflowVal !== null && workflowVal < currentUsage.workflows) {
      errors.maxWorkflows = `Cannot be less than current usage (${currentUsage.workflows})`;
    }

    // Check plugins
    if (pluginVal !== null && departmentLimits.maxPlugins !== null) {
      if (pluginVal > departmentLimits.maxPlugins) {
        errors.maxPlugins = `Cannot exceed department limit (${departmentLimits.maxPlugins})`;
      }
    }
    if (pluginVal !== null && pluginVal < currentUsage.plugins) {
      errors.maxPlugins = `Cannot be less than current usage (${currentUsage.plugins})`;
    }

    // Check API calls
    if (apiCallVal !== null && departmentLimits.maxApiCalls !== null) {
      if (apiCallVal > departmentLimits.maxApiCalls) {
        errors.maxApiCalls = `Cannot exceed department limit (${departmentLimits.maxApiCalls})`;
      }
    }

    return errors;
  };

  // Update validation errors when values change
  useEffect(() => {
    const errors = validateAgainstDeptLimits(watchedValues);
    setValidationErrors(errors);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues.maxWorkflows, watchedValues.maxPlugins, watchedValues.maxApiCalls]);

  const onSubmit = async (data: QuotaFormInput) => {
    // Validate first
    const errors = validateAgainstDeptLimits(data);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const body = {
        maxWorkflows: parseQuotaValue(data.maxWorkflows),
        maxPlugins: parseQuotaValue(data.maxPlugins),
        maxApiCalls: parseQuotaValue(data.maxApiCalls),
      };

      const res = await fetch(
        `/api/departments/${departmentId}/members/${employee.id}/quotas`,
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

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save quotas");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to check if a value exceeds limit
  const getFieldStatus = (fieldName: keyof QuotaFormInput): "ok" | "warning" | "error" => {
    if (validationErrors[fieldName]) return "error";
    return "ok";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Employee Quotas</DialogTitle>
          <DialogDescription>
            Set resource limits for <strong>{employee.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Error display */}
          {Boolean(error) && (
            <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Workflows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxWorkflows" className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-blue-500" />
                Max Workflows
              </Label>
              <Badge variant="secondary" className="text-xs">
                Using: {currentUsage.workflows}
              </Badge>
            </div>
            <Input
              id="maxWorkflows"
              type="number"
              min={0}
              placeholder={
                departmentLimits.maxWorkflows
                  ? `Dept limit: ${departmentLimits.maxWorkflows}`
                  : "Unlimited"
              }
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
            <p className="text-xs text-muted-foreground">
              Leave empty for unlimited (within dept limits)
            </p>
          </div>

          {/* Plugins */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxPlugins" className="flex items-center gap-2">
                <Puzzle className="h-4 w-4 text-purple-500" />
                Max Plugins
              </Label>
              <Badge variant="secondary" className="text-xs">
                Using: {currentUsage.plugins}
              </Badge>
            </div>
            <Input
              id="maxPlugins"
              type="number"
              min={0}
              placeholder={
                departmentLimits.maxPlugins
                  ? `Dept limit: ${departmentLimits.maxPlugins}`
                  : "Unlimited"
              }
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
            <p className="text-xs text-muted-foreground">
              Leave empty for unlimited (within dept limits)
            </p>
          </div>

          {/* API Calls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxApiCalls" className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                Max API Calls
              </Label>
              <Badge variant="secondary" className="text-xs">
                Using: {currentUsage.apiCalls.toLocaleString()}
              </Badge>
            </div>
            <Input
              id="maxApiCalls"
              type="number"
              min={0}
              placeholder={
                departmentLimits.maxApiCalls
                  ? `Dept limit: ${departmentLimits.maxApiCalls.toLocaleString()}`
                  : "Unlimited"
              }
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
            <p className="text-xs text-muted-foreground">
              Leave empty for unlimited (within dept limits)
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || Object.keys(validationErrors).length > 0}
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
