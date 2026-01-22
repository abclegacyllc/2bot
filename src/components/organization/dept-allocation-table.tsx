"use client";

/**
 * Department Allocation Table
 *
 * Displays a table of department quota allocations with edit/delete actions.
 *
 * @module components/organization/dept-allocation-table
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";

interface DeptAllocation {
  id: string;
  departmentId: string;
  departmentName: string;
  maxGateways: number | null;
  maxWorkflows: number | null;
  maxPlugins: number | null;
  aiTokenBudget: number | null;
  maxRamMb: number | null;
  maxCpuCores: number | null;
  maxStorageMb: number | null;
  allocMode: string;
  setByName?: string;
  updatedAt: string;
}

interface DeptAllocationTableProps {
  allocations: DeptAllocation[];
  onEdit: (allocation: DeptAllocation) => void;
  onDelete: (departmentId: string) => void;
}

// Format allocation mode for display
function formatAllocMode(mode: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  switch (mode) {
    case "HARD_CAP":
      return { label: "Hard Cap", variant: "destructive" };
    case "SOFT_CAP":
      return { label: "Soft Cap", variant: "secondary" };
    case "RESERVED":
      return { label: "Reserved", variant: "default" };
    case "UNLIMITED":
      return { label: "Unlimited", variant: "outline" };
    default:
      return { label: mode, variant: "outline" };
  }
}

// Format number with K/M suffix
function formatNumber(num: number | null): string {
  if (num === null) return "—";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function DeptAllocationTable({
  allocations,
  onEdit,
  onDelete,
}: DeptAllocationTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Gateways</TableHead>
            <TableHead className="text-right">Workflows</TableHead>
            <TableHead className="text-right">Plugins</TableHead>
            <TableHead className="text-right">AI Tokens</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((alloc) => {
            const modeInfo = formatAllocMode(alloc.allocMode);
            return (
              <TableRow key={alloc.id}>
                <TableCell className="font-medium">
                  {alloc.departmentName}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(alloc.maxGateways)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(alloc.maxWorkflows)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(alloc.maxPlugins)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(alloc.aiTokenBudget)}
                </TableCell>
                <TableCell>
                  <Badge variant={modeInfo.variant}>{modeInfo.label}</Badge>
                </TableCell>
                <TableCell>
                  <span
                    className="text-muted-foreground text-sm"
                    title={`${alloc.setByName ? `Set by ${alloc.setByName}\n` : ""}${new Date(alloc.updatedAt).toLocaleString()}`}
                  >
                    {formatRelativeTime(alloc.updatedAt)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(alloc)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(alloc.departmentId)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
