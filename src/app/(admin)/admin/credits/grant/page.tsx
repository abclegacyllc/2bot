"use client";

/**
 * Admin Grant Credits Page
 *
 * Manual credit grant tool for admins:
 * - Search users by email or name
 * - Select a user (or enter an org ID)
 * - Specify amount + optional description
 * - Confirms before submitting
 *
 * @module app/(admin)/admin/credits/grant/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApiUrl } from "@/shared/config/urls";
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Loader2,
  Search,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

interface UserResult {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
}

type GrantTarget = { type: "user"; user: UserResult } | { type: "org"; orgId: string };

type SubmitState = "idle" | "confirming" | "submitting" | "success" | "error";

// =============================================================================
// Component
// =============================================================================

export default function GrantCreditsPage() {
  const { token } = useAuth();

  // ── User search ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Selection ──
  const [target, setTarget] = useState<GrantTarget | null>(null);
  const [manualOrgId, setManualOrgId] = useState("");
  const [useOrgMode, setUseOrgMode] = useState(false);

  // ── Grant form ──
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  // ── Submission ──
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [grantedTxId, setGrantedTxId] = useState<string | null>(null);

  // ─── Search users ──────────────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string) => {
      if (!token || q.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(
          adminApiUrl(`/users?search=${encodeURIComponent(q)}&limit=10`),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error("Failed to search users");
        const data = await res.json();
        setSearchResults(data.data?.users ?? []);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearchLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(() => void doSearch(searchQuery), 350);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, doSearch]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSelectUser = (user: UserResult) => {
    setTarget({ type: "user", user });
    setSearchQuery("");
    setSearchResults([]);
    setUseOrgMode(false);
  };

  const handleClearTarget = () => {
    setTarget(null);
    setManualOrgId("");
    setSubmitState("idle");
    setSubmitError(null);
    setGrantedTxId(null);
  };

  const handleConfirm = () => {
    const parsed = parseInt(amount, 10);
    if (!parsed || parsed <= 0) return;
    if (!target && (!useOrgMode || !manualOrgId.trim())) return;
    setSubmitState("confirming");
  };

  const handleSubmit = useCallback(async () => {
    if (!token) return;
    setSubmitState("submitting");
    setSubmitError(null);

    const parsed = parseInt(amount, 10);

    const body: Record<string, unknown> = {
      amount: parsed,
      description: description.trim() || "Admin credit grant",
    };

    if (useOrgMode && manualOrgId.trim()) {
      body.organizationId = manualOrgId.trim();
    } else if (target?.type === "user") {
      body.userId = target.user.id;
    } else {
      setSubmitState("error");
      setSubmitError("No target selected");
      return;
    }

    try {
      const res = await fetch(adminApiUrl("/credits/grant"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Grant failed");
      }

      setGrantedTxId(data.data?.transaction?.id ?? null);
      setSubmitState("success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
      setSubmitState("error");
    }
  }, [token, amount, description, target, useOrgMode, manualOrgId]);

  const handleReset = () => {
    setTarget(null);
    setManualOrgId("");
    setAmount("");
    setDescription("");
    setSubmitState("idle");
    setSubmitError(null);
    setGrantedTxId(null);
    setUseOrgMode(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const parsedAmount = parseInt(amount, 10);
  const amountValid = !Number.isNaN(parsedAmount) && parsedAmount > 0;
  const effectiveTarget = useOrgMode
    ? manualOrgId.trim()
    : target?.type === "user"
      ? target.user.email
      : null;
  const canConfirm = amountValid && Boolean(effectiveTarget);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/credits"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-yellow-500" />
            Grant Credits
          </h1>
          <p className="text-muted-foreground text-sm">
            Manually grant credits to a user or organization
          </p>
        </div>
      </div>

      {/* Success state */}
      {submitState === "success" ? (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Credits Granted!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{parsedAmount.toLocaleString()} credits</strong> were granted to{" "}
                <strong>{effectiveTarget}</strong>
              </p>
              {grantedTxId && (
                <p className="text-xs text-muted-foreground/60 mt-2 font-mono">
                  TX: {grantedTxId}
                </p>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              <Button onClick={handleReset} variant="outline" size="sm">
                Grant More Credits
              </Button>
              <Link href="/admin/credits/transactions">
                <Button size="sm" variant="secondary">
                  View Transactions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Credit Grant</CardTitle>
            <CardDescription>
              Search for a user or enter an organization ID, then specify the
              amount to grant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Target selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Recipient
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseOrgMode((v) => !v);
                    setTarget(null);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  {useOrgMode ? "Switch to user search" : "Use organization ID instead"}
                </button>
              </div>

              {target?.type === "user" && !useOrgMode ? (
                /* Selected user chip */
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {target.user.name || target.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {target.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {target.user.plan}
                    </Badge>
                    <button
                      type="button"
                      onClick={handleClearTarget}
                      className="text-muted-foreground hover:text-foreground"
                      title="Clear selection"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : useOrgMode ? (
                /* Org ID input */
                <input
                  type="text"
                  value={manualOrgId}
                  onChange={(e) => setManualOrgId(e.target.value)}
                  placeholder="Organization ID (UUID)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              ) : (
                /* User search */
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by email or name..."
                      className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {/* Dropdown results */}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md overflow-hidden">
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleSelectUser(u)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-foreground">
                              {u.name || u.email}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {u.plan}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchError && (
                    <p className="mt-1 text-xs text-destructive">{searchError}</p>
                  )}

                  {searchQuery.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">No users found</p>
                  )}
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Amount (credits)
              </label>
              <div className="relative">
                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {/* Quick amount presets */}
              <div className="flex flex-wrap gap-1.5">
                {[100, 500, 1000, 5000, 10000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Reason for grant (e.g. welcome bonus, support refund...)"
                maxLength={200}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Confirmation banner */}
            {submitState === "confirming" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Confirm credit grant
                </p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    Recipient:{" "}
                    <strong className="text-foreground">{effectiveTarget}</strong>
                  </p>
                  <p>
                    Amount:{" "}
                    <strong className="text-foreground text-green-500">
                      +{parsedAmount.toLocaleString()} credits
                    </strong>
                  </p>
                  {description.trim() && (
                    <p>
                      Note: <em>{description}</em>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleSubmit()}
                    disabled={submitState !== "confirming"}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Confirm & Grant
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSubmitState("idle")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Submit error */}
            {submitState === "error" && submitError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-sm text-destructive">{submitError}</p>
                <button
                  type="button"
                  onClick={() => setSubmitState("idle")}
                  className="text-xs underline text-muted-foreground mt-1"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Submitting spinner */}
            {submitState === "submitting" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Granting credits…
              </div>
            )}

            {/* Action button */}
            {(submitState === "idle" || submitState === "error") && (
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="w-full"
              >
                <Coins className="h-4 w-4 mr-2" />
                Grant {amountValid ? parsedAmount.toLocaleString() : "—"} Credits
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
