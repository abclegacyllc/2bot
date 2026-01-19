"use client";

/**
 * Gateway Detail Error Page
 *
 * @module app/(dashboard)/dashboard/gateways/[id]/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function GatewayDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Gateway detail error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Gateway Error"
      description="Failed to load gateway details. Please try again."
    />
  );
}
