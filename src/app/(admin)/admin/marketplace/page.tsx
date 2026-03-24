"use client";

/**
 * Admin Marketplace Page
 *
 * Manage marketplace items: view all plugins with install counts,
 * toggle featured/published status, search/filter, and navigate to detail editors.
 *
 * @module app/(admin)/admin/marketplace/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Download,
    Edit,
    Eye,
    Package,
    Plus,
    Search,
    Star,
    Store,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface MarketplaceItem {
  slug: string;
  name: string;
  version: string;
  description: string;
  category: string;
  difficulty: string;
  icon: string;
  tags: string[];
  layout: string;
  bundlePath: string;
  isActive: boolean;
  isFeatured: boolean;
  isSeeded: boolean;
  dbId: string | null;
  installCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface MarketplaceStats {
  totalPlugins: number;
  activePlugins: number;
  totalInstalls: number;
  featuredCount: number;
}

function ItemRowSkeleton() {
  return (
    <tr className="border-b border-border">
      <td className="px-4 py-3"><Skeleton className="h-5 w-40 bg-muted" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-20 bg-muted" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-16 bg-muted" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-12 bg-muted" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-16 bg-muted" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-16 bg-muted" /></td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-8 bg-muted" />
          <Skeleton className="h-8 w-8 bg-muted" />
        </div>
      </td>
    </tr>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    messaging: "bg-blue-600",
    analytics: "bg-green-600",
    automation: "bg-purple-600",
    utilities: "bg-orange-600",
    moderation: "bg-red-600",
    general: "bg-muted",
  };
  return (
    <Badge className={colors[category] || "bg-muted"}>
      {category}
    </Badge>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colors: Record<string, string> = {
    beginner: "bg-green-600",
    intermediate: "bg-yellow-600",
    advanced: "bg-red-600",
  };
  return (
    <Badge variant="outline" className={`border-0 ${colors[difficulty] || "bg-muted"}`}>
      {difficulty}
    </Badge>
  );
}

export default function AdminMarketplacePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);

      const response = await fetch(adminApiUrl(`/marketplace/items?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch marketplace items");

      const data = await response.json();
      if (data.success && data.data) {
        setItems(data.data.items || []);
        setPagination(data.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      } else {
        throw new Error(data.error?.message || "Failed to fetch items");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, categoryFilter, token]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(adminApiUrl("/marketplace/stats"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) setStats(data.data);
    } catch {
      // Stats are non-critical
    }
  }, [token]);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleCategoryFilter = (cat: string) => {
    setCategoryFilter(cat === categoryFilter ? "" : cat);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const toggleFeatured = async (slug: string) => {
    if (!token || togglingSlug) return;
    setTogglingSlug(slug);
    try {
      const response = await fetch(adminApiUrl(`/marketplace/items/${slug}/feature`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.slug === slug ? { ...item, isFeatured: !item.isFeatured } : item
          )
        );
      }
    } finally {
      setTogglingSlug(null);
    }
  };

  const togglePublished = async (slug: string) => {
    if (!token || togglingSlug) return;
    setTogglingSlug(slug);
    try {
      const response = await fetch(adminApiUrl(`/marketplace/items/${slug}/publish`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.slug === slug ? { ...item, isActive: !item.isActive } : item
          )
        );
        fetchStats();
      }
    } finally {
      setTogglingSlug(null);
    }
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
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Plugins</div>
              <div className="text-2xl font-bold text-foreground">{stats.totalPlugins}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Active</div>
              <div className="text-2xl font-bold text-green-400">{stats.activePlugins}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Installs</div>
              <div className="text-2xl font-bold text-blue-400">{stats.totalInstalls}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Featured</div>
              <div className="text-2xl font-bold text-yellow-400">{stats.featuredCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Store className="h-6 w-6 text-purple-400" />
            Marketplace
          </h1>
          <p className="text-muted-foreground">
            {pagination.total} marketplace items
          </p>
        </div>

        <div className="flex gap-2">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search plugins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-card border-border text-foreground w-56"
              />
            </div>
            <Button type="submit" variant="outline" className="border-border">
              Search
            </Button>
          </form>
          <Button asChild className="bg-purple-600 hover:bg-purple-700">
            <Link href="/admin/marketplace/new">
              <Plus className="h-4 w-4 mr-1" />
              Add Plugin
            </Link>
          </Button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground py-1">Filter:</span>
        {["messaging", "analytics", "automation", "utilities", "general"].map((cat) => (
          <Button
            key={cat}
            variant={categoryFilter === cat ? "default" : "outline"}
            size="sm"
            onClick={() => handleCategoryFilter(cat)}
            className={`border-border capitalize ${categoryFilter === cat ? "bg-purple-600" : ""}`}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Items table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Plugin</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Difficulty</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Installs</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Featured</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <ItemRowSkeleton />
                    <ItemRowSkeleton />
                    <ItemRowSkeleton />
                    <ItemRowSkeleton />
                    <ItemRowSkeleton />
                  </>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No marketplace items found
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.slug}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-foreground font-medium flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            {item.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {item.slug} · v{item.version}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={item.category} />
                      </td>
                      <td className="px-4 py-3">
                        <DifficultyBadge difficulty={item.difficulty} />
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div className="flex items-center gap-1">
                          <Download className="h-3 w-3 text-muted-foreground" />
                          {item.installCount}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePublished(item.slug)}
                          disabled={togglingSlug === item.slug}
                          className="h-7 px-2"
                        >
                          <Badge className={item.isActive ? "bg-green-600" : "bg-muted"}>
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFeatured(item.slug)}
                          disabled={togglingSlug === item.slug}
                          className="h-7 px-2"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              item.isFeatured
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <Link href={`/admin/marketplace/${item.slug}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-8 w-8 p-0"
                          >
                            <Link href={`/admin/marketplace/${item.slug}`}>
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Link>
                          </Button>
                        </div>
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
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="border-border"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
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
