"use client";

/**
 * 2Bot AI Page
 *
 * Full-page AI chat interface replacing the floating widget.
 * Flat, borderless layout that fills the entire content area.
 * No extra headers or wrappers — just the chat.
 *
 * @module app/(dashboard)/2bot-ai
 */

import { TwoBotAIChat } from "@/components/2bot-ai-assistant";
import { useAuth } from "@/components/providers/auth-provider";
import { apiUrl } from "@/shared/config/urls";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface CreditUsageData {
  used: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  exceeded: boolean;
}

function TwoBotAIPageContent() {
  const { user, context, isAuthenticated, isLoading: authLoading, token } = useAuth();

  const [creditUsage, setCreditUsage] = useState<CreditUsageData | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);

  const currentPlan = context.plan || "FREE";

  // Fetch credit usage
  const fetchCreditUsage = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoadingCredits(false);
      return;
    }

    try {
      const endpoint =
        context.type === "organization" && context.organizationId
          ? `/orgs/${context.organizationId}/credits/tokens`
          : "/credits/tokens";

      const res = await fetch(apiUrl(endpoint), {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCreditUsage({
          used: data.data.used,
          limit: data.data.limit,
          remaining: data.data.remaining,
          percentUsed: data.data.percentUsed,
          exceeded: data.data.exceeded,
        });
      }
    } catch (err) {
      console.error("Failed to fetch credit usage:", err);
    } finally {
      setLoadingCredits(false);
    }
  }, [isAuthenticated, token, context.type, context.organizationId]);

  useEffect(() => {
    if (!authLoading) {
      fetchCreditUsage();
    }
  }, [authLoading, fetchCreditUsage]);

  // Handle credit usage updates from chat
  const handleCreditsUpdate = useCallback((creditsUsed: number) => {
    setCreditUsage((prev) => {
      if (!prev) return prev;
      const newUsed = prev.used + creditsUsed;
      const newRemaining = prev.limit === -1 ? null : Math.max(0, prev.limit - newUsed);
      const newPercentUsed =
        prev.limit === -1 ? null : Math.min(100, (newUsed / prev.limit) * 100);
      return {
        ...prev,
        used: newUsed,
        remaining: newRemaining,
        percentUsed: newPercentUsed,
        exceeded: prev.limit !== -1 && newUsed >= prev.limit,
      };
    });
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
        <p className="text-muted-foreground">Please log in to use 2Bot AI.</p>
      </div>
    );
  }

  return (
    <div className="-m-6 h-[calc(100vh-4rem)]">
      {loadingCredits ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <TwoBotAIChat
          onTokenUsage={handleCreditsUpdate}
          authToken={token}
          userPlan={currentPlan}
          organizationId={
            context.type === "organization" ? context.organizationId : undefined
          }
          userId={user?.id}
        />
      )}
    </div>
  );
}

export default function TwoBotAIPage() {
  return <TwoBotAIPageContent />;
}
