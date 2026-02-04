"use client";

/**
 * Create Department Page
 *
 * Form for creating a new department within an organization.
 * URL: /organizations/[orgSlug]/departments/create
 *
 * @module app/(dashboard)/organizations/[orgSlug]/departments/create/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useOrganization, useOrgUrls } from "@/hooks/use-organization";
import { apiUrl } from "@/shared/config/urls";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function CreateDepartmentPage() {
  const router = useRouter();
  const { token } = useAuth();
  const { orgId, orgSlug, isFound, isLoading: orgLoading } = useOrganization();
  const { buildOrgUrl } = useOrgUrls();
  const { can } = useOrgPermissions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Permission check - only admins can create departments
  const canCreateDepartment = can("org:departments:create");
  
  useEffect(() => {
    if (!orgLoading && isFound && !canCreateDepartment) {
      router.push(buildOrgUrl("/departments"));
    }
  }, [orgLoading, isFound, canCreateDepartment, router, buildOrgUrl]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!token || !orgId) {
      setError("Authentication required");
      return;
    }

    if (!name.trim()) {
      setError("Department name is required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(apiUrl(`/orgs/${orgId}/departments`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create department");
      }

      // Success - redirect to departments list
      router.push(buildOrgUrl("/departments"));
    } catch (err) {
      console.error("Failed to create department:", err);
      setError(err instanceof Error ? err.message : "Failed to create department");
    } finally {
      setIsCreating(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isFound) {
    return (
      <Card className="border-red-900 bg-red-950/20">
        <CardHeader>
          <CardTitle className="text-red-400">Organization Not Found</CardTitle>
          <CardDescription>
            The organization you're looking for doesn't exist or you don't have access.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={buildOrgUrl("/departments")}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Layers className="h-8 w-8" />
            Create Department
          </h1>
          <p className="text-muted-foreground mt-1">
            Add a new department to organize your team
          </p>
        </div>
      </div>

      {/* Form */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle>Department Details</CardTitle>
          <CardDescription>
            Enter the basic information for your new department
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Department Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g., Engineering, Sales, Marketing"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                required
                className="bg-background"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe the department's role and responsibilities..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isCreating}
                rows={4}
                className="bg-background resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-md bg-red-950/20 border border-red-900">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                type="submit"
                disabled={isCreating || !name.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Layers className="mr-2 h-4 w-4" />
                    Create Department
                  </>
                )}
              </Button>
              <Link href={buildOrgUrl("/departments")}>
                <Button type="button" variant="outline" disabled={isCreating}>
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
