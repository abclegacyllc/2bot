"use client";

/**
 * Organizations Error Page
 *
 * @module app/(dashboard)/dashboard/organizations/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function OrganizationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Organizations error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Organizations Error"
      description="Failed to load organizations. Please try again."
    />
  );
}
