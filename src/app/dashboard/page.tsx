"use client";

/**
 * Dashboard Page
 *
 * Protected page that requires authentication.
 * Shows user info and basic dashboard layout.
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { ContextSwitcher } from "@/components/layouts";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

function DashboardContent() {
  const { user, logout, context } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400">
              {context.type === "personal"
                ? `Welcome back, ${user?.name || user?.email}`
                : `${context.organizationName} Workspace`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ContextSwitcher />
            <Button
              variant="outline"
              onClick={logout}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Sign out
            </Button>
          </div>
        </div>

        {/* Context Info Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white">
              {context.type === "personal" ? "Personal Workspace" : "Organization Workspace"}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {context.type === "personal"
                ? "Your private workspace and resources"
                : `You are ${context.orgRole?.replace("ORG_", "").toLowerCase()} of this organization`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Context</p>
                <p className="text-white capitalize">{context.type}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Plan</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  context.plan === "PRO" || context.plan === "ENTERPRISE"
                    ? "bg-purple-900/50 text-purple-300"
                    : "bg-slate-700 text-slate-300"
                }`}>
                  {context.plan}
                </span>
              </div>
              {context.type === "organization" && (
                <>
                  <div>
                    <p className="text-sm text-slate-500">Organization</p>
                    <p className="text-white">{context.organizationName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Your Role</p>
                    <p className="text-white">{context.orgRole?.replace("ORG_", "")}</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* User Info Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white">Account Details</CardTitle>
            <CardDescription className="text-slate-400">
              Your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="text-white">{user?.email}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Name</p>
                <p className="text-white">{user?.name || "Not set"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Personal Plan</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  user?.plan === "PRO"
                    ? "bg-purple-900/50 text-purple-300"
                    : "bg-slate-700 text-slate-300"
                }`}>
                  {user?.plan}
                </span>
              </div>
              <div>
                <p className="text-sm text-slate-500">Member since</p>
                <p className="text-white">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/dashboard/gateways">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white">🤖 Gateways</CardTitle>
                <CardDescription className="text-slate-400">
                  Manage connected bots & AI providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-sm">Telegram bots and AI integrations</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/plugins">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white">🛒 Plugin Store</CardTitle>
                <CardDescription className="text-slate-400">
                  Browse available plugins
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-sm">Discover and install new plugins</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/my-plugins">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white">🔌 My Plugins</CardTitle>
                <CardDescription className="text-slate-400">
                  Installed plugins
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-sm">Configure and manage your plugins</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/settings">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white">⚙️ Settings</CardTitle>
                <CardDescription className="text-slate-400">
                  Account & workspace settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-sm">
                  {context.type === "organization" 
                    ? "Organization settings and members" 
                    : "Personal account settings"}
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Organization-specific cards */}
          {context.type === "organization" && (
            <>
              <Link href="/dashboard/settings/organization/resources">
                <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="text-white">📊 Resources</CardTitle>
                    <CardDescription className="text-slate-400">
                      Department quotas & limits
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-400 text-sm">Manage resource allocation</p>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/dashboard/settings/organization/monitoring">
                <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <CardTitle className="text-white">📈 Monitoring</CardTitle>
                    <CardDescription className="text-slate-400">
                      Usage and activity
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-400 text-sm">Track organization metrics</p>
                  </CardContent>
                </Card>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
