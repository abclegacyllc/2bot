"use client";

/**
 * Admin Layout
 *
 * Shared layout for admin pages with:
 * - Admin-specific sidebar navigation
 * - ADMIN/SUPER_ADMIN role protection
 * - Top header with admin badge
 *
 * @module app/(admin)/admin/layout
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    BarChart3,
    BookOpen,
    Bot,
    Brain,
    Building2,
    ChevronLeft,
    ChevronRight,
    Coins,
    DollarSign,
    FileText,
    Headphones,
    Home,
    LogOut,
    Menu,
    Shield,
    Users
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// Admin navigation items
const navItems = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/credits", label: "Credits", icon: Coins },
  { href: "/admin/gateways", label: "Gateways", icon: Bot },
  { href: "/admin/ai-usage", label: "AI Usage", icon: Brain },
  { href: "/admin/pricing-monitor", label: "Price Monitor", icon: DollarSign },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
  { href: "/admin/support", label: "Support", icon: Headphones },
  { href: "/admin/support/kb", label: "Knowledge Base", icon: BookOpen },
];

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  // Find the most specific matching nav item to prevent parent paths from being highlighted
  // when on a child route (e.g., don't highlight "Support" when on "Knowledge Base")
  const bestMatchingHref = navItems
    .filter(navItem => pathname === navItem.href || pathname.startsWith(navItem.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href || "";

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <span className="font-bold text-foreground text-lg">Admin Panel</span>
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
        {navItems.map((item) => {
          // Only highlight the most specific match
          const isActive = item.href === bestMatchingHref;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? "bg-red-600/20 text-red-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Back to Dashboard */}
      <div className="absolute bottom-4 left-0 right-0 px-2">
        <Link
          href="/"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground`}
          title={collapsed ? "Back to Dashboard" : undefined}
        >
          <Home className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Back to Dashboard</span>}
        </Link>
      </div>
    </aside>
  );
}

function Header() {
  const { user, logout } = useAuth();
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

      {/* Admin badge */}
      <div className="flex items-center gap-3">
        <Badge variant="destructive" className="bg-red-600 hover:bg-red-700">
          <Shield className="h-3 w-3 mr-1" />
          Admin
        </Badge>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {user?.role === "SUPER_ADMIN" ? "Super Admin" : "Administrator"}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden sm:block text-sm text-muted-foreground">
          {user?.name || user?.email?.split("@")[0]}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ProtectedRoute requiredRole="ADMIN">
      <div className="min-h-screen bg-background">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div
          className={`transition-all duration-300 ${
            sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
          }`}
        >
          <Header />

          <main className="p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
