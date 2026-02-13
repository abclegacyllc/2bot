"use client";

/**
 * Admin Credits Overview Page
 *
 * Dashboard for credit management:
 * - Total credits in circulation
 * - Quick actions (grant/refund)
 * - Links to wallets, transactions, rates
 *
 * @module app/(admin)/admin/credits/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApiUrl } from "@/shared/config/urls";
import {
    ArrowRight,
    Coins,
    DollarSign,
    Receipt,
    Settings,
    TrendingUp,
    Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface CreditStats {
  totalWallets: number;
  totalBalance: number;
  totalLifetime: number;
  totalTransactions: number;
  recentGrants: number;
  recentUsage: number;
}

export default function AdminCreditsPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch wallets and transactions to calculate stats
      const [walletsRes, transactionsRes] = await Promise.all([
        fetch(adminApiUrl('/credits/wallets?limit=1000'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(adminApiUrl('/credits/transactions?limit=1000'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!walletsRes.ok || !transactionsRes.ok) {
        throw new Error('Failed to fetch credit stats');
      }

      const walletsData = await walletsRes.json();
      const transactionsData = await transactionsRes.json();

      const wallets = walletsData.data?.wallets || [];
      const transactions = transactionsData.data?.transactions || [];

      const totalBalance = wallets.reduce((sum: number, w: { balance: number }) => sum + w.balance, 0);
      const totalLifetime = wallets.reduce((sum: number, w: { lifetime: number }) => sum + w.lifetime, 0);

      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const recentTxs = transactions.filter(
        (tx: { createdAt: string }) => new Date(tx.createdAt) > last30Days
      );
      const recentGrants = recentTxs
        .filter((tx: { type: string }) => tx.type === 'grant')
        .reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);
      const recentUsage = recentTxs
        .filter((tx: { type: string }) => tx.type === 'usage')
        .reduce((sum: number, tx: { amount: number }) => sum + Math.abs(tx.amount), 0);

      setStats({
        totalWallets: wallets.length,
        totalBalance,
        totalLifetime,
        totalTransactions: transactions.length,
        recentGrants,
        recentUsage,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Coins className="h-6 w-6 text-yellow-500" />
          Credit Management
        </h1>
        <p className="text-muted-foreground">
          Manage platform credits, wallets, and transactions
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Balance */}
        <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground">
                {loading ? '...' : stats?.totalBalance.toLocaleString()}
              </div>
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Across {stats?.totalWallets || 0} wallets
            </p>
          </CardContent>
        </Card>

        {/* Lifetime Issued */}
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lifetime Issued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground">
                {loading ? '...' : stats?.totalLifetime.toLocaleString()}
              </div>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              All-time credit grants
            </p>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Granted:</span>
                <span className="text-lg font-semibold text-green-500">
                  +{loading ? '...' : stats?.recentGrants.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Used:</span>
                <span className="text-lg font-semibold text-red-500">
                  -{loading ? '...' : stats?.recentUsage.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Credits</CardTitle>
          <CardDescription>
            View and manage credit wallets, transactions, and pricing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/admin/credits/wallets">
              <Card className="cursor-pointer hover:border-blue-500 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-2">
                    <Wallet className="h-8 w-8 text-blue-500" />
                    <h3 className="font-semibold text-foreground">Credit Wallets</h3>
                    <p className="text-sm text-muted-foreground">
                      {stats?.totalWallets || 0} wallets
                    </p>
                    <Button variant="ghost" size="sm" className="w-full">
                      View All
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/credits/transactions">
              <Card className="cursor-pointer hover:border-purple-500 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-2">
                    <Receipt className="h-8 w-8 text-purple-500" />
                    <h3 className="font-semibold text-foreground">Transactions</h3>
                    <p className="text-sm text-muted-foreground">
                      {stats?.totalTransactions || 0} records
                    </p>
                    <Button variant="ghost" size="sm" className="w-full">
                      View History
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/admin/credits/rates">
              <Card className="cursor-pointer hover:border-green-500 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-2">
                    <Settings className="h-8 w-8 text-green-500" />
                    <h3 className="font-semibold text-foreground">Credit Rates</h3>
                    <p className="text-sm text-muted-foreground">
                      Pricing config
                    </p>
                    <Button variant="ghost" size="sm" className="w-full">
                      Manage Rates
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-2">
                  <DollarSign className="h-8 w-8 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Grant Credits</h3>
                  <p className="text-sm text-muted-foreground">
                    Manual credit grants
                  </p>
                  <Button size="sm" className="w-full" disabled>
                    Coming Soon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest credit activity</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/credits/transactions">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            View detailed transaction history in the Transactions page
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
