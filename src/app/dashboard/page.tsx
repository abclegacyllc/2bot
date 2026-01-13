"use client";

/**
 * Dashboard Page
 *
 * Protected page that requires authentication.
 * Shows user info and basic dashboard layout.
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function DashboardContent() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400">Welcome back, {user?.name || user?.email}</p>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </Button>
        </div>

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
                <p className="text-sm text-slate-500">Plan</p>
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

        {/* Placeholder Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white">🤖 Telegram Bots</CardTitle>
              <CardDescription className="text-slate-400">
                Manage your connected bots
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500 text-sm">Coming in Phase 2...</p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-white">🔌 Plugins</CardTitle>
              <CardDescription className="text-slate-400">
                Browse available plugins
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-500 text-sm">Coming in Phase 4...</p>
            </CardContent>
          </Card>
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
