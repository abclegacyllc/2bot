"use client";

/**
 * Organization Departments List Page
 *
 * Lists all departments in an organization with quick stats.
 * URL: /organizations/[orgSlug]/departments
 *
 * @module app/(dashboard)/organizations/[orgSlug]/departments/page
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
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import {
    ArrowLeft,
    Layers,
    Loader2,
    Plus,
    Users
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Department {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isActive: boolean;
}

export default function OrganizationDepartmentsPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { orgId, orgSlug, orgName, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDepartments = useCallback(async () => {
    if (!token || !orgId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Using URL-based routes (Phase 6.7) - /orgs/:orgId/departments for org departments
      const res = await fetch(apiUrl(`/orgs/${orgId}/departments`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Organization not found");
        }
        if (res.status === 403) {
          throw new Error("You don't have access to this organization");
        }
        throw new Error("Failed to fetch departments");
      }

      const data = await res.json();
      setDepartments(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    if (isFound && orgId) {
      fetchDepartments();
    }
  }, [isFound, orgId, fetchDepartments]);

  // Show loading while resolving org
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show not found if org doesn't exist
  if (!isFound || !orgId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="border-border bg-card/50">
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Organization not found</h3>
            <p className="text-muted-foreground mb-4">
              The organization you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/">
              <Button variant="outline" className="border-border">
                ← Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              onClick={() => router.push(buildOrgUrl("/"))}
              className="border-border"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Link href={buildOrgUrl("/")} className="hover:text-foreground">
              {orgName || "Organization"}
            </Link>
            <span>/</span>
            <span className="text-foreground">Departments</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Layers className="h-8 w-8" />
            Departments
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage organization departments and their resources
          </p>
        </div>
        <Link href={buildOrgUrl("/departments/new")}>
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Plus className="mr-2 h-4 w-4" />
            Create Department
          </Button>
        </Link>
      </div>

      {/* Departments List */}
      {departments.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="py-12 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Departments Yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Create departments to organize your team members
            </p>
            <Link href={buildOrgUrl("/departments/new")}>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="mr-2 h-4 w-4" />
                Create First Department
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((dept) => (
            <Link
              key={dept.id}
              href={buildOrgUrl(`/departments/${dept.id}`)}
            >
              <Card className="border-border bg-card/50 hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">{dept.name}</CardTitle>
                    <Badge
                      variant={dept.isActive ? "default" : "secondary"}
                      className={dept.isActive ? "bg-green-600" : ""}
                    >
                      {dept.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {dept.description && (
                    <CardDescription className="text-muted-foreground">
                      {dept.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{dept.memberCount} members</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
