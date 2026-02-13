"use client";

/**
 * Admin Credit Transactions Page
 *
 * View and filter transaction history:
 * - Filter by type (purchase/usage/refund/bonus/grant/allocation)
 * - Date range filtering
 * - Transaction details
 *
 * @module app/(admin)/admin/credits/transactions/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { adminApiUrl } from "@/shared/config/urls";
import {
    Building2,
    ChevronLeft,
    ChevronRight,
    Filter,
    Receipt,
    User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type TransactionType = 'purchase' | 'usage' | 'refund' | 'bonus' | 'grant' | 'allocation';

interface CreditTransaction {
  id: string;
  creditWalletId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  creditWallet: {
    id: string;
    user: {
      id: string;
      email: string;
      name: string;
    } | null;
    organization: {
      id: string;
      name: string;
      slug: string;
    } | null;
  };
}

interface TransactionsResponse {
  success: boolean;
  data: {
    transactions: CreditTransaction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const TRANSACTION_TYPES: TransactionType[] = [
  'purchase',
  'usage',
  'refund',
  'bonus',
  'grant',
  'allocation',
];

const TYPE_COLORS: Record<TransactionType, string> = {
  purchase: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  usage: 'bg-red-500/10 text-red-500 border-red-500/20',
  refund: 'bg-green-500/10 text-green-500 border-green-500/20',
  bonus: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  grant: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  allocation: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
};

export default function AdminCreditTransactionsPage() {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (typeFilter && typeFilter !== 'all') {
        params.set('type', typeFilter);
      }
      if (startDate) {
        params.set('startDate', new Date(startDate).toISOString());
      }
      if (endDate) {
        params.set('endDate', new Date(endDate).toISOString());
      }

      const res = await fetch(
        adminApiUrl(`/credits/transactions?${params.toString()}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error('Failed to fetch transactions');

      const json: TransactionsResponse = await res.json();
      setTransactions(json.data.transactions);
      setTotalPages(json.data.pagination.totalPages);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, page, typeFilter, startDate, endDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleFilterChange = () => {
    setPage(1); // Reset to first page when filters change
    fetchTransactions();
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Transactions"
        description={`View transaction history (${total} total)`}
        icon={<Receipt className="h-6 w-6 text-purple-500" />}
        breadcrumbs={[{ label: "Credits", href: "/admin/credits" }]}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>
            Filter transactions by type and date range
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Type
              </label>
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as TransactionType | 'all')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleFilterChange} disabled={loading} className="flex-1">
                Apply
              </Button>
              <Button
                variant="outline"
                onClick={clearFilters}
                disabled={typeFilter === 'all' && !startDate && !endDate}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No transactions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Timestamp
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Owner
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Balance After
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isUser = !!tx.creditWallet.user;
                    const owner = isUser
                      ? tx.creditWallet.user?.email ?? "Unknown"
                      : tx.creditWallet.organization?.name ?? "Unknown";
                    const isPositive = tx.amount > 0;

                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={TYPE_COLORS[tx.type]}>
                            {tx.type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isUser ? (
                              <User className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Building2 className="h-4 w-4 text-purple-500" />
                            )}
                            <span className="text-sm text-foreground">{owner}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`font-semibold ${
                              isPositive ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {tx.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-foreground font-medium">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground max-w-xs truncate">
                          {tx.description || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total transactions)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
