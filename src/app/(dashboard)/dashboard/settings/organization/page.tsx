"use client";

/**
 * Organization Settings Page
 *
 * Manage organization details, members, and danger zone actions.
 * Only visible when in organization context.
 *
 * @module app/dashboard/settings/organization/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Building2, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Validation schema for org update
const updateOrgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
});

type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

// Organization info from API
interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  plan: "FREE" | "PRO" | "ENTERPRISE";
  memberCount: number;
  maxMembers: number | null;
  createdAt: string;
}

function OrganizationSettingsContent() {
  const router = useRouter();
  const { context, token } = useAuth();
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const form = useForm<UpdateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  // Redirect if not in org context
  useEffect(() => {
    if (context.type !== "organization") {
      router.push("/dashboard/settings");
    }
  }, [context, router]);

  // Fetch org details
  useEffect(() => {
    async function fetchOrg() {
      if (!context.organizationId || !token) return;

      try {
        setIsLoading(true);
        // Using URL-based routes (Phase 6.7) - /api/orgs/:orgId for org resources
        const response = await fetch(
          `/api/orgs/${context.organizationId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch organization");
        }

        const result = await response.json();
        const orgData = result.data;
        setOrg(orgData);
        form.reset({
          name: orgData.name,
          slug: orgData.slug,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load organization");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrg();
  }, [context.organizationId, token, form]);

  const canEdit = context.orgRole === "ORG_OWNER" || context.orgRole === "ORG_ADMIN";
  const isOwner = context.orgRole === "ORG_OWNER";

  const onSubmit = async (data: UpdateOrgInput) => {
    if (!context.organizationId || !token) return;

    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch(
        `/api/orgs/${context.organizationId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to update organization");
      }

      const result = await response.json();
      setOrg(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!context.organizationId || !token || deleteConfirm !== org?.name) return;

    try {
      setIsDeleting(true);
      setError(null);

      const response = await fetch(
        `/api/orgs/${context.organizationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to delete organization");
      }

      // Redirect to dashboard (will auto-switch to personal context)
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete organization");
      setIsDeleting(false);
    }
  };

  if (context.type !== "organization") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !org) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Organization Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization settings and members
          </p>
        </div>

        {error ? <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div> : null}

        {/* General Info */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              General Information
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Basic organization details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Organization Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!canEdit || isSaving}
                          className="bg-muted border-border text-foreground"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">URL Slug</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={!canEdit || isSaving}
                          className="bg-muted border-border text-foreground"
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground">
                        Used in URLs: 2bot.io/org/{field.value || "slug"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <Badge
                      variant={org?.plan === "FREE" ? "secondary" : "default"}
                      className="mt-1"
                    >
                      {org?.plan}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="text-foreground">
                      {org?.createdAt
                        ? new Date(org.createdAt).toLocaleDateString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>

                {canEdit ? <Button
                    type="submit"
                    disabled={isSaving}
                    className="w-full"
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                  </Button> : null}
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Members & Departments Quick Links */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Users className="h-5 w-5" />
                Members
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {org?.memberCount} member{org?.memberCount !== 1 ? "s" : ""} in this organization
                {org?.maxMembers ? ` (max ${org.maxMembers})` : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/settings/organization/members">
                <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                  Manage Members
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Departments
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Organize your team into departments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/settings/organization/departments">
                <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                  Manage Departments
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                📊 Resources
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage department quotas and resource limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/settings/organization/resources">
                <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                  Manage Resources
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                📈 Monitoring
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                View organization activity and usage metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard/settings/organization/monitoring">
                <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted">
                  View Monitoring
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Danger Zone - Owner Only */}
        {isOwner ? <>
            <Separator className="bg-muted" />
            
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Irreversible actions for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      Delete Organization
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border">
                    <DialogHeader>
                      <DialogTitle className="text-foreground">Delete Organization</DialogTitle>
                      <DialogDescription className="text-muted-foreground">
                        This action cannot be undone. This will permanently delete the
                        organization <strong className="text-foreground">{org?.name}</strong> and
                        remove all members.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <p className="text-sm text-muted-foreground">
                        Type <strong className="text-foreground">{org?.name}</strong> to confirm:
                      </p>
                      <Input
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                        placeholder="Organization name"
                        className="bg-muted border-border text-foreground"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deleteConfirm !== org?.name || isDeleting}
                      >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Delete Organization
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </> : null}
      </div>
    </div>
  );
}

export default function OrganizationSettingsPage() {
  return (
    <ProtectedRoute>
      <OrganizationSettingsContent />
    </ProtectedRoute>
  );
}
