"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function AdminUserDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin user detail error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/users">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Error Loading User</h1>
          <p className="text-muted-foreground">
            Something went wrong while loading user details
          </p>
        </div>
      </div>

      {/* Error Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Failed to Load User</CardTitle>
          </div>
          <CardDescription>
            {error.message || "An unexpected error occurred"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.digest ? <div className="text-sm text-muted-foreground">
              <span className="font-medium">Error ID:</span>{" "}
              <code className="bg-muted px-1 rounded">{error.digest}</code>
            </div> : null}
          <div className="flex gap-2">
            <Button onClick={reset}>Try Again</Button>
            <Button variant="outline" asChild>
              <Link href="/admin/users">Back to Users</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
