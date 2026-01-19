"use client";

/**
 * Dashboard Error Page
 *
 * Shown when an error occurs within the dashboard route segment.
 * Provides retry functionality.
 *
 * @module app/(dashboard)/dashboard/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service (e.g., Sentry)
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Dashboard Error"
      description="Failed to load the dashboard. Please try again."
    />
  );
}
