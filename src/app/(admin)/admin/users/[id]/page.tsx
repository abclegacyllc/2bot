"use client";

/**
 * Admin User Detail Page
 *
 * View and edit individual user details:
 * - User information and status
 * - Role and plan management
 * - Account unlock
 * - User suspension/deletion
 * - Active sessions
 * - Credit wallets
 *
 * @module app/(admin)/admin/users/[id]/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermission } from "@/hooks/use-permission";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Calendar,
    Coins,
    Lock,
    LockOpen,
    Mail,
    Save,
    Shield,
    Trash2,
    User as UserIcon
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  createdAt: string;
  lastLoginAt: string | null;
  gatewayCount: number;
  isActive: boolean;
  lockedUntil: string | null;
  failedLoginCount: number;
  creditWallet: {
    id: string;
    balance: number;
    monthlyAllocation: number;
    monthlyUsed: number;
  } | null;
  sessions: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
  }>;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const canWrite = usePermission('admin:users:write');
  const canDelete = usePermission('admin:users:delete');
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editedRole, setEditedRole] = useState<string>("");
  const [editedPlan, setEditedPlan] = useState<string>("");
  const [editedIsActive, setEditedIsActive] = useState<boolean>(true);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchUser = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(adminApiUrl(`/users/${userId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }

      const data = await response.json();
      setUser(data.data);
      setEditedRole(data.data.role);
      setEditedPlan(data.data.plan);
      setEditedIsActive(data.data.isActive);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!user) return;
    const changed =
      editedRole !== user.role ||
      editedPlan !== user.plan ||
      editedIsActive !== user.isActive;
    setHasChanges(changed);
  }, [editedRole, editedPlan, editedIsActive, user]);

  const handleSave = async () => {
    if (!token || !user) return;

    try {
      setSaving(true);
      const response = await fetch(adminApiUrl(`/users/${userId}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: editedRole,
          plan: editedPlan,
          isActive: editedIsActive,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update user");
      }

      await fetchUser();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!token || !user) return;

    try {
      setUnlocking(true);
      const response = await fetch(adminApiUrl(`/users/${userId}/unlock`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to unlock account");
      }

      await fetchUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock account");
    } finally {
      setUnlocking(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !user) return;
    if (!confirm(`Are you sure you want to delete ${user.email}? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(true);
      const response = await fetch(adminApiUrl(`/users/${userId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete user");
      }

      router.push("/admin/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p>{error || "User not found"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <div className="space-y-6">
      <PageHeader 
        title="User Details"
        description={user.email}
        breadcrumbs={[{ label: "Users", href: "/admin/users" }]}
        actions={
          <div className="flex items-center gap-2">
          {hasChanges && canWrite ? <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button> : null}
          {canDelete ? <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? "Deleting..." : "Delete User"}
            </Button> : null}
        </div>
        }
      />

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{user.email}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Name</label>
              <div className="mt-1">
                <span className="text-foreground">{user.name || "—"}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">User ID</label>
              <div className="mt-1">
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {user.id}
                </code>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Gateways</label>
              <div className="mt-1">
                <span className="text-foreground">{user.gatewayCount}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Joined</label>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Login</label>
              <div className="mt-1">
                <span className="text-foreground">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString()
                    : "Never"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role & Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Role & Status
          </CardTitle>
          <CardDescription>Manage user role, plan, and account status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Role
              </label>
              <Select value={editedRole} onValueChange={setEditedRole} disabled={!canWrite}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Plan
              </label>
              <Select value={editedPlan} onValueChange={setEditedPlan} disabled={!canWrite}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Account Status
              </label>
              <Select
                value={editedIsActive ? "active" : "inactive"}
                onValueChange={(v) => setEditedIsActive(v === "active")}
                disabled={!canWrite}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLocked ? <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-yellow-900 dark:text-yellow-100">
                    Account Locked
                  </h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Locked until {new Date(user.lockedUntil ?? "").toLocaleString()} after{" "}
                    {user.failedLoginCount} failed login attempts.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleUnlock}
                    disabled={unlocking}
                  >
                    <LockOpen className="h-4 w-4 mr-2" />
                    {unlocking ? "Unlocking..." : "Unlock Account"}
                  </Button>
                </div>
              </div>
            </div> : null}
        </CardContent>
      </Card>

      {/* Credit Wallet */}
      {user.creditWallet ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Credit Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-muted rounded-lg">
              <div>
                <div className="font-medium text-foreground">
                  Balance: {user.creditWallet.balance.toLocaleString()} credits
                </div>
                <div className="text-sm text-muted-foreground">
                  Monthly: {user.creditWallet.monthlyUsed.toLocaleString()} /{" "}
                  {user.creditWallet.monthlyAllocation.toLocaleString()}
                </div>
              </div>
              <code className="text-xs text-muted-foreground block mt-2">
                {user.creditWallet.id}
              </code>
            </div>
          </CardContent>
        </Card> : null}

      {/* Active Sessions */}
      {user.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>Recent user sessions (up to 5)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {user.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="text-sm">
                    <div className="text-muted-foreground">
                      Created: {new Date(session.createdAt).toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">
                      Expires: {new Date(session.expiresAt).toLocaleString()}
                    </div>
                  </div>
                  <code className="text-xs text-muted-foreground">
                    {session.id.slice(0, 8)}...
                  </code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
