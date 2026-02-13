"use client";

/**
 * Admin Knowledge Base Management
 * 
 * Create, edit, publish/unpublish KB articles.
 * 
 * @module app/(admin)/admin/support/kb/page
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface KBArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  category: string;
  tags: string[];
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
  author?: { name: string | null; email: string };
}

const CATEGORIES = [
  { value: "getting_started", label: "Getting Started" },
  { value: "gateways", label: "Gateways" },
  { value: "plugins", label: "Plugins" },
  { value: "billing", label: "Billing" },
  { value: "troubleshooting", label: "Troubleshooting" },
];

const CATEGORY_COLORS: Record<string, string> = {
  getting_started: "bg-green-500/10 text-green-500",
  gateways: "bg-blue-500/10 text-blue-500",
  plugins: "bg-purple-500/10 text-purple-500",
  billing: "bg-yellow-500/10 text-yellow-500",
  troubleshooting: "bg-red-500/10 text-red-500",
};

export default function AdminKBPage() {
  const { token } = useAuth();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingArticle, setEditingArticle] = useState<KBArticle | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formExcerpt, setFormExcerpt] = useState("");
  const [formCategory, setFormCategory] = useState("getting_started");
  const [formTags, setFormTags] = useState("");

  // Fetch articles
  const fetchArticles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/support/admin/kb?limit=50"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArticles(data.data.articles || []);
      }
    } catch {
      setError("Failed to load articles");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Reset form
  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormExcerpt("");
    setFormCategory("getting_started");
    setFormTags("");
    setEditingArticle(null);
  };

  // Start editing
  const startEdit = (article: KBArticle) => {
    setFormTitle(article.title);
    setFormContent(article.content);
    setFormExcerpt(article.excerpt || "");
    setFormCategory(article.category);
    setFormTags(article.tags.join(", "));
    setEditingArticle(article);
    setView("edit");
  };

  // Save article (create or update)
  const saveArticle = async () => {
    if (!token || !formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: formTitle.trim(),
        content: formContent.trim(),
        excerpt: formExcerpt.trim() || undefined,
        category: formCategory,
        tags: formTags.split(",").map(t => t.trim()).filter(Boolean),
      };

      const isEdit = view === "edit" && editingArticle;
      const url = isEdit
        ? apiUrl(`/support/admin/kb/${editingArticle.id}`)
        : apiUrl("/support/admin/kb");

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        resetForm();
        setView("list");
        fetchArticles();
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to save article");
      }
    } catch {
      setError("Failed to save article");
    } finally {
      setSaving(false);
    }
  };

  // Toggle publish
  const togglePublish = async (article: KBArticle) => {
    if (!token) return;
    const action = article.isPublished ? "unpublish" : "publish";
    try {
      await fetch(apiUrl(`/support/admin/kb/${article.id}/${action}`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchArticles();
    } catch {
      setError(`Failed to ${action} article`);
    }
  };

  // Delete article
  const deleteArticle = async (article: KBArticle) => {
    if (!token || !confirm(`Delete "${article.title}"? This cannot be undone.`)) return;
    try {
      await fetch(apiUrl(`/support/admin/kb/${article.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchArticles();
    } catch {
      setError("Failed to delete article");
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="bg-card border-red-800 p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-6 w-6" />
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Create / Edit form
  if (view === "create" || view === "edit") {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { resetForm(); setView("list"); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">
            {view === "edit" ? "Edit Article" : "New Article"}
          </h1>
        </div>

        <Card className="bg-card">
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Title</label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Article title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Category</label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Tags (comma-separated)</label>
                <Input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="gateway, telegram, setup"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Excerpt (optional)</label>
              <Input
                value={formExcerpt}
                onChange={(e) => setFormExcerpt(e.target.value)}
                placeholder="Short summary shown in article lists"
              />
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Content (Markdown)</label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write article content in Markdown..."
                className="min-h-[400px] font-mono text-sm"
                rows={20}
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={saveArticle}
                disabled={!formTitle.trim() || !formContent.trim() || saving}
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" /> {view === "edit" ? "Update" : "Create"} Article</>
                )}
              </Button>
              <Button variant="outline" onClick={() => { resetForm(); setView("list"); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Articles list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground">Manage help articles for your users</p>
        </div>
        <Button onClick={() => { resetForm(); setView("create"); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Article
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4 flex gap-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-3">No articles yet</p>
            <Button onClick={() => { resetForm(); setView("create"); }}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Article
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <Card key={article.id} className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-foreground truncate">
                        {article.title}
                      </h3>
                      {article.isPublished ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-500 text-[10px]">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="secondary" className={`text-[10px] ${CATEGORY_COLORS[article.category] || ""}`}>
                        {CATEGORIES.find(c => c.value === article.category)?.label || article.category}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {article.viewCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" /> {article.helpfulCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3" /> {article.notHelpfulCount}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={article.isPublished ? "Unpublish" : "Publish"}
                      onClick={() => togglePublish(article)}
                    >
                      {article.isPublished ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-green-500" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit"
                      onClick={() => startEdit(article)}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Delete"
                      onClick={() => deleteArticle(article)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
