"use client";

/**
 * Context Switcher Component
 *
 * Dropdown menu for switching between personal and organization contexts.
 * Shows current context, available organizations, pending invites, and create org option.
 *
 * @module components/layouts/context-switcher
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiUrl } from "@/shared/config/urls";
import { Building2, Check, ChevronDown, Home, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface PendingInvite {
  id: string;
  organizationName: string;
  organizationId: string;
  role: string;
  inviterEmail: string | null;
}

/**
 * Format org role for display
 */
function formatRole(role: string): string {
  return role.replace("ORG_", "").toLowerCase();
}

/**
 * Get initials from organization name
 */
function getOrgInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function ContextSwitcher() {
  const router = useRouter();
  const { context, availableOrgs, switchContext, token, refreshAvailableOrgs } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Fetch pending invites when dropdown opens
  const fetchPendingInvites = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(apiUrl("/user/invites"), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch pending invites:", error);
    }
  }, [token]);

  // Fetch invites on mount and when token changes
  useEffect(() => {
    fetchPendingInvites();
  }, [fetchPendingInvites]);

  // Refetch when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchPendingInvites();
    }
  }, [isOpen, fetchPendingInvites]);

  const handleSwitch = async (
    type: "personal" | "organization",
    orgId?: string
  ) => {
    if (isLoading) return;

    // Don't switch if already in this context
    if (type === "personal" && context.type === "personal") return;
    if (
      type === "organization" &&
      context.type === "organization" &&
      context.organizationId === orgId
    )
      return;

    try {
      setIsLoading(true);
      await switchContext(type, orgId);
      // Redirect to dashboard after switch
      router.push("/");
    } catch (error) {
      console.error("Failed to switch context:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptInvite = async (inviteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || processingInvite) return;

    try {
      setProcessingInvite(inviteId);
      const res = await fetch(apiUrl(`/user/invites/${inviteId}/accept`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // Remove from pending list
        setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
        // Refresh available orgs
        await refreshAvailableOrgs();
      }
    } catch (error) {
      console.error("Failed to accept invite:", error);
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || processingInvite) return;

    try {
      setProcessingInvite(inviteId);
      const res = await fetch(apiUrl(`/user/invites/${inviteId}/decline`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // Remove from pending list
        setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
      }
    } catch (error) {
      console.error("Failed to decline invite:", error);
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleCreateOrg = () => {
    router.push("/organizations/create");
  };

  const inviteCount = pendingInvites.length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 min-w-[140px] relative"
          disabled={isLoading}
        >
          {context.type === "personal" ? (
            <>
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Personal</span>
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline truncate max-w-[100px]">
                {context.organizationName || "Organization"}
              </span>
            </>
          )}
          <ChevronDown className="h-4 w-4 ml-auto" />
          
          {/* Notification badge for pending invites */}
          {inviteCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {inviteCount > 9 ? "9+" : inviteCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {/* Personal workspace */}
        <DropdownMenuItem
          onClick={() => handleSwitch("personal")}
          className={context.type === "personal" ? "bg-accent" : ""}
          disabled={isLoading}
        >
          <div className="flex items-center gap-3 w-full">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Home className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">Personal Workspace</div>
              <div className="text-xs text-muted-foreground">
                Your private workspace
              </div>
            </div>
            {context.type === "personal" && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>
        </DropdownMenuItem>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-2">
              Pending Invites
              <Badge variant="destructive" className="text-[10px] h-4 px-1">
                {inviteCount}
              </Badge>
            </div>
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="px-2 py-2 flex items-center gap-2"
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-orange-500/10 text-orange-500 text-xs">
                    {getOrgInitials(invite.organizationName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {invite.organizationName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    as {formatRole(invite.role)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {processingInvite === invite.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        onClick={(e) => handleDeclineInvite(invite.id, e)}
                        title="Decline"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                        onClick={(e) => handleAcceptInvite(invite.id, e)}
                        title="Accept"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Organizations list */}
        {availableOrgs.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Organizations
            </div>
            {availableOrgs.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSwitch("organization", org.id)}
                className={
                  context.type === "organization" &&
                  context.organizationId === org.id
                    ? "bg-accent"
                    : ""
                }
                disabled={isLoading}
              >
                <div className="flex items-center gap-3 w-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getOrgInitials(org.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{org.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRole(org.role)}
                    </div>
                  </div>
                  {context.type === "organization" &&
                    context.organizationId === org.id && (
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Create organization */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateOrg} disabled={isLoading}>
          <div className="flex items-center gap-3 w-full">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/50">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="font-medium">Create Organization</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
