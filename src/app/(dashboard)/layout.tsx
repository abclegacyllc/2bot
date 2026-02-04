"use client";

/**
 * Dashboard Layout
 *
 * Shared layout for all dashboard pages with:
 * - Sidebar navigation
 * - Top header with user menu
 * - Protected route wrapper
 *
 * @module app/(dashboard)/layout
 */

import { TwoBotAIAssistantWidget } from "@/components/2bot-ai-assistant";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { CreditsBalanceDisplay } from "@/components/credits";
import { ContextSwitcher } from "@/components/layouts";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    Bot,
    Building2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Coins,
    CreditCard,
    Home,
    LogOut,
    Menu,
    Plug,
    Settings,
    Shield,
    ShoppingBag,
    User
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// Shared navigation items (both contexts) - base paths
const sharedNavItemsBase = [
  { path: "", label: "Dashboard", icon: Home },
  { path: "/gateways", label: "Gateways", icon: Bot },
  { path: "/plugins", label: "Plugin Store", icon: ShoppingBag },
  { path: "/my-plugins", label: "My Plugins", icon: Plug },
];

// Build shared nav items based on context
const buildSharedNavItems = (isOrgContext: boolean, orgSlug: string) => 
  sharedNavItemsBase.map(item => ({
    href: isOrgContext && orgSlug 
      ? `/organizations/${orgSlug}${item.path}`
      : `${item.path || '/'}`,
    label: item.label,
    icon: item.icon,
  }));

// Personal workspace specific items
const personalNavItems = [
  // Invites are now shown in the context switcher with notification badge
  { href: "/credits", label: "Credits", icon: Coins },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

// Organization workspace specific items  
const buildOrgNavItems = (orgSlug: string) => [
  // Org credits and billing
  { href: `/organizations/${orgSlug}/credits`, label: "Credits", icon: Coins },
  { href: `/organizations/${orgSlug}/billing`, label: "Billing", icon: CreditCard },
];

// Settings sub-items for PERSONAL context
const personalSettingsSubItems = [
  { href: "/settings", label: "Profile", icon: User },
];

// Settings sub-items for ORGANIZATION context (dynamic - see buildOrgSettingsSubItems)
const buildOrgSettingsSubItems = (orgSlug: string) => [
  { href: `/organizations/${orgSlug}/settings`, label: "General", icon: Building2 },
  { href: `/organizations/${orgSlug}/members`, label: "Members", icon: User },
];

// Admin-only nav item
const adminNavItem = { href: "/admin", label: "Admin Panel", icon: Shield };

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { context, user, availableOrgs } = useAuth();
  const [settingsExpanded, setSettingsExpanded] = useState(
    pathname.startsWith("/settings") || pathname.includes("/organizations/")
  );
  
  // Add admin link for ADMIN/SUPER_ADMIN users
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isOrgContext = context.type === "organization";
  
  // Get current org slug for dynamic URLs
  const currentOrg = isOrgContext 
    ? availableOrgs.find(o => o.id === context.organizationId)
    : null;
  const orgSlug = currentOrg?.slug || context.organizationId || "";
  
  // Build nav items based on context
  const sharedNavItems = buildSharedNavItems(isOrgContext, orgSlug);
  const mainNavItems = isOrgContext 
    ? [...sharedNavItems, ...buildOrgNavItems(orgSlug)]
    : [...sharedNavItems, ...personalNavItems];
  
  // Build settings sub-items based on context
  const settingsSubItems = isOrgContext && orgSlug
    ? buildOrgSettingsSubItems(orgSlug)
    : personalSettingsSubItems;
  
  // Check if any settings item is active
  const isSettingsActive = pathname.startsWith("/settings");

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <span className="font-bold text-foreground text-lg">2Bot</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="p-2 space-y-1">
        {/* Main nav items */}
        {mainNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? "bg-purple-600/20 text-purple-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Settings expandable menu */}
        <div>
          <button
            onClick={() => !collapsed && setSettingsExpanded(!settingsExpanded)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              isSettingsActive
                ? "bg-purple-600/20 text-purple-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Settings</span>
                <ChevronDown 
                  className={`h-4 w-4 transition-transform ${
                    settingsExpanded ? "rotate-180" : ""
                  }`} 
                />
              </>
            )}
          </button>
          
          {/* Settings sub-items (slide down) */}
          {!collapsed && settingsExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
              {settingsSubItems.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== "/settings" && pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-purple-600/20 text-purple-400"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin link - only for admins */}
        {isAdmin && (
          <>
            <div className="border-t border-border my-2" />
            <Link
              href={adminNavItem.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-red-600/20 text-red-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={collapsed ? adminNavItem.label : undefined}
            >
              <adminNavItem.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{adminNavItem.label}</span>}
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}

function Header({ onMobileMenuToggle }: { onMobileMenuToggle: () => void }) {
  const { user, logout, context } = useAuth();

  // Format role for display
  const formatRole = (role: string): string => {
    // Remove ORG_ prefix and format nicely
    return role.replace("ORG_", "").replace("_", " ").toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get display role based on context
  const displayRole = context.type === "organization" 
    ? (context.orgRole ? formatRole(context.orgRole) : "Member")
    : (user?.role ? formatRole(user.role) : "Member");

  return (
    <header className="h-16 bg-card/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden text-muted-foreground"
        onClick={onMobileMenuToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Context info */}
      <div className="flex items-center gap-3">
        <Badge
          variant={context.type === "organization" ? "default" : "secondary"}
          className={context.type === "organization" ? "bg-purple-600" : ""}
        >
          {displayRole}
        </Badge>
        {context.type === "organization" && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {context.organizationName}
          </span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <CreditsBalanceDisplay />
        <ContextSwitcher />
        <ThemeToggle />
        <div className="hidden sm:block text-sm text-muted-foreground">
          {user?.name || user?.email?.split("@")[0]}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <Sidebar
          collapsed={false}
          onToggle={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content area */}
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        {/* Header */}
        <Header onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>

      {/* 2Bot AI Assistant Widget */}
      <TwoBotAIAssistantWidget position="bottom-right" />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </ProtectedRoute>
  );
}
