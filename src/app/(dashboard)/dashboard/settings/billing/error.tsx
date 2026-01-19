"use client";

/**
 * Billing Error Page
 *
 * @module app/(dashboard)/dashboard/settings/billing/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Billing error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Billing Error"
      description="Failed to load billing information. Please try again."
    />
  );
}
