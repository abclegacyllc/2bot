"use client";

/**
 * Gateways Error Page
 *
 * @module app/(dashboard)/gateways/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function GatewaysError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Gateways error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Gateway Error"
      description="Failed to load gateways. Please try again."
    />
  );
}
