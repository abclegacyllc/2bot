"use client";

/**
 * Edit Custom Plugin Page — Redirect Shim
 *
 * This page now redirects to the workspace IDE with the plugin file focused.
 * Kept for bookmark/URL backward compatibility.
 *
 * @module app/(dashboard)/plugins/[id]/edit
 */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomPlugin } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

// ===========================================
// Main Content
// ===========================================

function EditPluginRedirect() {
  const { token } = useAuth();
  const params = useParams();
  const router = useRouter();
  const pluginId = params.id as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pluginId || !token) return;

    (async () => {
      try {
        const result = await getCustomPlugin(pluginId, token);
        if (result.success && result.data) {
          const focusPath = result.data.entryFile || `plugins/${result.data.slug}.js`;
          router.replace(`/workspace?focus=${focusPath}`);
        } else {
          setError(result.error?.message || "Plugin not found");
        }
      } catch {
        setError("Failed to load plugin");
      }
    })();
  }, [pluginId, token, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-md mx-auto">
          <Card className="border-border bg-card/50">
            <CardContent className="py-12 text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => router.push("/plugins")}
                className="text-sm underline text-muted-foreground hover:text-foreground"
              >
                Back to My Plugins
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        <p className="text-sm text-muted-foreground">Redirecting to workspace editor...</p>
      </div>
    </div>
  );
}

// ===========================================
// Page Export
// ===========================================

export default function EditPluginPage() {
  return (
    <ProtectedRoute>
      <EditPluginRedirect />
    </ProtectedRoute>
  );
}
