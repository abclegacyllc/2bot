"use client";

/**
 * Dashboard Page
 *
 * Main dashboard showing stats cards, quick actions, and gateway status.
 * Layout provides sidebar, header, and auth protection.
 * Uses new hierarchical resource types (Phase 3 migration).
 */

import { useAuth } from "@/components/providers/auth-provider";
import {
    isPersonalStatus,
    useResourceStatus
} from "@/components/resources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiUrl } from "@/shared/config/urls";
import {
    ArrowRight,
    Bot,
    CheckCircle2,
    Plug,
    Plus,
    Settings,
    Sparkles,
    XCircle,
    Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ===========================================
// Types
// ===========================================

interface DashboardStats {
  gateways: { current: number; max: number };
  plugins: { current: number; max: number };
  credits: { current: number; max: number };
}

interface GatewayStatus {
  id: string;
  name: string;
  type: string;
  status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  lastError?: string | null;
}

// ===========================================
// Stats Card Component
// ===========================================

function StatsCard({
  title,
  icon: Icon,
  current,
  max,
  href,
}: {
  title: string;
  icon: React.ElementType;
  current: number;
  max: number;
  href: string;
}) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <Link href={href}>
      <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-muted-foreground flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {title}
            </CardDescription>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{current}</span>
              <span className="text-muted-foreground">
                / {isUnlimited ? "∞" : max}
              </span>
            </div>
            {!isUnlimited && (
              <Progress
                value={percentage}
                className={`h-1.5 ${isNearLimit ? "[&>div]:bg-yellow-500" : "[&>div]:bg-purple-500"}`}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ===========================================
// Gateway Status Mini List
// ===========================================

function GatewayStatusList({ gateways }: { gateways: GatewayStatus[] }) {
  if (gateways.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Gateway Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No gateways connected yet</p>
            <Link href="/gateways/create">
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Gateway
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Gateway Status
          </CardTitle>
          <Link href="/gateways">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gateways.slice(0, 5).map((gateway) => (
            <div
              key={gateway.id}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${
                    gateway.status === "CONNECTED"
                      ? "bg-green-500"
                      : gateway.status === "ERROR"
                        ? "bg-red-500"
                        : "bg-muted-foreground"
                  }`}
                />
                <div>
                  <p className="text-sm text-foreground">{gateway.name}</p>
                  <p className="text-xs text-muted-foreground">{gateway.type}</p>
                </div>
              </div>
              <Badge
                variant={gateway.status === "CONNECTED" ? "default" : "secondary"}
                className={
                  gateway.status === "CONNECTED"
                    ? "bg-green-900/50 text-green-300"
                    : gateway.status === "ERROR"
                      ? "bg-red-900/50 text-red-300"
                      : ""
                }
              >
                {gateway.status === "CONNECTED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {gateway.status === "ERROR" && <XCircle className="h-3 w-3 mr-1" />}
                {gateway.status.toLowerCase()}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Upgrade Banner
// ===========================================

function UpgradeBanner() {
  return (
    <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
      <CardContent className="py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Upgrade to Pro</h3>
              <p className="text-muted-foreground text-sm">
                Get unlimited plugins, more gateways, and priority support
              </p>
            </div>
          </div>
          <Link href="/billing/upgrade">
            <Button className="bg-purple-600 hover:bg-purple-700">
              View Plans
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Quick Actions
// ===========================================

function QuickActions() {
  const actions = [
    {
      title: "Add Gateway",
      description: "Connect a Telegram bot",
      icon: Plus,
      href: "/gateways/create",
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
    },
    {
      title: "Browse Plugins",
      description: "Discover new plugins",
      icon: Plug,
      href: "/plugins",
      color: "text-green-400",
      bgColor: "bg-green-400/10",
    },
    {
      title: "Settings",
      description: "Configure your workspace",
      icon: Settings,
      href: "/settings",
      color: "text-muted-foreground",
      bgColor: "bg-muted/10",
    },
  ];

  return (
    <Card className="border-border bg-card/50">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {actions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                <div className={`h-10 w-10 rounded-lg ${action.bgColor} flex items-center justify-center`}>
                  <action.icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================
// Main Dashboard Content
// ===========================================

function DashboardContent() {
  const { user, context, token, availableOrgs } = useAuth();
  const router = useRouter();
  const [gateways, setGateways] = useState<GatewayStatus[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(true);

  // Determine if in organization context
  const isOrgContext = context.type === "organization" && !!context.organizationId;
  const orgId = context.organizationId;

  // Use new resource status hook for quota data
  const { status, isLoading: statusLoading } = useResourceStatus();

  // Redirect to org dashboard when in org context
  useEffect(() => {
    if (isOrgContext && orgId) {
      const currentOrg = availableOrgs.find(o => o.id === orgId);
      const orgSlug = currentOrg?.slug || orgId;
      router.replace(`/organizations/${orgSlug}`);
    }
  }, [isOrgContext, orgId, availableOrgs, router]);

  // Fetch gateways separately (not part of resource status)
  useEffect(() => {
    // Skip fetching if in org context (we're redirecting)
    if (isOrgContext || !token) return;
    
    async function fetchGateways() {
      try {
        const response = await fetch(apiUrl("/user/gateways"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setGateways(data.data || []);
      } catch (error) {
        console.error("Failed to fetch gateways:", error);
      } finally {
        setGatewaysLoading(false);
      }
    }

    fetchGateways();
  }, [token, isOrgContext]);

  // Show nothing while redirecting to org dashboard
  if (isOrgContext) {
    return null;
  }

  // Extract stats from resource status
  const stats: DashboardStats | null = status && isPersonalStatus(status) ? {
    gateways: {
      current: status.automation.gateways.count.used,
      max: status.automation.gateways.count.isUnlimited ? -1 : (status.automation.gateways.count.limit ?? -1),
    },
    plugins: {
      current: status.automation.plugins.count.used,
      max: status.automation.plugins.count.isUnlimited ? -1 : (status.automation.plugins.count.limit ?? -1),
    },
    credits: {
      current: status.billing.credits.usage.ai.total.current,
      max: status.billing.credits.usage.ai.total.isUnlimited ? -1 : (status.billing.credits.usage.ai.total.limit ?? -1),
    },
  } : null;

  const isLoading = statusLoading || gatewaysLoading;
  const showUpgradeBanner = context.plan === "FREE";

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name || user?.email?.split("@")[0]}
        </p>
      </div>

      {/* Upgrade Banner for FREE users */}
      {showUpgradeBanner && <UpgradeBanner />}

        {/* Stats Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border bg-card/50">
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-8 w-16 bg-muted rounded" />
                    <div className="h-1.5 w-full bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              title="Gateways"
              icon={Bot}
              current={stats.gateways.current}
              max={stats.gateways.max}
              href="/gateways"
            />
            <StatsCard
              title="Plugins Installed"
              icon={Plug}
              current={stats.plugins.current}
              max={stats.plugins.max}
              href="/my-plugins"
            />
            <StatsCard
              title="Credits Used"
              icon={Sparkles}
              current={stats.credits.current}
              max={stats.credits.max}
              href="/credits"
            />
          </div>
        ) : null}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <QuickActions />

          {/* Gateway Status */}
          {isLoading ? (
            <Card className="border-border bg-card/50">
              <CardHeader>
                <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <GatewayStatusList gateways={gateways} />
          )}
        </div>

        {/* Context Info Card */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">
              {context.type === "personal" ? "Personal Workspace" : "Organization Workspace"}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {context.type === "personal"
                ? "Your private workspace and resources"
                : `You are ${context.orgRole?.replace("ORG_", "").toLowerCase()} of this organization`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Context</p>
                <p className="text-foreground capitalize">{context.type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <Badge
                  variant={context.plan === "FREE" ? "secondary" : "default"}
                  className={context.plan !== "FREE" ? "bg-purple-600" : ""}
                >
                  {context.plan}
                </Badge>
              </div>
              {context.type === "organization" && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Organization</p>
                    <p className="text-foreground">{context.organizationName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Your Role</p>
                    <p className="text-foreground">{context.orgRole?.replace("ORG_", "")}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-foreground text-sm truncate">{user?.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Member since</p>
                <p className="text-foreground">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
