"use client";

/**
 * Settings Page
 *
 * Main settings page that redirects to appropriate settings based on context.
 * - Personal context: Shows personal settings
 * - Organization context: Redirects to org settings
 *
 * @module app/dashboard/settings/page
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
import { Separator } from "@/components/ui/separator";
import {
    ArrowRight,
    Building2,
    Calendar,
    CreditCard,
    Loader2,
    Mail,
    Settings,
    User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function SettingsContent() {
  const router = useRouter();
  const { user, context, isLoading } = useAuth();

  // Redirect to org settings if in org context
  useEffect(() => {
    if (!isLoading && context.type === "organization") {
      router.push("/dashboard/settings/organization");
    }
  }, [context.type, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Show org settings redirect for org context
  if (context.type === "organization") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-3 text-slate-400">Redirecting to organization settings...</span>
      </div>
    );
  }

  // Personal workspace settings
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Settings className="h-8 w-8" />
              Settings
            </h1>
            <p className="text-slate-400 mt-1">
              Manage your personal account settings
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Account Info Card */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription className="text-slate-400">
              Your personal account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </p>
                <p className="text-white mt-1">{user?.email}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Name
                </p>
                <p className="text-white mt-1">{user?.name || "Not set"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Plan
                </p>
                <Badge
                  variant={user?.plan === "PRO" ? "default" : "secondary"}
                  className="mt-1"
                >
                  {user?.plan}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Member Since
                </p>
                <p className="text-white mt-1">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/dashboard/gateways">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white text-lg">🤖 My Gateways</CardTitle>
                <CardDescription className="text-slate-400">
                  Manage your connected Telegram bots and AI providers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="text-slate-400 p-0">
                  View Gateways <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/my-plugins">
            <Card className="border-slate-800 bg-slate-900/50 hover:bg-slate-800/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-white text-lg">🔌 My Plugins</CardTitle>
                <CardDescription className="text-slate-400">
                  Configure your installed plugins and settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" className="text-slate-400 p-0">
                  View My Plugins <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Organization Section */}
        <Separator className="bg-slate-800" />

        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizations
            </CardTitle>
            <CardDescription className="text-slate-400">
              Create or switch to an organization workspace for team collaboration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/organizations/new">
              <Button className="bg-purple-600 hover:bg-purple-700">
                Create Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
