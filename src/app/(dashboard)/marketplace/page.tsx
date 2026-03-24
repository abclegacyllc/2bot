"use client";

/**
 * Marketplace Browse Page
 *
 * User-facing marketplace for browsing and discovering plugins.
 * Features: search, category filter, sort, grid layout with plugin cards.
 * Uses public marketplace API (no auth required for browsing).
 *
 * @module app/(dashboard)/marketplace/page
 */

import { PluginIcon } from "@/components/plugins/plugin-icon";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Download,
    Search,
    Star,
    Store,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface MarketplaceItem {
  slug: string;
  name: string;
  type: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
  author: string;
  difficulty: string;
  requiredGateways: string[];
  layout: string;
  installCount: number;
  isFeatured: boolean;
}

export default function MarketplaceBrowsePage() {
  const { token } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [featured, setFeatured] = useState<MarketplaceItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "12");
      if (search) params.set("search", search);
      if (selectedCategory) params.set("category", selectedCategory);

      const res = await fetch(apiUrl(`/marketplace?${params.toString()}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error("Failed to load marketplace");

      const data = await res.json();
      setItems(data.data);
      setTotalPages(data.meta?.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, selectedCategory]);

  const fetchFeaturedAndCategories = useCallback(async () => {
    try {
      const [featuredRes, catRes] = await Promise.all([
        fetch(apiUrl("/marketplace/featured"), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(apiUrl("/marketplace/categories"), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      if (featuredRes.ok) {
        const fd = await featuredRes.json();
        setFeatured(fd.data || []);
      }
      if (catRes.ok) {
        const cd = await catRes.json();
        setCategories((cd.data || []).map((c: { slug: string }) => c.slug));
      }
    } catch {
      // Non-critical — featured/categories are supplementary
    }
  }, [token]);

  useEffect(() => {
    fetchFeaturedAndCategories();
  }, [fetchFeaturedAndCategories]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const handleCategoryFilter = (cat: string) => {
    setSelectedCategory((prev) => (prev === cat ? "" : cat));
    setPage(1);
  };

  const difficultyColor = (d: string) => {
    switch (d) {
      case "beginner":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "intermediate":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "advanced":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
            <Store className="h-6 w-6 sm:h-8 sm:w-8" />
            Marketplace
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Discover and install plugins to extend your bots
          </p>
        </div>
        <Link href="/marketplace/installed">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            My Installed
          </Button>
        </Link>
      </div>

      {/* Search & Category Filters */}
      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search plugins..."
            className="pl-9"
          />
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => handleCategoryFilter(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Featured Section */}
      {featured.length > 0 && !search && !selectedCategory ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            Featured
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((item) => (
              <Link key={item.slug} href={`/marketplace/${item.slug}`}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer border-yellow-200/50 dark:border-yellow-900/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <PluginIcon icon={item.icon} name={item.name} size="lg" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{item.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          by {item.author} &middot; v{item.version}
                        </CardDescription>
                      </div>
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                      <Badge className={`text-xs ${difficultyColor(item.difficulty)}`}>
                        {item.difficulty}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                        <Download className="h-3 w-3" />
                        {item.installCount}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Plugin Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Store className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {search || selectedCategory
                ? "No plugins match your search criteria"
                : "No plugins available yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Link key={item.slug} href={`/marketplace/${item.slug}`}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <PluginIcon icon={item.icon} name={item.name} />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{item.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          by {item.author} &middot; v{item.version}
                        </CardDescription>
                      </div>
                      {item.isFeatured ? (
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                      <Badge className={`text-xs ${difficultyColor(item.difficulty)}`}>
                        {item.difficulty}
                      </Badge>
                      {item.requiredGateways.map((gw) => (
                        <Badge key={gw} variant="secondary" className="text-xs">
                          {gw}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                        <Download className="h-3 w-3" />
                        {item.installCount}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
