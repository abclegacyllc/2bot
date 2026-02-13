/**
 * Support KB Browser Component
 * 
 * Browse and read knowledge base articles inline in the support widget.
 * 
 * @module components/support/support-kb-browser
 */

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/shared/config/urls";
import { ArrowLeft, BookOpen, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface KBArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  category: string;
  tags: string[];
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
}

interface SupportKBBrowserProps {
  authToken: string | null;
  activeSlug?: string | null;
  onSlugChange?: (slug: string | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  getting_started: "Getting Started",
  gateways: "Gateways",
  plugins: "Plugins",
  billing: "Billing",
  troubleshooting: "Troubleshooting",
};

const CATEGORY_COLORS: Record<string, string> = {
  getting_started: "bg-green-500/10 text-green-500",
  gateways: "bg-blue-500/10 text-blue-500",
  plugins: "bg-purple-500/10 text-purple-500",
  billing: "bg-yellow-500/10 text-yellow-500",
  troubleshooting: "bg-red-500/10 text-red-500",
};

export function SupportKBBrowser({
  authToken: _authToken,
  activeSlug,
  onSlugChange,
}: SupportKBBrowserProps) {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"helpful" | "not_helpful" | null>(null);

  // Fetch articles list
  const fetchArticles = useCallback(async () => {
    try {
      const endpoint = searchQuery
        ? apiUrl(`/kb/search?q=${encodeURIComponent(searchQuery)}`)
        : apiUrl("/kb/articles");
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.data.articles || []);
      }
    } catch (err) {
      console.error("Failed to fetch KB articles:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(fetchArticles, searchQuery ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchArticles, searchQuery]);

  // Load article by slug (from external navigation)
  useEffect(() => {
    if (activeSlug) {
      loadArticle(activeSlug);
    }
   
  }, [activeSlug]);

  const loadArticle = async (slug: string) => {
    setLoadingArticle(true);
    setFeedbackGiven(null);
    try {
      const res = await fetch(apiUrl(`/kb/articles/${slug}`));
      if (res.ok) {
        const data = await res.json();
        setSelectedArticle(data.data);
        // Track view
        fetch(apiUrl(`/kb/articles/${data.data.id}/view`), { method: "POST" }).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to load article:", err);
    } finally {
      setLoadingArticle(false);
    }
  };

  const giveFeedback = async (helpful: boolean) => {
    if (!selectedArticle || feedbackGiven) return;
    setFeedbackGiven(helpful ? "helpful" : "not_helpful");
    try {
      await fetch(apiUrl(`/kb/articles/${selectedArticle.id}/feedback`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  const goBack = () => {
    setSelectedArticle(null);
    onSlugChange?.(null);
  };

  // Article detail view
  if (selectedArticle || loadingArticle) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground truncate">
            {selectedArticle ? CATEGORY_LABELS[selectedArticle.category] || selectedArticle.category : "Loading..."}
          </span>
        </div>
        <ScrollArea className="flex-1 px-4 py-3">
          {loadingArticle ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : selectedArticle ? (
            <div>
              <h2 className="text-base font-semibold text-foreground mb-3">
                {selectedArticle.title}
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {selectedArticle.content}
              </div>

              {/* Feedback */}
              <div className="mt-6 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground mb-2">Was this article helpful?</p>
                <div className="flex gap-2">
                  <Button
                    variant={feedbackGiven === "helpful" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => giveFeedback(true)}
                    disabled={!!feedbackGiven}
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" />
                    Yes
                  </Button>
                  <Button
                    variant={feedbackGiven === "not_helpful" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => giveFeedback(false)}
                    disabled={!!feedbackGiven}
                  >
                    <ThumbsDown className="h-3 w-3 mr-1" />
                    No
                  </Button>
                </div>
                {feedbackGiven ? <p className="text-xs text-muted-foreground mt-2">Thanks for your feedback!</p> : null}
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </div>
    );
  }

  // Articles list view
  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search articles..."
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Articles */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <BookOpen className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No articles found" : "No articles yet"}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => {
                  loadArticle(article.slug);
                  onSlugChange?.(article.slug);
                }}
                className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-start gap-2 mb-1">
                  <h3 className="text-sm font-medium text-foreground flex-1 line-clamp-2">
                    {article.title}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {article.excerpt || article.content.slice(0, 120) + "..."}
                </p>
                <Badge
                  variant="secondary"
                  className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[article.category] || ""}`}
                >
                  {CATEGORY_LABELS[article.category] || article.category}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
