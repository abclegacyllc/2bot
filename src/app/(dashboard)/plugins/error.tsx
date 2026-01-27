"use client";

/**
 * Plugins Error Page
 *
 * @module app/(dashboard)/plugins/error
 */

import { useEffect } from "react";
import { ErrorFallback } from "@/components/error-boundary";

export default function PluginsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Plugins error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Plugin Store Error"
      description="Failed to load plugins. Please try again."
    />
  );
}
