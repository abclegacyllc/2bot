"use client";

/**
 * Admin Credit Wallets Page
 *
 * View and manage all credit wallets:
 * - Search by user/org name
 * - View balance and usage
 * - Grant credits (modal)
 *
 * @module app/(admin)/admin/credits/wallets/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminApiUrl } from "@/shared/config/urls";
import {
    Building2,
    ChevronLeft,
    ChevronRight,
    Search,
    TrendingUp,
    User,
    Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CreditWallet {
  id: string;
  userId: string | null;
  organizationId: string | null;
  balance: number;
  lifetime: number;
  monthlyAllocation: number;
  monthlyUsed: number;
  createdAt: string;
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
}

interface WalletsResponse {
  success: boolean;
  data: {
    wallets: CreditWallet[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export default function AdminCreditWalletsPage() {
  const { token } = useAuth();
  const [wallets, setWallets] = useState<CreditWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (searchTerm) {
        params.set('search', searchTerm);
      }

      const res = await fetch(adminApiUrl(`/credits/wallets?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch wallets');

      const json: WalletsResponse = await res.json();
      setWallets(json.data.wallets);
      setTotalPages(json.data.pagination.totalPages);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, page, searchTerm]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1); // Reset to first page
    fetchWallets();
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
        title="Credit Wallets"
        description={`View and manage all credit wallets (${total} total)`}
        icon={<Wallet className="h-6 w-6 text-blue-500" />}
        breadcrumbs={[{ label: "Credits", href: "/admin/credits" }]}
      />

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Wallets</CardTitle>
          <CardDescription>
            Search by user email/name or organization name
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search wallets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
            {searchTerm ? <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
              >
                Clear
              </Button> : null}
          </form>
        </CardContent>
      </Card>

      {/* Wallets Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Wallets
            {searchTerm ? ` (filtered by "${searchTerm}")` : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading wallets...
            </div>
          ) : wallets.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No wallets found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Owner
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Balance
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Monthly
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Lifetime
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((wallet) => {
                    const isUser = !!wallet.user;
                    const owner = isUser
                      ? `${wallet.user?.name} (${wallet.user?.email})`
                      : wallet.organization?.name ?? "Unknown";
                    const monthlyRemaining = wallet.monthlyAllocation - wallet.monthlyUsed;

                    return (
                      <tr
                        key={wallet.id}
                        className="border-b border-border hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isUser ? (
                              <User className="h-4 w-4 text-blue-500" />
                            ) : (
                              <Building2 className="h-4 w-4 text-purple-500" />
                            )}
                            <div>
                              <div className="font-medium text-foreground">
                                {owner}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {isUser ? 'User' : 'Organization'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-semibold text-foreground">
                            {wallet.balance.toLocaleString()}
                          </div>
                          <Badge
                            variant={wallet.balance > 0 ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {wallet.balance > 0 ? 'Active' : 'Empty'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="text-sm text-foreground">
                            {wallet.monthlyUsed.toLocaleString()} /{' '}
                            {wallet.monthlyAllocation.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {monthlyRemaining.toLocaleString()} remaining
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <TrendingUp className="h-3 w-3 text-green-500" />
                            <span className="font-medium text-foreground">
                              {wallet.lifetime.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {new Date(wallet.createdAt).toLocaleDateString()}
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
                Page {page} of {totalPages} ({total} total wallets)
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
