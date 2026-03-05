"use client";

/**
 * Organization Credits Dashboard Client Component
 *
 * Client-side dashboard for managing organization credits.
 * Fetches and displays balance, history, usage breakdown, and purchase options.
 *
 * @module app/(dashboard)/organizations/[orgSlug]/credits/client
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import { ArrowLeft, RefreshCw, Shield } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ClaimStatus } from "@/components/credits";
import {
    BuyCreditsModal,
    CreditsBalanceCard,
    CreditsClaimCard,
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
    byFeature: Record<string, number>;
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
// Org Credit Packages — $1 = 100 credits (with org volume bonus)
// IDs must match server-side ORG_CREDIT_PACKAGES keys
// Base rate: $8 per 1K (org discount). Larger packages include volume bonuses.
// ===========================================

const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "org_small",
    name: "Org Starter",
    credits: 2_500,
    price: 20,
    popular: false,
  },
  {
    id: "org_medium",
    name: "Org Standard",
    credits: 6_250,
    price: 40,
    popular: true,
  },
  {
    id: "org_large",
    name: "Org Pro",
    credits: 15_000,
    price: 80,
    popular: false,
  },
  {
    id: "org_xlarge",
    name: "Org Enterprise",
    credits: 50_000,
    price: 200,
    popular: false,
  },
];

// ===========================================
// Main Component
// ===========================================

export function OrgCreditsDashboardClient() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { orgId, orgName, isFound, isLoading: orgLoading, orgRole } = useOrganization();

  // State
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyType, setHistoryType] = useState<string | undefined>();
  const [usagePeriod, setUsagePeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Auth headers helper
  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // No monthly spending cap — wallet balance is the only limit.
  // Credits pages show usage for informational purposes only.
  const monthlyLimit: number | null = null;
  const monthlyUsed = usage?.totalCredits || 0;

  // Check if user is admin
  const isAdmin = orgRole === "ORG_OWNER" || orgRole === "ORG_ADMIN";

  // ===========================================
  // Data Fetching
  // ===========================================

  const fetchBalance = useCallback(async () => {
    if (!orgId) return null;
    const response = await fetch(apiUrl(`/orgs/${orgId}/credits`), {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch balance");
    const data = await response.json();
    return data.data as BalanceData;
  }, [orgId, getAuthHeaders]);

  const fetchUsage = useCallback(async (period?: string) => {
    if (!orgId) return null;
    const params = period ? `?period=${period}` : "";
    const response = await fetch(apiUrl(`/orgs/${orgId}/credits/usage${params}`), {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error("Failed to fetch usage");
    const data = await response.json();
    return data.data as UsageData;
  }, [orgId, getAuthHeaders]);

  const fetchHistory = useCallback(
    async (page: number, type?: string) => {
      if (!orgId) return null;
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "10",
      });
      if (type) params.append("type", type);

      const response = await fetch(apiUrl(`/orgs/${orgId}/credits/history?${params}`), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      return data.data as HistoryData;
    },
    [orgId, getAuthHeaders]
  );

  const fetchClaimStatus = useCallback(async () => {
    if (!orgId) return null;
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/credits/claim-status`), {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.data as ClaimStatus;
    } catch {
      return null;
    }
  }, [orgId, getAuthHeaders]);

  const handleClaim = useCallback(async () => {
    if (!orgId) return;
    setClaiming(true);
    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/credits/claim`), {
        method: "POST",
        credentials: "include",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to claim credits");
      }
      const [balanceData, newClaimStatus] = await Promise.all([
        fetchBalance(),
        fetchClaimStatus(),
      ]);
      if (balanceData) setBalance(balanceData);
      setClaimStatus(newClaimStatus);
    } finally {
      setClaiming(false);
    }
  }, [orgId, getAuthHeaders, fetchBalance, fetchClaimStatus]);

  const fetchAll = useCallback(async () => {
    if (!user || !orgId) return;

    try {
      setLoading(true);
      setError(null);

      const [balanceData, usageData, historyData, claimData] = await Promise.all([
        fetchBalance(),
        fetchUsage(usagePeriod),
        fetchHistory(1),
        fetchClaimStatus(),
      ]);

      if (balanceData) setBalance(balanceData);
      if (usageData) setUsage(usageData);
      if (historyData) setHistory(historyData);
      setClaimStatus(claimData);
    } catch (err) {
      console.error("Error fetching org credits data:", err);
      setError("Failed to load credits data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user, orgId, fetchBalance, fetchUsage, fetchHistory, fetchClaimStatus]);

  useEffect(() => {
    if (user && orgId && isFound) {
      fetchAll();
    }
  }, [user, orgId, isFound, fetchAll]);

  // Refetch usage when period changes
  useEffect(() => {
    if (!user || !orgId || loading) return;
    fetchUsage(usagePeriod).then((data) => { if (data) setUsage(data); }).catch(() => {});
  }, [user, orgId, loading, usagePeriod, fetchUsage]);

  // Handle history pagination and filtering
  useEffect(() => {
    if (!user || !orgId || loading) return;

    fetchHistory(historyPage, historyType)
      .then((data) => {
        if (data) setHistory(data);
      })
      .catch(() => {});
  }, [user, orgId, loading, historyPage, historyType, fetchHistory]);

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
  // Render - Loading
  // ===========================================

  if (authLoading || orgLoading || loading) {
    return <OrgCreditsDashboardSkeleton />;
  }

  // Organization not found
  if (!isFound || !orgId) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-center">
        <p className="text-muted-foreground">Organization not found</p>
        <Link href="/organizations">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Organizations
          </Button>
        </Link>
      </div>
    );
  }

  // Error state
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

  // ===========================================
  // Render - Main
  // ===========================================

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Credits</h1>
            {isAdmin ? <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                <Shield className="h-3 w-3" />
                Admin
              </span> : null}
          </div>
          <p className="text-muted-foreground">
            {orgName}&apos;s universal currency for AI, marketplace, and premium features.
          </p>
        </div>
        {isAdmin ? <BuyCreditsModal
            packages={CREDIT_PACKAGES}
            variant="organization"
            organizationId={orgId}
            authToken={token}
            onPurchaseComplete={fetchAll}
          /> : null}
      </div>

      {/* Warning Banner */}
      {balance ? <CreditsLimitWarning
          currentBalance={balance.balance}
          monthlyUsed={monthlyUsed}
          monthlyLimit={monthlyLimit}
        /> : null}

      {/* Claim Card + Balance Card */}
      <div className={`grid gap-4 ${claimStatus?.creditClaimType === 'daily' ? 'md:grid-cols-2' : ''}`}>
        {/* Daily Claim Card (only shows for ORG_FREE) */}
        {isAdmin ? <CreditsClaimCard
            claimStatus={claimStatus}
            loading={loading}
            claiming={claiming}
            onClaim={handleClaim}
          /> : null}

        {/* Balance Card */}
        {balance ? <CreditsBalanceCard
            balance={balance.balance}
            monthlyUsed={monthlyUsed}
            planLimit={monthlyLimit}
            lifetime={balance.lifetime}
            loading={loading}
            variant="organization"
            monthlyGrantDate={claimStatus?.monthlyGrantDate}
            monthlyGrantAmount={claimStatus?.monthlyGrantAmount}
          /> : null}
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue={isAdmin ? "usage" : "history"} className="space-y-4">
        <TabsList>
          {isAdmin ? <TabsTrigger value="usage">Usage</TabsTrigger> : null}
          <TabsTrigger value="history">History</TabsTrigger>
          {isAdmin ? <TabsTrigger value="purchase">Buy Credits</TabsTrigger> : null}
        </TabsList>

        {/* Usage Tab - Admin only (API requires requireOrgAdmin) */}
        {isAdmin ? <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Usage Chart */}
            <CreditsUsageChart
              data={chartData}
              period={usagePeriod}
              onPeriodChange={setUsagePeriod}
              loading={loading}
            />

            {/* Usage Breakdown */}
            {breakdownData ? <CreditsUsageBreakdown data={breakdownData} loading={loading} /> : null}
          </div>
        </TabsContent> : null}

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {history ? <CreditsTransactionHistory
              transactions={history.transactions}
              total={history.total}
              page={historyPage}
              pageSize={10}
              onPageChange={handleHistoryPageChange}
              onTypeFilter={handleHistoryTypeFilter}
              loading={loading}
            /> : null}
        </TabsContent>

        {/* Purchase Tab - Admin only */}
        {isAdmin ? <TabsContent value="purchase" className="space-y-4">
            <CreditsPurchasePackages
              packages={CREDIT_PACKAGES}
              loading={false}
              variant="organization"
              onPurchase={async (packageId) => {
                const response = await fetch(apiUrl(`/orgs/${orgId}/credits/purchase`), {
                  method: "POST",
                  headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
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
          </TabsContent> : null}
      </Tabs>
    </div>
  );
}

// ===========================================
// Loading Skeleton
// ===========================================

function OrgCreditsDashboardSkeleton() {
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
