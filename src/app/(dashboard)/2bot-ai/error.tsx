"use client";

/**
 * 2Bot AI Error Page
 *
 * @module app/(dashboard)/2bot-ai/error
 */

import { ErrorFallback } from "@/components/error-boundary";
import { useEffect } from "react";

export default function TwoBotAIError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("2Bot AI error:", error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="2Bot AI Error"
      description="Failed to load 2Bot AI. Please try again."
    />
  );
}
