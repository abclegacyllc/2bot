"use client";

/**
 * Organization Billing Error Page
 *
 * @module app/(dashboard)/organizations/billing/error
 */

import { ErrorFallback } from "@/components/error-boundary";
import { useEffect } from "react";

export default function OrganizationBillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Organization billing error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Organization Billing Error"
      description="Failed to load organization billing information. Please try again."
    />
  );
}
