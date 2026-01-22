"use client";

/**
 * Member Usage Table Component
 *
 * Displays a table of organization members with their usage.
 * Sortable by usage, includes allocation info.
 *
 * @module components/organization/member-usage-table
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsageProgressBar } from "@/components/quota/usage-progress-bar";
import { cn } from "@/lib/utils";
import { ArrowUpDown, User } from "lucide-react";
import { useState, useMemo } from "react";

interface MemberUsage {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";
  departmentName?: string;
  executions: {
    current: number;
    allocated: number | null;
  };
}

interface MemberUsageTableProps {
  members: MemberUsage[];
  showDepartment?: boolean;
  className?: string;
}

type SortKey = "name" | "executions" | "percentage" | "department";
type SortDir = "asc" | "desc";

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  MANAGER: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  MEMBER: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

export function MemberUsageTable({
  members,
  showDepartment = true,
  className,
}: MemberUsageTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("executions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sort members
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "executions":
          comparison = a.executions.current - b.executions.current;
          break;
        case "percentage": {
          const aPercent =
            a.executions.allocated && a.executions.allocated > 0
              ? a.executions.current / a.executions.allocated
              : 0;
          const bPercent =
            b.executions.allocated && b.executions.allocated > 0
              ? b.executions.current / b.executions.allocated
              : 0;
          comparison = aPercent - bPercent;
          break;
        }
        case "department":
          comparison = (a.departmentName || "").localeCompare(
            b.departmentName || ""
          );
          break;
      }

      return sortDir === "desc" ? -comparison : comparison;
    });
  }, [members, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (members.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Member Usage</CardTitle>
          <CardDescription>Usage by team member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <p>No members found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Member Usage</CardTitle>
        <CardDescription>
          Individual usage across {members.length} team members
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8"
                  onClick={() => handleSort("name")}
                >
                  Member
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              {showDepartment && (
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort("department")}
                  >
                    Department
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              )}
              <TableHead>Role</TableHead>
              <TableHead className="w-[200px]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8"
                  onClick={() => handleSort("executions")}
                >
                  Usage
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3 h-8"
                  onClick={() => handleSort("percentage")}
                >
                  % of Allocation
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.map((member) => {
              const percentage =
                member.executions.allocated && member.executions.allocated > 0
                  ? (member.executions.current / member.executions.allocated) *
                    100
                  : null;

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatarUrl} alt={member.name} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  {showDepartment && (
                    <TableCell className="text-muted-foreground">
                      {member.departmentName || "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn("font-normal", ROLE_COLORS[member.role])}
                    >
                      {member.role.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <UsageProgressBar
                        current={member.executions.current}
                        limit={member.executions.allocated}
                        showPercentage={false}
                        size="sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {member.executions.current.toLocaleString()} /{" "}
                        {member.executions.allocated?.toLocaleString() ?? "∞"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {percentage !== null ? (
                      <span
                        className={cn(
                          "font-medium",
                          percentage >= 100 && "text-red-600 dark:text-red-400",
                          percentage >= 80 &&
                            percentage < 100 &&
                            "text-yellow-600 dark:text-yellow-400"
                        )}
                      >
                        {Math.round(percentage)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
