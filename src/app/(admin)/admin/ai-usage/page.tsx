"use client";

/**
 * Admin AI Usage Dashboard
 *
 * Platform-wide AI usage analytics:
 * - Total requests and credits
 * - Breakdown by capability, model, provider  
 * - Top users and organizations
 *
 * @module app/(admin)/admin/ai-usage/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminApiUrl } from "@/shared/config/urls";
import {
    Brain,
    Building2,
    Cpu,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface AIUsage {
  period: string;
  totalRequests: number;
  totalCredits: number;
  byCapability: Array<{ capability: string; requests: number; credits: number }>;
  byModel: Array<{ model: string; requests: number; credits: number }>;
}

interface AIUsageBreakdown {
  byModel: Array<{
    model: string;
    capability: string;
    requests: number;
    credits: number;
  }>;
  byUser: Array<{
    userId: string;
    userEmail: string;
    userName: string | null;
    requests: number;
    credits: number;
  }>;
  byOrganization: Array<{
    organizationId: string;
    organizationName: string;
    requests: number;
    credits: number;
  }>;
}

const CAPABILITY_COLORS: Record<string, string> = {
  "text-generation": "bg-blue-500/10 text-blue-500",
  "image-generation": "bg-purple-500/10 text-purple-500",
  "speech-to-text": "bg-green-500/10 text-green-500",
  "text-to-speech": "bg-orange-500/10 text-orange-500",
  "embeddings": "bg-cyan-500/10 text-cyan-500",
  "moderation": "bg-red-500/10 text-red-500",
};

export default function AdminAIUsagePage() {
  const { token } = useAuth();
  const [usage, setUsage] = useState<AIUsage | null>(null);
  const [breakdown, setBreakdown] = useState<AIUsageBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const [usageRes, breakdownRes] = await Promise.all([
        fetch(adminApiUrl('/ai-usage'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(adminApiUrl('/ai-usage/breakdown?limit=10'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!usageRes.ok || !breakdownRes.ok) {
        throw new Error('Failed to fetch AI usage data');
      }

      const usageData = await usageRes.json();
      const breakdownData = await breakdownRes.json();

      setUsage(usageData.data);
      setBreakdown(breakdownData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading AI usage data...</div>
      </div>
    );
  }

  if (!usage || !breakdown) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">No usage data available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-6 w-6 text-purple-500" />
          AI Usage Dashboard
        </h1>
        <p className="text-muted-foreground">
          Platform-wide AI usage analytics for {usage.period}
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground">
                {usage.totalRequests.toLocaleString()}
              </div>
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              AI API calls this period
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground">
                {usage.totalCredits.toLocaleString()}
              </div>
              <Zap className="h-5 w-5 text-yellow-500" />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Credits consumed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="capabilities" className="w-full">
        <TabsList>
          <TabsTrigger value="capabilities">
            <Cpu className="h-4 w-4 mr-2" />
            Capabilities
          </TabsTrigger>
          <TabsTrigger value="models">
            <Brain className="h-4 w-4 mr-2" />
            Models
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Top Users
          </TabsTrigger>
          <TabsTrigger value="organizations">
            <Building2 className="h-4 w-4 mr-2" />
            Top Orgs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="capabilities">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Capability</CardTitle>
              <CardDescription>AI capabilities used this period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usage.byCapability.map((cap) => (
                  <div key={cap.capability} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge
                        className={
                          CAPABILITY_COLORS[cap.capability] || "bg-gray-500/10 text-gray-500"
                        }
                      >
                        {cap.capability}
                      </Badge>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${(cap.requests / usage.totalRequests) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-semibold text-foreground">
                        {cap.requests.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {cap.credits.toLocaleString()} credits
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Model</CardTitle>
              <CardDescription>Top models by credit consumption</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Model
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Capability
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Requests
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Credits
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.byModel.map((model, idx) => (
                      <tr key={`${model.model}-${idx}`} className="border-b border-border">
                        <td className="py-3 px-4 font-medium text-foreground">
                          {model.model}
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={CAPABILITY_COLORS[model.capability] || "bg-gray-500/10 text-gray-500"}>
                            {model.capability}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right text-foreground">
                          {model.requests.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-foreground font-semibold">
                          {model.credits.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Top Users</CardTitle>
              <CardDescription>Highest AI usage by user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
             <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        User
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Requests
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Credits
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.byUser.map((user) => (
                      <tr key={user.userId} className="border-b border-border">
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium text-foreground">
                              {user.userName || user.userEmail}
                            </div>
                            {user.userName ? <div className="text-sm text-muted-foreground">
                                {user.userEmail}
                              </div> : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-foreground">
                          {user.requests.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-foreground font-semibold">
                          {user.credits.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organizations">
          <Card>
            <CardHeader>
              <CardTitle>Top Organizations</CardTitle>
              <CardDescription>Highest AI usage by organization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Organization
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Requests
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                        Credits
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.byOrganization.map((org) => (
                      <tr key={org.organizationId} className="border-b border-border">
                        <td className="py-3 px-4 font-medium text-foreground">
                          {org.organizationName}
                        </td>
                        <td className="py-3 px-4 text-right text-foreground">
                          {org.requests.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-foreground font-semibold">
                          {org.credits.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
