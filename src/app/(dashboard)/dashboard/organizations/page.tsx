"use client";

/**
 * Organizations List Page
 *
 * Lists all organizations the user belongs to or can manage.
 * URL: /dashboard/organizations
 *
 * @module app/(dashboard)/dashboard/organizations/page
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
    ArrowRight,
    Building2,
    Loader2,
    Plus,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount?: number;
  role: string;
}

export default function OrganizationsListPage() {
  const { token, context } = useAuth();
  
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch organizations");
      }

      const data = await res.json();
      setOrganizations(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

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
            <CardDescription className="text-red-300">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchOrganizations} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizations</h1>
          <p className="text-muted-foreground">
            Manage your organizations and team access
          </p>
        </div>
        <Link href="/dashboard/organizations/new">
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            New Organization
          </Button>
        </Link>
      </div>

      {/* Organizations List */}
      {organizations.length === 0 ? (
        <Card className="bg-muted/50 border-border">
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Organizations
            </h3>
            <p className="text-muted-foreground mb-4">
              You don&apos;t belong to any organizations yet.
            </p>
            <Link href="/dashboard/organizations/new">
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {organizations.map((org) => (
            <Card
              key={org.id}
              className="bg-muted/50 border-border hover:border-border transition-colors"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground">
                        {org.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge
                          variant={org.plan === "FREE" ? "secondary" : "default"}
                          className={
                            org.plan !== "FREE" ? "bg-purple-600/20 text-purple-400" : ""
                          }
                        >
                          {org.plan}
                        </Badge>
                        <span className="text-sm text-muted-foreground capitalize">
                          {org.role.toLowerCase()}
                        </span>
                        {org.memberCount !== undefined && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {org.memberCount} member{org.memberCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Link href={`/dashboard/organizations/${org.id}`}>
                    <Button
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      View
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Current Context Info */}
      {context.type === "organization" && (
        <Card className="bg-muted/50 border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Current Context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              You are currently working in the context of{" "}
              <span className="font-medium text-purple-400">
                {context.organizationName}
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Use the context switcher in the header to change organizations.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
