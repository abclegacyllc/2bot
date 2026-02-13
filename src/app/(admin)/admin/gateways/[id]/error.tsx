"use client";

/**
 * Admin Gateway Detail - Error State
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Gateway detail page error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/gateways">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Gateways
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-6 w-6" />
              <CardTitle>Error Loading Gateway</CardTitle>
            </div>
            <CardDescription>
              {error.message || "An unexpected error occurred while loading the gateway details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={reset} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Link href="/admin/gateways">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to List
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
