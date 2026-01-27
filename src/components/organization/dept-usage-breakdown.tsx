"use client";

/**
 * Department Usage Breakdown Component
 *
 * Displays usage breakdown by department within an organization.
 * Shows allocation vs actual usage for each department.
 *
 * @module components/organization/dept-usage-breakdown
 */

import { UsageProgressBar } from "@/components/quota/usage-progress-bar";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Building2, ChevronRight } from "lucide-react";
import Link from "next/link";

interface DepartmentUsage {
  id: string;
  name: string;
  executions: {
    current: number;
    allocated: number | null;
  };
  members: number;
}

interface DeptUsageBreakdownProps {
  orgId: string;
  departments: DepartmentUsage[];
  className?: string;
}

export function DeptUsageBreakdown({
  orgId,
  departments,
  className,
}: DeptUsageBreakdownProps) {
  if (departments.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Department Breakdown</CardTitle>
          <CardDescription>Usage by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <p>No departments configured</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Department Breakdown</CardTitle>
        <CardDescription>
          Execution usage by department ({departments.length} departments)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {departments.map((dept) => {
          const percentage =
            dept.executions.allocated && dept.executions.allocated > 0
              ? (dept.executions.current / dept.executions.allocated) * 100
              : 0;

          return (
            <Link
              key={dept.id}
              href={`/organizations/${orgId}/departments/${dept.id}`}
              className="block"
            >
              <div
                className={cn(
                  "rounded-lg border p-4 transition-colors hover:bg-muted/50",
                  percentage >= 100 && "border-red-200 dark:border-red-800",
                  percentage >= 95 &&
                    percentage < 100 &&
                    "border-orange-200 dark:border-orange-800",
                  percentage >= 80 &&
                    percentage < 95 &&
                    "border-yellow-200 dark:border-yellow-800"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{dept.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dept.members} member{dept.members !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <UsageProgressBar
                  current={dept.executions.current}
                  limit={dept.executions.allocated}
                  size="sm"
                  showPercentage={false}
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {dept.executions.current.toLocaleString()} /{" "}
                    {dept.executions.allocated?.toLocaleString() ?? "∞"}
                  </span>
                  {dept.executions.allocated && (
                    <span>{Math.round(percentage)}%</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
