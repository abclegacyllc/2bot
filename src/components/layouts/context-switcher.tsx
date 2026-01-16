"use client";

/**
 * Context Switcher Component
 *
 * Dropdown menu for switching between personal and organization contexts.
 * Shows current context, available organizations, and create org option.
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
import { Building2, ChevronDown, Home, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const { context, availableOrgs, switchContext } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to switch context:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrg = () => {
    router.push("/dashboard/organizations/new");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 min-w-[140px]"
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
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
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
