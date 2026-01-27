"use client";

/**
 * Create Organization Page
 *
 * Form to create a new organization.
 * Auto-switches to the new organization context after creation.
 *
 * @module app/(dashboard)/organizations/create/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { apiUrl } from "@/shared/config/urls";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Create organization validation schema
const createOrgSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug must be at most 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
});

type CreateOrgInput = z.infer<typeof createOrgSchema>;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function CreateOrganizationContent() {
  const router = useRouter();
  const { token, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });

  // Watch name to auto-generate slug
  const watchedName = form.watch("name");
  const watchedSlug = form.watch("slug");
  const [slugEdited, setSlugEdited] = useState(false);

  useEffect(() => {
    // Auto-generate slug from name if slug hasn't been manually edited
    if (!slugEdited && watchedName) {
      const generatedSlug = generateSlug(watchedName);
      form.setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [watchedName, slugEdited, form]);

  const onSubmit = async (data: CreateOrgInput) => {
    if (!token) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(apiUrl("/organizations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message || "Failed to create organization"
        );
      }

      const org = result.data;

      // Refresh available orgs list for the context switcher
      await refreshUser();
      
      // Navigate directly to new org dashboard using slug for clean URL
      // Note: We don't call switchContext here because React state updates from
      // refreshUser are async and switchContext would see stale availableOrgs.
      // The org dashboard page will set the correct context on load.
      router.push(`/organizations/${org.slug}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organization"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-md mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Create Organization
            </h1>
            <p className="text-muted-foreground">
              Set up a new organization for your team
            </p>
          </div>
        </div>

        {error ? <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div> : null}

        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5" />
              Organization Details
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter the basic information for your new organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">
                        Organization Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Acme Corporation"
                          disabled={isSubmitting}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground">
                        The display name for your organization
                      </FormDescription>
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
                          placeholder="acme-corp"
                          disabled={isSubmitting}
                          className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                          onChange={(e) => {
                            setSlugEdited(true);
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormDescription className="text-muted-foreground">
                        Unique identifier for your organization: <span className="text-primary font-mono">{watchedSlug || "your-slug"}</span>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted/50 border border-border rounded-md p-4">
                  <h4 className="text-sm font-medium text-foreground mb-2">
                    What happens next?
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• You will be set as the Owner of this organization</li>
                    <li>• Your context will switch to the new organization</li>
                    <li>• You can invite team members from settings</li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Building2 className="mr-2 h-4 w-4" />
                      Create Organization
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CreateOrganizationPage() {
  return (
    <ProtectedRoute>
      <CreateOrganizationContent />
    </ProtectedRoute>
  );
}
