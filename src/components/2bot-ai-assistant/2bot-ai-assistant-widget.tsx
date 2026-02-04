/**
 * 2Bot AI Assistant Widget
 *
 * Floating widget that provides AI assistant functionality.
 * Appears in the bottom-right corner of the dashboard.
 * All multimodal features (chat, image, voice) are inline within the chat.
 * 
 * Integrates with platform auth to:
 * - Detect user plan (FREE/PRO/ENTERPRISE)
 * - Use proper auth token for API calls
 * - Show appropriate features based on plan
 * - Track AI credit usage against plan limits
 *
 * @module components/2bot-ai-assistant/2bot-ai-assistant-widget
 */

"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/shared/config/urls";
import { Bot, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { TwoBotAIChat } from "./2bot-ai-chat";
import { CreditsDisplay } from "./credits-display";

interface CreditUsageData {
  used: number;
  limit: number;
  remaining: number | null;
  percentUsed: number | null;
  exceeded: boolean;
}

interface TwoBotAIAssistantWidgetProps {
  defaultOpen?: boolean;
  position?: "bottom-right" | "bottom-left";
}

export function TwoBotAIAssistantWidget({
  defaultOpen = false,
  position = "bottom-right",
}: TwoBotAIAssistantWidgetProps) {
  // 🔐 Use platform auth - this gives us user, context, plan, and token
  const { user, context, isAuthenticated, isLoading: authLoading, token } = useAuth();
  
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [creditUsage, setCreditUsage] = useState<CreditUsageData | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);

  // Get plan from current context (personal or organization)
  const currentPlan = context.plan || "FREE";
  const isPro = ["PRO", "ENTERPRISE", "ORG_PRO", "ORG_BUSINESS", "ORG_ENTERPRISE"].includes(currentPlan as string);
  const contextLabel = context.type === "organization" ? "Organization" : "Personal";

  // Fetch credit usage on mount and when auth changes
  const fetchCreditUsage = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setLoadingCredits(false);
      return;
    }

    try {
      // Fetch from different endpoint based on context
      // Note: Backend endpoint may still use 'tokens' in path for compatibility, but returns credits info
      const endpoint = context.type === "organization" && context.organizationId
        ? `/orgs/${context.organizationId}/credits/tokens`
        : "/credits/tokens";

      const res = await fetch(apiUrl(endpoint), {
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${token}`,
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

  // Handle credit usage updates from chat (credits used per message)
  const handleCreditsUpdate = useCallback((creditsUsed: number) => {
    setCreditUsage(prev => {
      if (!prev) return prev;
      const newUsed = prev.used + creditsUsed;
      const newRemaining = prev.limit === -1 ? null : Math.max(0, prev.limit - newUsed);
      const newPercentUsed = prev.limit === -1 ? null : Math.min(100, (newUsed / prev.limit) * 100);
      return {
        ...prev,
        used: newUsed,
        remaining: newRemaining,
        percentUsed: newPercentUsed,
        exceeded: prev.limit !== -1 && newUsed >= prev.limit,
      };
    });
  }, []);

  const positionClasses = position === "bottom-right"
    ? "right-4 bottom-4"
    : "left-4 bottom-4";

  // Don't show widget while auth is loading
  if (authLoading) {
    return null;
  }

  // Don't show widget if not authenticated - user needs to log in first
  if (!isAuthenticated) {
    return null;
  }

  // Check if user is low on credits
  const isLowCredits = creditUsage && creditUsage.percentUsed !== null && creditUsage.percentUsed > 80;

  return (
    <>
      {/* Collapsed: Floating button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className={`fixed ${positionClasses} h-14 w-14 rounded-full shadow-lg z-50`}
          size="icon"
          title={`2Bot AI - ${contextLabel}`}
        >
          <Bot className="h-6 w-6" />
          {/* Credit usage warning - show when above 80% */}
          {isLowCredits && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">
              {Math.round(creditUsage?.percentUsed || 0)}%
            </span>
          )}
          {/* Context indicator (Personal/Organization) */}
          {context.type && (
            <span className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] px-1 py-0.5 rounded-full">
              {context.type === "organization" ? "ORG" : "P"}
            </span>
          )}
        </Button>
      )}

      {/* Expanded: Chat panel */}
      {isOpen && (
        <div
          className={`fixed ${positionClasses} w-[400px] h-[600px] shadow-2xl z-50 flex flex-col bg-background border rounded-lg overflow-hidden`}
          role="dialog"
          aria-label="2Bot AI Assistant"
        >
          {/* Header */}
          <div className="flex flex-row items-center justify-between py-3 px-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">2Bot AI</h2>
              <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                {contextLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CreditsDisplay 
                used={creditUsage?.used ?? 0} 
                limit={creditUsage?.limit ?? 0} 
                loading={loadingCredits} 
                compact 
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat content */}
          <div className="flex-1 overflow-hidden">
            {loadingCredits ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <TwoBotAIChat 
                onTokenUsage={handleCreditsUpdate} 
                authToken={token}
                userPlan={currentPlan}
                organizationId={context.type === "organization" ? context.organizationId : undefined}
                userId={user?.id}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
