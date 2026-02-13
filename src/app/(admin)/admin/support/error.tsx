"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function AdminSupportError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="bg-card border-red-800 p-6">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle className="h-6 w-6" />
          <span>{error.message || "Failed to load support page"}</span>
        </div>
      </Card>
    </div>
  );
}
