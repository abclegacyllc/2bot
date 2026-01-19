"use client";

/**
 * Organization Overview Page
 *
 * Shows organization details, quick stats, and navigation to sub-sections.
 * URL: /dashboard/organizations/[orgId]
 *
 * @module app/(dashboard)/dashboard/organizations/[orgId]/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Activity,
    ArrowLeft,
    Building2,
    CreditCard,
    Layers,
    Loader2,
    Settings,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  departmentCount: number;
  createdAt: string;
}

export default function OrganizationOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const { token, context } = useAuth();
  
  const orgId = params.orgId as string;
  
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!token || !orgId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Organization not found");
        }
        if (res.status === 403) {
          throw new Error("You don't have access to this organization");
        }
        throw new Error("Failed to fetch organization");
      }

      const data = await res.json();
      setOrganization(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-red-800 bg-red-900/20">
          <CardHeader>
            <CardTitle className="text-red-400">Error</CardTitle>
            <CardDescription className="text-red-300">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="border-border"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!organization) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{organization.name}</h1>
            <p className="text-muted-foreground">Organization Overview</p>
          </div>
        </div>
        <Badge
          variant={organization.plan === "FREE" ? "secondary" : "default"}
          className={organization.plan !== "FREE" ? "bg-purple-600" : ""}
        >
          {organization.plan}
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-foreground">
              {organization.memberCount}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Departments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold text-foreground">
              {organization.departmentCount}
            </span>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge
              variant={organization.plan === "FREE" ? "secondary" : "default"}
              className={organization.plan !== "FREE" ? "bg-purple-600" : ""}
            >
              {organization.plan}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href={`/dashboard/organizations/${orgId}/departments`}>
          <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Departments
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage departments and resource allocation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {organization.departmentCount} departments
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/settings/organization/members`}>
          <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Users className="h-5 w-5" />
                Members
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage organization members and roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {organization.memberCount} members
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/dashboard/settings/organization`}>
          <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Settings
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Organization settings and configuration
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href={`/dashboard/billing`}>
          <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Billing
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage subscription and billing
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
