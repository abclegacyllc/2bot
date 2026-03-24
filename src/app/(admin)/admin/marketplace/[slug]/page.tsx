"use client";

/**
 * Admin Marketplace Item Detail / Editor Page
 *
 * View and edit a marketplace plugin:
 * - Manifest metadata (name, description, category, difficulty, tags)
 * - DB status (active, featured, install count)
 * - Toggle publish / featured inline
 * - Save metadata changes
 * - Delete / delist action
 *
 * @module app/(admin)/admin/marketplace/[slug]/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { adminApiUrl } from "@/shared/config/urls";
import {
    AlertTriangle,
    Calendar,
    Download,
    Eye,
    FolderOpen,
    Package,
    Save,
    Star,
    Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ItemManifest {
  slug: string;
  name: string;
  version: string;
  description: string;
  category: string;
  difficulty: string;
  icon: string;
  tags: string[];
  layout: string;
  entryFile: string;
  author: string;
  requiredGateways: string[];
  configSchema: Record<string, unknown>;
  eventTypes?: string[];
  eventRole?: string;
}

interface ItemDbRecord {
  id: string;
  isActive: boolean;
  isFeatured: boolean;
  bundlePath: string;
  installCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ItemDetail {
  manifest: ItemManifest;
  dbRecord: ItemDbRecord | null;
}

const CATEGORIES = ["general", "analytics", "messaging", "automation", "moderation", "utilities"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

export default function AdminMarketplaceItemPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const canWrite = usePermission("admin:marketplace:write");
  const canDelete = usePermission("admin:marketplace:delete");
  const slug = params.slug as string;

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCategory, setEditedCategory] = useState("");
  const [editedDifficulty, setEditedDifficulty] = useState("");
  const [editedTags, setEditedTags] = useState("");
  const [editedIcon, setEditedIcon] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const fetchItem = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const res = await fetch(adminApiUrl(`/marketplace/items/${slug}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to fetch item");

      const data = await res.json();
      const detail: ItemDetail = data.data;
      setItem(detail);
      setEditedName(detail.manifest.name);
      setEditedDescription(detail.manifest.description);
      setEditedCategory(detail.manifest.category);
      setEditedDifficulty(detail.manifest.difficulty);
      setEditedTags((detail.manifest.tags || []).join(", "));
      setEditedIcon(detail.manifest.icon);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [token, slug]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  useEffect(() => {
    if (!item) return;
    const m = item.manifest;
    const changed =
      editedName !== m.name ||
      editedDescription !== m.description ||
      editedCategory !== m.category ||
      editedDifficulty !== m.difficulty ||
      editedTags !== (m.tags || []).join(", ") ||
      editedIcon !== m.icon;
    setHasChanges(changed);
  }, [editedName, editedDescription, editedCategory, editedDifficulty, editedTags, editedIcon, item]);

  const handleSave = async () => {
    if (!token || !item) return;

    try {
      setSaving(true);
      const res = await fetch(adminApiUrl(`/marketplace/items/${slug}`), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editedName,
          description: editedDescription,
          category: editedCategory,
          difficulty: editedDifficulty,
          tags: editedTags.split(",").map((t) => t.trim()).filter(Boolean),
          icon: editedIcon,
        }),
      });

      if (!res.ok) throw new Error("Failed to save changes");

      await fetchItem();
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async () => {
    if (!token) return;

    try {
      const res = await fetch(adminApiUrl(`/marketplace/items/${slug}/feature`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to toggle featured");
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle featured");
    }
  };

  const handleTogglePublished = async () => {
    if (!token) return;

    try {
      const res = await fetch(adminApiUrl(`/marketplace/items/${slug}/publish`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to toggle published");
      await fetchItem();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  const handleDelete = async () => {
    if (!token || !item) return;
    if (!confirm(`Are you sure you want to delist "${item.manifest.name}"? This will hide it from the marketplace.`)) {
      return;
    }

    try {
      setDeleting(true);
      const res = await fetch(adminApiUrl(`/marketplace/items/${slug}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delist item");
      router.push("/admin/marketplace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delist item");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p>{error || "Item not found"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { manifest, dbRecord } = item;

  return (
    <div className="space-y-6">
      <PageHeader
        title={manifest.name}
        description={`${manifest.slug} v${manifest.version}`}
        breadcrumbs={[{ label: "Marketplace", href: "/admin/marketplace" }]}
        actions={
          <div className="flex items-center gap-2">
            {hasChanges && canWrite ? (
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            ) : null}
            {canDelete && dbRecord ? (
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "Delisting..." : "Delist"}
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={dbRecord?.isActive ? "default" : "secondary"}>
                  {dbRecord?.isActive ? "Published" : "Draft"}
                </Badge>
              </div>
              {canWrite && dbRecord ? (
                <Switch
                  checked={dbRecord.isActive}
                  onCheckedChange={handleTogglePublished}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Featured</p>
                <div className="flex items-center gap-1">
                  <Star className={`h-4 w-4 ${dbRecord?.isFeatured ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{dbRecord?.isFeatured ? "Yes" : "No"}</span>
                </div>
              </div>
              {canWrite && dbRecord ? (
                <Switch
                  checked={dbRecord.isFeatured}
                  onCheckedChange={handleToggleFeatured}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{dbRecord?.installCount ?? 0}</p>
                <p className="text-sm text-muted-foreground">Installs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{manifest.layout}</p>
                <p className="text-sm text-muted-foreground">{manifest.entryFile}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle>Plugin Metadata</CardTitle>
          <CardDescription>Edit the plugin manifest metadata. Changes are saved to both the database and the filesystem manifest.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                disabled={!canWrite}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={editedIcon}
                onChange={(e) => setEditedIcon(e.target.value)}
                disabled={!canWrite}
                placeholder="lucide icon name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={editedCategory}
                onValueChange={setEditedCategory}
                disabled={!canWrite}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select
                value={editedDifficulty}
                onValueChange={setEditedDifficulty}
                disabled={!canWrite}
              >
                <SelectTrigger id="difficulty">
                  <SelectValue placeholder="Select difficulty" />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              disabled={!canWrite}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={editedTags}
              onChange={(e) => setEditedTags(e.target.value)}
              disabled={!canWrite}
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of tags</p>
          </div>
        </CardContent>
      </Card>

      {/* Technical Details */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Details</CardTitle>
          <CardDescription>Read-only technical information about this plugin bundle.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Slug</p>
              <p className="text-sm font-mono">{manifest.slug}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Version</p>
              <p className="text-sm font-mono">{manifest.version}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Author</p>
              <p className="text-sm">{manifest.author}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Layout</p>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{manifest.layout} ({manifest.entryFile})</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Required Gateways</p>
              <div className="flex flex-wrap gap-1">
                {manifest.requiredGateways.length > 0 ? (
                  manifest.requiredGateways.map((gw) => (
                    <Badge key={gw} variant="outline" className="text-xs">
                      {gw}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
            </div>
            {dbRecord?.bundlePath ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Bundle Path</p>
                <p className="text-sm font-mono">{dbRecord.bundlePath}</p>
              </div>
            ) : null}
            {manifest.eventTypes && manifest.eventTypes.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Event Types</p>
                <div className="flex flex-wrap gap-1">
                  {manifest.eventTypes.map((et) => (
                    <Badge key={et} variant="outline" className="text-xs">
                      {et}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {manifest.eventRole ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Event Role</p>
                <p className="text-sm">{manifest.eventRole}</p>
              </div>
            ) : null}
            {Object.keys(manifest.configSchema || {}).length > 0 ? (
              <div className="col-span-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Config Schema</p>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                  {JSON.stringify(manifest.configSchema, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* DB Record Info */}
      {dbRecord ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Database Record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Database ID</p>
                <p className="text-sm font-mono">{dbRecord.id}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm">{new Date(dbRecord.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm">{new Date(dbRecord.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Bundle Path</p>
                <p className="text-sm font-mono">{dbRecord.bundlePath}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 dark:border-amber-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <p>This plugin exists on the filesystem but has no database record. It needs to be seeded or published to appear in the marketplace.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
