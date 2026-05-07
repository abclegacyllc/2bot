"use client";

/**
 * Studio Top Bar
 *
 * Slim global navigation bar for 2Bot Studio:
 * - Logo + workspace switcher (left)
 * - Global search with Cmd+K shortcut (center)
 * - Marketplace, Billing, Credits, Notifications, User avatar (right)
 *
 * @module components/studio/top-bar
 */

import { CreditsBalanceDisplay } from "@/components/credits";
import { ContextSwitcher } from "@/components/layouts";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    BarChart3,
    Bell,
    Bot,
    Coins,
    CreditCard,
    HardDrive,
    LogOut,
    Plug,
    Search,
    Settings,
    Store,
    User,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function getUserInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email?.[0] ?? "U").toUpperCase();
}

export function StudioTopBar() {
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const billingHref = "/billing";

  // Cmd+K / Ctrl+K shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchQuery("");
      setSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const openSearch = useCallback(() => {
    setSearchQuery("");
    setSearchOpen(true);
  }, []);

  return (
    <header className="h-12 flex-shrink-0 glass border-b border-border flex items-center px-4 gap-3 z-50">
      {/* ===== Left: Logo + Workspace ===== */}
      <div className="flex items-center gap-3">
        <Link
          href="/studio"
          className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
        >
          <span className="text-xl">🤖</span>
          <span className="font-bold text-sm hidden sm:inline">2Bot Studio</span>
        </Link>

        <div className="h-5 w-px bg-border hidden sm:block" />

        <div className="hidden sm:block">
          <ContextSwitcher />
        </div>
      </div>

      {/* ===== Center: Global Search ===== */}
      <div className="flex-1 max-w-md mx-auto hidden md:block">
        <button
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-muted/50 text-muted-foreground text-sm hover:bg-muted transition-colors"
          onClick={() => openSearch()}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search bots, plugins...</span>
          <kbd className="text-[10px] bg-background/80 border border-border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ===== Right: Actions ===== */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Marketplace */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:flex text-muted-foreground hover:text-foreground gap-1.5 text-xs h-8"
          asChild
        >
          <Link href="/marketplace">
            <Store className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Marketplace</span>
          </Link>
        </Button>

        {/* Billing */}
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:flex text-muted-foreground hover:text-foreground gap-1.5 text-xs h-8"
          asChild
        >
          <Link href={billingHref}>
            <CreditCard className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Billing</span>
          </Link>
        </Button>

        {/* Credits */}
        <CreditsBalanceDisplay variant="compact" />

        {/* Notifications (placeholder) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Avatar Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-[var(--primary)]/20 text-[var(--primary)]">
                  {getUserInitials(user?.name, user?.email)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{user?.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/workspace" className="flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" />
                Workspace
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/usage" className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5" />
                Usage
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/credits" className="flex items-center gap-2">
                <Coins className="h-3.5 w-3.5" />
                Credits
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ===== Global Search Dialog (Cmd+K) ===== */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Search</DialogTitle>
          {/* Search Input */}
          <div className="flex items-center gap-2 px-4 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bots, plugins, workflows..."
              className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          {/* Quick Links */}
          <div className="p-2 max-h-80 overflow-y-auto">
            <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Quick Links
            </p>
            <SearchQuickLink
              icon={Bot}
              label="My Bots"
              href="/studio"
              onNavigate={() => setSearchOpen(false)}
            />
            <SearchQuickLink
              icon={Store}
              label="Marketplace"
              href="/marketplace"
              onNavigate={() => setSearchOpen(false)}
            />
            <SearchQuickLink
              icon={Plug}
              label="Plugins"
              href="/plugins"
              onNavigate={() => setSearchOpen(false)}
            />
            <SearchQuickLink
              icon={Workflow}
              label="2Bot AI"
              href="/studio"
              onNavigate={() => setSearchOpen(false)}
            />
            <SearchQuickLink
              icon={CreditCard}
              label="Billing"
              href={billingHref}
              onNavigate={() => setSearchOpen(false)}
            />
            <SearchQuickLink
              icon={Settings}
              label="Settings"
              href="/settings"
              onNavigate={() => setSearchOpen(false)}
            />

            {/* Placeholder for actual search results */}
            {searchQuery.trim() && (
              <div className="px-2 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No results for &ldquo;{searchQuery}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Full search coming soon
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

// =============================================================================
// Search Quick Link
// =============================================================================

function SearchQuickLink({
  icon: Icon,
  label,
  href,
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-2 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
