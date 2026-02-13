"use client";

/**
 * Admin Organizations List Page
 *
 * View and manage all organizations:
 * - Search by name/slug
 * - Filter by plan/status
 * - View member counts, departments, credits
 *
 * @module app/(admin)/admin/organizations/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { adminApiUrl } from "@/shared/config/urls";
import {
    Bot,
    Building2,
    ChevronLeft,
    ChevronRight,
    Coins,
    Eye,
    Folder,
    Search,
    Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  departmentCount: number;
  gatewayCount: number;
  creditBalance: number;
}

interface OrganizationsResponse {
  success: boolean;
  data: {
    organizations: Organization[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  STARTER: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  PRO: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  BUSINESS: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  ENTERPRISE: "bg-green-500/10 text-green-500 border-green-500/20",
};

export default function AdminOrganizationsPage() {
  const { token } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchOrganizations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (searchTerm) params.set('search', searchTerm);
      if (planFilter && planFilter !== 'all') params.set('plan', planFilter);
      if (statusFilter !== 'all') params.set('isActive', statusFilter);

      const res = await fetch(
        adminApiUrl(`/organizations?${params.toString()}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error('Failed to fetch organizations');

      const json: OrganizationsResponse = await res.json();
      setOrganizations(json.data.organizations);
      setTotalPages(json.data.pagination.totalPages);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, page, searchTerm, planFilter, statusFilter]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrganizations();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setPlanFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-6 w-6 text-purple-500" />
          Organizations
        </h1>
        <p className="text-muted-foreground">
          Manage all organizations ({total} total)
        </p>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>
            Search by name/slug, filter by plan or status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search organizations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="FREE">Free</SelectItem>
                <SelectItem value="STARTER">Starter</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="BUSINESS">Business</SelectItem>
                <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Searching...' : 'Search'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearFilters}
                disabled={!searchTerm && planFilter === 'all' && statusFilter === 'all'}
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Organizations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No organizations found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Organization
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Members
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Departments
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Gateways
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Credits
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr
                      key={org.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-foreground">
                            {org.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {org.slug}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={PLAN_COLORS[org.plan] || ''}>
                          {org.plan}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={org.isActive ? 'default' : 'secondary'}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground">{org.memberCount}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground">{org.departmentCount}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground">{org.gatewayCount}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Coins className="h-4 w-4 text-yellow-500" />
                          <span className="text-foreground font-medium">
                            {org.creditBalance.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/organizations/${org.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total organizations)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
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
