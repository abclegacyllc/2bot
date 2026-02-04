"use client";

/**
 * Credits Dashboard Client Component
 *
 * Client-side dashboard for managing personal credits.
 * Fetches and displays balance, history, usage breakdown, and purchase options.
 *
 * @module app/(dashboard)/credits/client
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/shared/config/urls";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
    BuyCreditsModal,
    CreditsBalanceCard,
    CreditsLimitWarning,
    CreditsPurchasePackages,
    CreditsTransactionHistory,
    CreditsUsageBreakdown,
    CreditsUsageChart,
} from "@/components/credits";
import type { CreditPackage } from "@/components/credits/credits-purchase-packages";
import type { Transaction } from "@/components/credits/credits-transaction-history";
import type { UsageBreakdown } from "@/components/credits/credits-usage-breakdown";
import type { DailyUsage } from "@/components/credits/credits-usage-chart";
import type { CreditUsageCategory } from "@/modules/credits";

// ===========================================
// Types
// ===========================================

interface BalanceData {
  balance: number;
  lifetime: number;
  formattedBalance: string;
}

interface UsageData {
  period: string;
  totalCredits: number;
  byCategory: Record<CreditUsageCategory, number>;
  aiUsage?: {
    byCapability: Record<string, number>;
    byModel: Record<string, number>;
  };
  byDay: Array<{ date: string; credits: number }>;
}

interface HistoryData {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

// ===========================================
// Credit Packages
// ===========================================

const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "small",
    name: "Starter",
    credits: 500,
    price: 5,
    popular: false,
  },
  {
    id: "medium",
    name: "Standard",
    credits: 1_250,
    price: 10,
    popular: true,
  },
  {
    id: "large",
    name: "Pro",
    credits: 3_000,
    price: 20,
    popular: false,
  },
  {
    id: "xlarge",
    name: "Enterprise",
    credits: 10_000,
    price: 50,
    popular: false,
  },
];

// ===========================================
// Main Component
// ===========================================

export function CreditsDashboardClient() {
  const { user, token, isLoading: authLoading } = useAuth();

  // State
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyType, setHistoryType] = useState<string | undefined>();
  const [usagePeriod, setUsagePeriod] = useState<"7d" | "30d" | "90d">("30d");

  // Auth headers helper
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // Monthly limit (from user plan - null for unlimited)
  const monthlyLimit: number | null = null; // Personal wallets typically have no hard limit
  const monthlyUsed = usage?.totalCredits || 0;

  // ===========================================
  // Data Fetching
  // ===========================================

  const fetchBalance = useCallback(async () => {
    const response = await fetch(apiUrl("/credits"), {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch balance");
    const data = await response.json();
    return data.data as BalanceData;
  }, [getAuthHeaders]);

  const fetchUsage = useCallback(async () => {
    const response = await fetch(apiUrl("/credits/usage"), {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch usage");
    const data = await response.json();
    return data.data as UsageData;
  }, [getAuthHeaders]);

  const fetchHistory = useCallback(
    async (page: number, type?: string) => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "10",
      });
      if (type) params.append("type", type);

      const response = await fetch(apiUrl(`/credits/history?${params}`), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      return data.data as HistoryData;
    },
    [getAuthHeaders]
  );

  const fetchAll = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const [balanceData, usageData, historyData] = await Promise.all([
        fetchBalance(),
        fetchUsage(),
        fetchHistory(1),
      ]);

      setBalance(balanceData);
      setUsage(usageData);
      setHistory(historyData);
    } catch (err) {
      console.error("Error fetching credits data:", err);
      setError("Failed to load credits data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user, fetchBalance, fetchUsage, fetchHistory]);

  useEffect(() => {
    if (user) {
      fetchAll();
    }
  }, [user, fetchAll]);

  // Handle history pagination and filtering
  useEffect(() => {
    if (!user || loading) return;

    fetchHistory(historyPage, historyType)
      .then(setHistory)
      .catch(() => {});
  }, [user, loading, historyPage, historyType, fetchHistory]);

  // ===========================================
  // Handlers
  // ===========================================

  const handleHistoryPageChange = (page: number) => {
    setHistoryPage(page);
  };

  const handleHistoryTypeFilter = (type: string | undefined) => {
    setHistoryType(type);
    setHistoryPage(1);
  };

  // ===========================================
  // Prepare chart data
  // ===========================================

  const chartData: DailyUsage[] =
    usage?.byDay.map((d) => ({
      date: d.date,
      credits: d.credits,
    })) || [];

  // ===========================================
  // Prepare breakdown data
  // ===========================================

  const breakdownData: UsageBreakdown | undefined = usage
    ? {
        byCategory: usage.byCategory,
        aiUsage: usage.aiUsage,
      }
    : undefined;

  // ===========================================
  // Render
  // ===========================================

  if (authLoading || loading) {
    return <CreditsDashboardSkeleton />;
  }

  if (error && !balance) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchAll}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Credits</h1>
          <p className="text-muted-foreground">
            Your universal currency for AI, marketplace, and premium features.
          </p>
        </div>
        <BuyCreditsModal
          packages={CREDIT_PACKAGES}
          variant="personal"
          onPurchaseComplete={fetchAll}
        />
      </div>

      {/* Warning Banner */}
      {balance && (
        <CreditsLimitWarning
          currentBalance={balance.balance}
          monthlyUsed={monthlyUsed}
          monthlyLimit={monthlyLimit}
          dismissable
        />
      )}

      {/* Balance Card */}
      {balance && (
        <CreditsBalanceCard
          balance={balance.balance}
          monthlyUsed={monthlyUsed}
          planLimit={monthlyLimit}
          lifetime={balance.lifetime}
          loading={loading}
        />
      )}

      {/* Tabs for different views */}
      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="purchase">Buy Credits</TabsTrigger>
        </TabsList>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Usage Chart */}
            <CreditsUsageChart
              data={chartData}
              period={usagePeriod}
              onPeriodChange={(p) => setUsagePeriod(p as "7d" | "30d" | "90d")}
              loading={loading}
            />

            {/* Usage Breakdown */}
            {breakdownData && (
              <CreditsUsageBreakdown data={breakdownData} loading={loading} />
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {history && (
            <CreditsTransactionHistory
              transactions={history.transactions}
              total={history.total}
              page={historyPage}
              pageSize={10}
              onPageChange={handleHistoryPageChange}
              onTypeFilter={handleHistoryTypeFilter}
              loading={loading}
            />
          )}
        </TabsContent>

        {/* Purchase Tab */}
        <TabsContent value="purchase" className="space-y-4">
          <CreditsPurchasePackages
            packages={CREDIT_PACKAGES}
            loading={false}
            variant="personal"
            onPurchase={async (packageId) => {
              // Open buy modal directly
              const response = await fetch(apiUrl("/credits/purchase"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ package: packageId }),
              });
              if (response.ok) {
                const data = await response.json();
                if (data.data?.checkoutUrl) {
                  window.location.href = data.data.checkoutUrl;
                }
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================
// Loading Skeleton
// ===========================================

function CreditsDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Balance Card */}
      <Skeleton className="h-40 w-full" />

      {/* Tabs */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </div>
  );
}
