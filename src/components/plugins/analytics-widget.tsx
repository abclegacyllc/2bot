"use client";

/**
 * Analytics Widget Component
 *
 * Displays analytics statistics for a user's analytics plugin installation.
 * Shows totals, today's stats, daily trends, and top users/chats.
 *
 * @module components/plugins/analytics-widget
 */

import {
    AlertCircle,
    BarChart3,
    MessageCircle,
    MessageSquare,
    Minus,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

// ===========================================
// Types
// ===========================================

interface AnalyticsSummary {
  userPluginId: string;
  totals: {
    messagesReceived: number;
    messagesSent: number;
    uniqueUsers: number;
    uniqueChats: number;
  };
  today: {
    messages: number;
    uniqueUsers: number;
  };
  dailyStats: Array<{
    date: string;
    messagesReceived: number;
    messagesSent: number;
    uniqueUsers: number;
  }>;
  hourlyStats: Array<{
    hour: string;
    messages: number;
  }>;
  topUsers: Array<{
    telegramUserId: number;
    username?: string;
    firstName: string;
    messageCount: number;
  }>;
  topChats: Array<{
    chatId: number;
    chatType: string;
    chatTitle?: string;
    messageCount: number;
  }>;
}

interface AnalyticsWidgetProps {
  /** User plugin installation ID */
  userPluginId: string;
  /** Optional title override */
  title?: string;
  /** Optional class name */
  className?: string;
  /** Compact mode (less details) */
  compact?: boolean;
}

// ===========================================
// Helper Components
// ===========================================

/**
 * Stat card component
 */
function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm font-medium">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            {trendLabel ? (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                {trend === "up" ? <TrendingUp className="h-3 w-3 text-green-500" /> : null}
                {trend === "down" ? <TrendingDown className="h-3 w-3 text-red-500" /> : null}
                {trend === "neutral" ? <Minus className="h-3 w-3 text-gray-500" /> : null}
                {trendLabel}
              </p>
            ) : null}
          </div>
          <div className="bg-primary/10 rounded-full p-3">
            <Icon className="text-primary h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Simple bar chart using divs
 */
function SimpleBarChart({
  data,
  labelKey,
  valueKey,
  maxBars = 7,
}: {
  data: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
  maxBars?: number;
}) {
  const displayData = data.slice(0, maxBars).reverse();
  const maxValue = Math.max(...displayData.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div className="flex h-32 items-end justify-between gap-1">
      {displayData.map((item, index) => {
        const value = Number(item[valueKey]) || 0;
        const height = (value / maxValue) * 100;
        const label = String(item[labelKey] || "");
        const shortLabel = label.slice(-5); // Show last 5 chars (e.g., "01-16")

        return (
          <div key={index} className="flex flex-1 flex-col items-center">
            <div className="flex h-24 w-full items-end justify-center">
              <div
                className="bg-primary/80 hover:bg-primary w-full max-w-8 rounded-t transition-colors"
                style={{ height: `${Math.max(height, 4)}%` }}
                title={`${label}: ${value}`}
              />
            </div>
            <span className="text-muted-foreground mt-1 text-xs">{shortLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Top list component
 */
function TopList({
  title,
  items,
  labelKey,
  valueKey,
  valueLabel = "messages",
  emptyMessage = "No data yet",
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
  valueLabel?: string;
  emptyMessage?: string;
}) {
  return (
    <div>
      <h4 className="mb-2 font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">#{index + 1}</span>
                <span className="text-sm font-medium">
                  {String(item[labelKey]) || "Unknown"}
                </span>
              </div>
              <span className="text-muted-foreground text-sm">
                {Number(item[valueKey]).toLocaleString()} {valueLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

/**
 * Analytics Widget
 *
 * Fetches and displays analytics data for a plugin installation.
 */
export function AnalyticsWidget({
  userPluginId,
  title = "Channel Analytics",
  className,
  compact = false,
}: AnalyticsWidgetProps) {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch analytics data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/plugins/user/plugins/${userPluginId}/analytics`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch analytics");
      }

      const result = await response.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userPluginId]);

  // Calculate trend for today
  const getTrend = (): { trend: "up" | "down" | "neutral"; label: string } => {
    if (!data || data.dailyStats.length < 2) {
      return { trend: "neutral", label: "No previous data" };
    }

    const todayMessages = data.today.messages;
    const yesterdayStats = data.dailyStats[1];
    if (!yesterdayStats) {
      return { trend: "neutral", label: "No previous data" };
    }

    const yesterdayMessages = yesterdayStats.messagesReceived + yesterdayStats.messagesSent;
    
    if (todayMessages > yesterdayMessages) {
      const percent = yesterdayMessages > 0 
        ? Math.round(((todayMessages - yesterdayMessages) / yesterdayMessages) * 100)
        : 100;
      return { trend: "up", label: `+${percent}% vs yesterday` };
    } else if (todayMessages < yesterdayMessages) {
      const percent = Math.round(((yesterdayMessages - todayMessages) / yesterdayMessages) * 100);
      return { trend: "down", label: `-${percent}% vs yesterday` };
    }
    return { trend: "neutral", label: "Same as yesterday" };
  };

  // Loading state
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="text-muted-foreground h-6 w-6 animate-spin" />
            <span className="text-muted-foreground ml-2">Loading analytics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="mb-2 h-8 w-8 text-red-500" />
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!data) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground py-12 text-center">
            No analytics data available yet. Start using your bot to see statistics!
          </div>
        </CardContent>
      </Card>
    );
  }

  const { trend, label: trendLabel } = getTrend();

  // Compact view
  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              {title}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={fetchData} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs">Total Messages</p>
              <p className="text-lg font-bold">
                {(data.totals.messagesReceived + data.totals.messagesSent).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Unique Users</p>
              <p className="text-lg font-bold">{data.totals.uniqueUsers.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Today</p>
              <p className="text-lg font-bold">{data.today.messages.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Unique Chats</p>
              <p className="text-lg font-bold">{data.totals.uniqueChats.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full view
  return (
    <div className={className}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="h-6 w-6" />
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">
            Last updated: {new Date(data.totals.messagesReceived ? Date.now() : 0).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Messages Received"
          value={data.totals.messagesReceived}
          icon={MessageSquare}
        />
        <StatCard
          label="Messages Sent"
          value={data.totals.messagesSent}
          icon={MessageCircle}
        />
        <StatCard
          label="Unique Users"
          value={data.totals.uniqueUsers}
          icon={Users}
        />
        <StatCard
          label="Today's Messages"
          value={data.today.messages}
          icon={TrendingUp}
          trend={trend}
          trendLabel={trendLabel}
        />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid gap-6 md:grid-cols-2">
        {/* Daily Messages Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Messages (Last 7 Days)</CardTitle>
            <CardDescription>Message volume over the past week</CardDescription>
          </CardHeader>
          <CardContent>
            {data.dailyStats.length > 0 ? (
              <SimpleBarChart
                data={data.dailyStats.map((d) => ({
                  ...d,
                  total: d.messagesReceived + d.messagesSent,
                }))}
                labelKey="date"
                valueKey="total"
              />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No daily data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Hourly Messages Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hourly Activity (Last 24 Hours)</CardTitle>
            <CardDescription>Message activity by hour</CardDescription>
          </CardHeader>
          <CardContent>
            {data.hourlyStats.length > 0 ? (
              <SimpleBarChart
                data={data.hourlyStats}
                labelKey="hour"
                valueKey="messages"
                maxBars={12}
              />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No hourly data yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Lists Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Users</CardTitle>
            <CardDescription>Most active users by message count</CardDescription>
          </CardHeader>
          <CardContent>
            <TopList
              title=""
              items={data.topUsers.map((u) => ({
                label: u.username ? `@${u.username}` : u.firstName,
                count: u.messageCount,
              }))}
              labelKey="label"
              valueKey="count"
              emptyMessage="No user data yet"
            />
          </CardContent>
        </Card>

        {/* Top Chats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Chats</CardTitle>
            <CardDescription>Most active chats/channels</CardDescription>
          </CardHeader>
          <CardContent>
            <TopList
              title=""
              items={data.topChats.map((c) => ({
                label: c.chatTitle || `${c.chatType} ${c.chatId}`,
                count: c.messageCount,
              }))}
              labelKey="label"
              valueKey="count"
              emptyMessage="No chat data yet"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsWidget;
