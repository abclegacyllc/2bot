"use client";

/**
 * Gateways List Page
 *
 * Shows all gateways for the current user with status indicators.
 * Provides navigation to add new gateways and view gateway details.
 *
 * @module app/(dashboard)/gateways
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { GatewayStatusBadge } from "@/components/gateways/gateway-status";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent
} from "@/components/ui/card";
import type { GatewayListItem } from "@/modules/gateway/gateway.types";
import { apiUrl } from "@/shared/config/urls";

// Icons (inline SVGs for simplicity)
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const BotIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const WebhookIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

/**
 * Get icon for gateway type
 */
function getGatewayIcon(type: string) {
  switch (type) {
    case "TELEGRAM_BOT":
      return <BotIcon />;
    case "AI":
      return <AIIcon />;
    case "WEBHOOK":
      return <WebhookIcon />;
    default:
      return <BotIcon />;
  }
}

/**
 * Get display name for gateway type
 */
function getGatewayTypeName(type: string): string {
  switch (type) {
    case "TELEGRAM_BOT":
      return "Telegram Bot";
    case "AI":
      return "AI Provider";
    case "WEBHOOK":
      return "Webhook";
    default:
      return type;
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return then.toLocaleDateString();
}

/**
 * Gateway card component
 */
function GatewayCard({ gateway }: { gateway: GatewayListItem }) {
  return (
    <Link href={`/gateways/${gateway.id}`}>
      <Card className="border-border bg-card/50 hover:bg-card/80 hover:border-border transition-colors cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
              {getGatewayIcon(gateway.type)}
            </div>

            {/* Info */}
            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground truncate">{gateway.name}</h3>
                <GatewayStatusBadge status={gateway.status} />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{getGatewayTypeName(gateway.type)}</span>
                <span>•</span>
                <span>Last active: {formatRelativeTime(gateway.lastConnectedAt)}</span>
              </div>
              {gateway.lastError && gateway.status === "ERROR" ? <p className="text-xs text-red-400 mt-1 truncate">{gateway.lastError}</p> : null}
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 text-muted-foreground group-hover:text-muted-foreground transition-colors">
              <ChevronRightIcon />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <Card className="border-border bg-card/50 border-dashed">
      <CardContent className="py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <BotIcon />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">No gateways yet</h3>
        <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
          Connect your first gateway to start automating with Telegram bots and AI providers.
        </p>
        <Link href="/gateways/create">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <PlusIcon />
            <span className="ml-2">Add Gateway</span>
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-border bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-muted" />
              <div className="flex-grow space-y-2">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Gateways page content
 */
function GatewaysContent() {
  const { token, context } = useAuth();
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine if in organization context
  const isOrgContext = context.type === "organization" && !!context.organizationId;
  const orgId = context.organizationId;

  useEffect(() => {
    async function fetchGateways() {
      if (!token) return;

      try {
        // Use org endpoint if in org context, otherwise use personal endpoint
        const fetchUrl = isOrgContext && orgId
          ? apiUrl(`/orgs/${orgId}/gateways`)
          : apiUrl("/user/gateways");
        
        const response = await fetch(fetchUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch gateways");
        }

        const data = await response.json();
        setGateways(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchGateways();
  }, [token, isOrgContext, orgId]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gateways</h1>
            <p className="text-muted-foreground">
              Manage your Telegram bots and AI provider connections
            </p>
          </div>
          <Link href="/gateways/create">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <PlusIcon />
              <span className="ml-2">Add Gateway</span>
            </Button>
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <Card className="border-red-900 bg-red-950/20">
            <CardContent className="py-8 text-center">
              <p className="text-red-400">{error}</p>
              <Button
                variant="outline"
                className="mt-4 border-border"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : gateways.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {gateways.map((gateway) => (
              <GatewayCard key={gateway.id} gateway={gateway} />
            ))}
          </div>
        )}

        {/* Back link */}
        <div className="pt-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Gateways page with auth protection
 */
export default function GatewaysPage() {
  return (
    <ProtectedRoute>
      <GatewaysContent />
    </ProtectedRoute>
  );
}
