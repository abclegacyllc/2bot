"use client";

/**
 * Gateway Detail Page
 *
 * Shows gateway details, allows editing configuration,
 * testing connection, and deleting the gateway.
 *
 * @module app/dashboard/gateways/[id]
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { GatewayStatusIndicator } from "@/components/gateways/gateway-status";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SafeGateway } from "@/modules/gateway/gateway.types";

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const LoadingIcon = () => (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const BotIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

/**
 * Get icon for gateway type
 */
function getGatewayIcon(type: string) {
  switch (type) {
    case "TELEGRAM_BOT":
      return <BotIcon />;
    case "AI":
      return <AIIcon />;
    default:
      return <BotIcon />;
  }
}

/**
 * Get display name for gateway type
 */
function getGatewayTypeName(type: string): string {
  switch (type) {
    case "TELEGRAM_BOT":
      return "Telegram Bot";
    case "AI":
      return "AI Provider";
    case "WEBHOOK":
      return "Webhook";
    default:
      return type;
  }
}

/**
 * Delete confirmation dialog
 */
function DeleteConfirmDialog({
  gatewayName,
  onConfirm,
  onCancel,
  loading,
}: {
  gatewayName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="border-slate-800 bg-slate-900 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-white">Delete Gateway</CardTitle>
          <CardDescription className="text-slate-400">
            Are you sure you want to delete{" "}
            <span className="font-medium text-white">{gatewayName}</span>? This
            action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border-slate-700 text-slate-300"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {loading ? <LoadingIcon /> : <TrashIcon />}
            <span className="ml-2">{loading ? "Deleting..." : "Delete"}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-slate-800" />
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-800 rounded" />
          <div className="h-4 w-32 bg-slate-800 rounded" />
        </div>
      </div>
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="p-6 space-y-4">
          <div className="h-4 w-24 bg-slate-800 rounded" />
          <div className="h-10 w-full bg-slate-800 rounded" />
          <div className="h-4 w-24 bg-slate-800 rounded" />
          <div className="h-10 w-full bg-slate-800 rounded" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Gateway detail content
 */
function GatewayDetailContent() {
  const router = useRouter();
  const params = useParams();
  const gatewayId = params.id as string;
  const { token } = useAuth();

  const [gateway, setGateway] = useState<SafeGateway | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch gateway
  useEffect(() => {
    async function fetchGateway() {
      if (!token || !gatewayId) return;

      try {
        const response = await fetch(
          `http://localhost:3001/api/gateways/${gatewayId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Gateway not found");
          }
          throw new Error("Failed to fetch gateway");
        }

        const data = await response.json();
        setGateway(data.data);
        setName(data.data.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchGateway();
  }, [token, gatewayId]);

  // Save changes
  const handleSave = async () => {
    if (!gateway) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch(
        `http://localhost:3001/api/gateways/${gatewayId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to save");
      }

      const data = await response.json();
      setGateway(data.data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(
        `http://localhost:3001/api/gateways/${gatewayId}/test`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({ success: true, message: "Connection successful!" });
      } else {
        setTestResult({
          success: false,
          message: data.error?.message || "Connection failed",
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  // Delete gateway
  const handleDelete = async () => {
    setDeleting(true);

    try {
      const response = await fetch(
        `http://localhost:3001/api/gateways/${gatewayId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || "Failed to delete");
      }

      router.push("/dashboard/gateways");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-2xl mx-auto">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (error || !gateway) {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-900 bg-red-950/20">
            <CardContent className="py-8 text-center">
              <p className="text-red-400">{error || "Gateway not found"}</p>
              <Link href="/dashboard/gateways">
                <Button variant="outline" className="mt-4 border-slate-700">
                  Back to Gateways
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/gateways"
            className="mt-1 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeftIcon />
          </Link>
          <div className="flex items-center gap-4 flex-grow">
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              {getGatewayIcon(gateway.type)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{gateway.name}</h1>
              <p className="text-slate-400">{getGatewayTypeName(gateway.type)}</p>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white text-lg">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <GatewayStatusIndicator
              status={gateway.status}
              lastConnectedAt={gateway.lastConnectedAt}
              lastError={gateway.lastError}
            />

            {/* Test Connection Button */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <Button
                onClick={handleTestConnection}
                disabled={testing}
                variant="outline"
                className="border-slate-700 text-slate-300"
              >
                {testing ? <LoadingIcon /> : <RefreshIcon />}
                <span className="ml-2">
                  {testing ? "Testing..." : "Test Connection"}
                </span>
              </Button>

              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-md ${
                    testResult.success
                      ? "bg-green-950/20 border border-green-900/30"
                      : "bg-red-950/20 border border-red-900/30"
                  }`}
                >
                  <p
                    className={`text-sm ${
                      testResult.success ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {testResult.message}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white text-lg">Configuration</CardTitle>
            <CardDescription className="text-slate-400">
              Update your gateway settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white">
                Gateway Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-900 border-slate-800 text-white"
              />
            </div>

            {/* Credential info (masked) */}
            {gateway.credentialInfo && (
              <div className="space-y-2">
                <Label className="text-white">Credentials</Label>
                <div className="bg-slate-900 border border-slate-800 rounded-md p-3 text-sm text-slate-400">
                  {gateway.type === "TELEGRAM_BOT" && gateway.credentialInfo.hasBotToken && (
                    <p>Bot Token: ••••••••••••••••</p>
                  )}
                  {gateway.type === "AI" && gateway.credentialInfo.provider && (
                    <p>Provider: {gateway.credentialInfo.provider}</p>
                  )}
                  {gateway.type === "AI" && gateway.credentialInfo.hasApiKey && (
                    <p>API Key: ••••••••••••••••</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Credentials are encrypted and cannot be displayed
                  </p>
                </div>
              </div>
            )}

            {saveError && (
              <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
                <p className="text-sm text-red-400">{saveError}</p>
              </div>
            )}

            {saveSuccess && (
              <div className="bg-green-950/20 border border-green-900/30 rounded-md p-3">
                <p className="text-sm text-green-400">Changes saved successfully!</p>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || name === gateway.name}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? <LoadingIcon /> : <SaveIcon />}
              <span className="ml-2">{saving ? "Saving..." : "Save Changes"}</span>
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-900/30 bg-red-950/10">
          <CardHeader>
            <CardTitle className="text-red-400 text-lg">Danger Zone</CardTitle>
            <CardDescription className="text-slate-400">
              Irreversible actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Delete Gateway</p>
                <p className="text-sm text-slate-400">
                  Permanently delete this gateway and all associated data
                </p>
              </div>
              <Button
                onClick={() => setShowDeleteDialog(true)}
                variant="outline"
                className="border-red-900 text-red-400 hover:bg-red-950"
              >
                <TrashIcon />
                <span className="ml-2">Delete</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Back link */}
        <div className="pt-4">
          <Link
            href="/dashboard/gateways"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to Gateways
          </Link>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          gatewayName={gateway.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}
    </div>
  );
}

/**
 * Gateway detail page with auth protection
 */
export default function GatewayDetailPage() {
  return (
    <ProtectedRoute>
      <GatewayDetailContent />
    </ProtectedRoute>
  );
}
