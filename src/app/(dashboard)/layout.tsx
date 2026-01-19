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

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ContextSwitcher } from "@/components/layouts";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    Bot,
    Building2,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Home,
    LogOut,
    Menu,
    Plug,
    Settings,
    Shield,
    ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// Navigation items
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/gateways", label: "Gateways", icon: Bot },
  { href: "/dashboard/plugins", label: "Plugin Store", icon: ShoppingBag },
  { href: "/dashboard/my-plugins", label: "My Plugins", icon: Plug },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// Organization-only nav items
const orgNavItems = [
  { href: "/dashboard/organizations", label: "Organization", icon: Building2 },
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
  const { context, user } = useAuth();

  // Build nav items based on context and role
  let allNavItems = 
    context.type === "organization" ? [...navItems, ...orgNavItems] : navItems;
  
  // Add admin link for ADMIN/SUPER_ADMIN users
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
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
        {allNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
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

function Header() {
  const { user, logout, context } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="h-16 bg-card/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden text-muted-foreground"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Context info */}
      <div className="flex items-center gap-3">
        <Badge
          variant={context.plan === "FREE" ? "secondary" : "default"}
          className={context.plan !== "FREE" ? "bg-purple-600" : ""}
        >
          {context.plan}
        </Badge>
        {context.type === "organization" && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {context.organizationName}
          </span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
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

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content area */}
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        }`}
      >
        {/* Header */}
        <Header />

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
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
