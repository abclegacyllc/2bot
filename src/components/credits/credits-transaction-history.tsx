"use client";

/**
 * Credits Transaction History
 *
 * Table displaying credit transactions with filtering and pagination.
 * Used on both personal and organization credits pages.
 *
 * @module components/credits/credits-transaction-history
 */

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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CreditUsageCategory } from "@/modules/credits";
import {
    ArrowDownRight,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    History,
} from "lucide-react";

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  category?: CreditUsageCategory;
  createdAt: Date | string;
}

export interface CreditsTransactionHistoryProps {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange?: (page: number) => void;
  onTypeFilter?: (type: string | undefined) => void;
  onCategoryFilter?: (category: CreditUsageCategory | undefined) => void;
  typeFilter?: string;
  categoryFilter?: CreditUsageCategory;
  className?: string;
}

/**
 * Format credits for display
 */
function formatCredits(credits: number): string {
  const absCredits = Math.abs(credits);
  if (absCredits >= 1_000_000) {
    return `${(absCredits / 1_000_000).toFixed(1)}M`;
  }
  if (absCredits >= 1_000) {
    return `${(absCredits / 1_000).toFixed(1)}K`;
  }
  return absCredits.toLocaleString();
}

/**
 * Get badge variant for transaction type
 */
function getTypeBadge(type: string) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    purchase: { variant: "default", label: "Purchase" },
    usage: { variant: "secondary", label: "Usage" },
    refund: { variant: "outline", label: "Refund" },
    bonus: { variant: "default", label: "Bonus" },
    grant: { variant: "default", label: "Grant" },
    allocation: { variant: "outline", label: "Allocation" },
  };
  return variants[type] || { variant: "secondary" as const, label: type };
}

/**
 * Get category label
 */
function getCategoryLabel(category?: CreditUsageCategory): string {
  const labels: Record<CreditUsageCategory, string> = {
    ai_usage: "2Bot AI",
    marketplace: "Marketplace",
    premium_feature: "Premium",
    subscription: "Subscription",
    transfer: "Transfer",
    other: "Other",
  };
  return category ? labels[category] : "";
}

export function CreditsTransactionHistory({
  transactions,
  total,
  page,
  pageSize,
  loading = false,
  onPageChange,
  onTypeFilter,
  onCategoryFilter,
  typeFilter,
  categoryFilter,
  className,
}: CreditsTransactionHistoryProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>{total} total transactions</CardDescription>
        </div>
        <div className="flex gap-2">
          {/* Type Filter */}
          {onTypeFilter && (
            <Select
              value={typeFilter || "all"}
              onValueChange={(v) => onTypeFilter(v === "all" ? undefined : v)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="usage">Usage</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="bonus">Bonus</SelectItem>
                <SelectItem value="grant">Grant</SelectItem>
              </SelectContent>
            </Select>
          )}
          {/* Category Filter */}
          {onCategoryFilter && (
            <Select
              value={categoryFilter || "all"}
              onValueChange={(v) =>
                onCategoryFilter(v === "all" ? undefined : (v as CreditUsageCategory))
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="ai_usage">2Bot AI</SelectItem>
                <SelectItem value="marketplace">Marketplace</SelectItem>
                <SelectItem value="premium_feature">Premium</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No transactions found
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  const badge = getTypeBadge(tx.type);
                  const date = new Date(tx.createdAt);

                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">
                        {date.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {tx.category && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {getCategoryLabel(tx.category)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {tx.description || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "flex items-center justify-end gap-1 font-medium",
                            isPositive ? "text-green-600" : "text-muted-foreground"
                          )}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {isPositive ? "+" : "-"}
                          {formatCredits(tx.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCredits(tx.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && onPageChange && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
