"use client";

/**
 * Admin Users Page
 *
 * User management for administrators:
 * - View all users with pagination
 * - Search by name/email
 * - Filter by subscription plan
 * - View user details
 *
 * @module app/(admin)/admin/users/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    AlertTriangle,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Mail,
    Search,
    Shield,
    Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  subscription: string;
  createdAt: string;
  lastLoginAt: string | null;
  gatewayCount: number;
  organizationCount: number;
}

interface UsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function UserRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-40 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-24 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-16 bg-muted" />
      </td>
      <td className="px-4 py-3">
        <Skeleton className="h-5 w-24 bg-muted" />
      </td>
    </tr>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const variants: Record<string, string> = {
    FREE: "bg-muted",
    PRO: "bg-blue-600",
    BUSINESS: "bg-purple-600",
    ENTERPRISE: "bg-orange-600",
  };

  return (
    <Badge className={variants[plan] || "bg-muted"}>
      {plan}
    </Badge>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "SUPER_ADMIN") {
    return (
      <Badge variant="destructive" className="bg-red-600">
        <Shield className="h-3 w-3 mr-1" />
        Super Admin
      </Badge>
    );
  }
  if (role === "ADMIN") {
    return (
      <Badge variant="destructive" className="bg-red-500">
        Admin
      </Badge>
    );
  }
  return <Badge variant="secondary">{role}</Badge>;
}

export default function AdminUsersPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("");

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      if (data.success && data.data) {
        setUsers(data.data.users || []);
        setPagination(data.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      } else {
        throw new Error(data.error?.message || "Failed to fetch users");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, planFilter, token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePlanFilter = (plan: string) => {
    setPlanFilter(plan === planFilter ? "" : plan);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="bg-card border-red-800 p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-6 w-6" />
            <span>{error}</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-400" />
            Users
          </h1>
          <p className="text-muted-foreground">
            {pagination.total} total users
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card border-border text-foreground w-64"
            />
          </div>
          <Button type="submit" variant="outline" className="border-border">
            Search
          </Button>
        </form>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground py-1">Filter by plan:</span>
        {["FREE", "PRO", "BUSINESS", "ENTERPRISE"].map((plan) => (
          <Button
            key={plan}
            variant={planFilter === plan ? "default" : "outline"}
            size="sm"
            onClick={() => handlePlanFilter(plan)}
            className={`border-border ${
              planFilter === plan ? "bg-purple-600" : ""
            }`}
          >
            {plan}
          </Button>
        ))}
      </div>

      {/* Users table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Gateways
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                    Last Login
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <UserRowSkeleton />
                    <UserRowSkeleton />
                    <UserRowSkeleton />
                    <UserRowSkeleton />
                    <UserRowSkeleton />
                  </>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-foreground font-medium">
                            {user.name || "No name"}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <PlanBadge plan={user.subscription} />
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {user.gatewayCount}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(user.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-sm">
                        {formatDate(user.lastLoginAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page <= 1}
                  className="border-border"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="border-border"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
