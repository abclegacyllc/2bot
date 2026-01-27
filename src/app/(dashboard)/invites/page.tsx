"use client";

/**
 * Pending Invites Page
 *
 * Shows user's pending organization invitations with accept/decline actions.
 *
 * @module app/(dashboard)/invites/page
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
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
import { apiUrl } from "@/shared/config/urls";
import {
    Building2,
    Check,
    Loader2,
    Mail,
    Users,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface PendingInvite {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  invitedAt: string;
  inviterEmail: string | null;
}

function InvitesContent() {
  const router = useRouter();
  const { token, refreshUser } = useAuth();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(apiUrl("/user/invites"), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to fetch invites");
      }

      setInvites(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleAccept = async (inviteId: string) => {
    if (!token) return;

    try {
      setProcessingId(inviteId);
      setError(null);

      const response = await fetch(apiUrl(`/user/invites/${inviteId}/accept`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to accept invite");
      }

      // Refresh user data to update available orgs
      await refreshUser();

      // Remove from list
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));

      // Navigate to the organization
      if (result.data?.organizationId) {
        router.push(`/organizations/${result.data.organizationId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    if (!token) return;

    try {
      setProcessingId(inviteId);
      setError(null);

      const response = await fetch(apiUrl(`/user/invites/${inviteId}/decline`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || "Failed to decline invite");
      }

      // Remove from list
      setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decline invite");
    } finally {
      setProcessingId(null);
    }
  };

  const formatRole = (role: string) => {
    return role.replace("ORG_", "").charAt(0) + role.replace("ORG_", "").slice(1).toLowerCase();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Mail className="h-8 w-8" />
            Organization Invites
          </h1>
          <p className="text-muted-foreground mt-2">
            Pending invitations to join organizations
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {invites.length === 0 ? (
          <Card className="bg-muted/50 border-border">
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No Pending Invites
              </h3>
              <p className="text-muted-foreground">
                You don&apos;t have any pending organization invitations.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {invites.map((invite) => (
              <Card key={invite.id} className="border-border bg-card/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <Building2 className="h-6 w-6 text-purple-500" />
                      </div>
                      <div>
                        <CardTitle className="text-foreground">
                          {invite.organizationName}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                          {invite.inviterEmail
                            ? `Invited by ${invite.inviterEmail}`
                            : "Organization invitation"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                      {formatRole(invite.role)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Invited on {new Date(invite.invitedAt).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDecline(invite.id)}
                        disabled={processingId === invite.id}
                        className="border-border text-muted-foreground hover:text-destructive hover:border-destructive"
                      >
                        {processingId === invite.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <X className="h-4 w-4 mr-1" />
                            Decline
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAccept(invite.id)}
                        disabled={processingId === invite.id}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {processingId === invite.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitesPage() {
  return (
    <ProtectedRoute>
      <InvitesContent />
    </ProtectedRoute>
  );
}
