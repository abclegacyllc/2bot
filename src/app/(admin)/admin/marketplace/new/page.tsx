"use client";

/**
 * Admin Create New Marketplace Plugin Page
 *
 * Form for uploading a new plugin to the marketplace:
 * - Slug, name, description, category, difficulty
 * - Code (single-file textarea or multi-file entries)
 * - Config schema (JSON)
 * - Required gateways, tags, icon
 *
 * @module app/(admin)/admin/marketplace/new/page
 */

import { PageHeader } from "@/components/navigation";
import { useAuth } from "@/components/providers/auth-provider";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import { adminApiUrl } from "@/shared/config/urls";
import { AlertTriangle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = ["general", "analytics", "messaging", "automation", "moderation", "utilities"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const GATEWAY_TYPES = ["DISCORD", "TELEGRAM", "SLACK", "WHATSAPP", "WEB"];

export default function AdminMarketplaceNewPage() {
  const router = useRouter();
  const { token } = useAuth();
  const canWrite = usePermission("admin:marketplace:write");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [difficulty, setDifficulty] = useState("beginner");
  const [version, setVersion] = useState("1.0.0");
  const [author, setAuthor] = useState("2bot");
  const [icon, setIcon] = useState("puzzle");
  const [tags, setTags] = useState("");
  const [requiredGateways, setRequiredGateways] = useState<string[]>([]);
  const [code, setCode] = useState(`// Plugin code here
module.exports = function(bot) {
  bot.on('message', async (ctx) => {
    // Handle messages
  });
};`);
  const [configSchemaText, setConfigSchemaText] = useState("{}");

  const handleSlugChange = (value: string) => {
    // Auto-format slug: lowercase, replace spaces with hyphens, strip invalid chars
    setSlug(value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""));
  };

  const toggleGateway = (gw: string) => {
    setRequiredGateways((prev) =>
      prev.includes(gw) ? prev.filter((g) => g !== gw) : [...prev, gw],
    );
  };

  const handleSubmit = async () => {
    if (!token) return;

    // Validation
    if (!slug) {
      setError("Slug is required");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError("Slug must be lowercase alphanumeric with hyphens only");
      return;
    }
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!code.trim()) {
      setError("Plugin code is required");
      return;
    }

    let configSchema: Record<string, unknown> = {};
    try {
      configSchema = JSON.parse(configSchemaText);
    } catch {
      setError("Config schema must be valid JSON");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(adminApiUrl("/marketplace/items"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          manifest: {
            slug,
            name,
            description,
            category,
            difficulty,
            version,
            author,
            icon,
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            requiredGateways,
            configSchema,
          },
          code,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || "Failed to create plugin");
      }

      router.push("/admin/marketplace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create plugin");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canWrite) {
    return (
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p>You do not have permission to create marketplace items.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Plugin"
        description="Create a new marketplace plugin from code"
        breadcrumbs={[{ label: "Marketplace", href: "/admin/marketplace" }]}
        actions={
          <Button onClick={handleSubmit} disabled={submitting}>
            <Upload className="h-4 w-4 mr-2" />
            {submitting ? "Creating..." : "Create Plugin"}
          </Button>
        }
      />

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

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Set the plugin identity and metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="my-plugin"
              />
              <p className="text-xs text-muted-foreground">Unique identifier (lowercase, hyphens)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Plugin"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="2bot"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
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
              <Select value={difficulty} onValueChange={setDifficulty}>
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

            <div className="space-y-2">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="puzzle"
              />
              <p className="text-xs text-muted-foreground">Lucide icon name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
              <p className="text-xs text-muted-foreground">Comma-separated</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this plugin do?"
            />
          </div>
        </CardContent>
      </Card>

      {/* Required Gateways */}
      <Card>
        <CardHeader>
          <CardTitle>Required Gateways</CardTitle>
          <CardDescription>Select which gateway types this plugin requires to function.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {GATEWAY_TYPES.map((gw) => (
              <Button
                key={gw}
                variant={requiredGateways.includes(gw) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleGateway(gw)}
              >
                {gw}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plugin Code */}
      <Card>
        <CardHeader>
          <CardTitle>Plugin Code</CardTitle>
          <CardDescription>The JavaScript code that powers this plugin. Will be saved as code.js.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={20}
            className="font-mono text-sm"
            placeholder="module.exports = function(bot) { ... }"
          />
        </CardContent>
      </Card>

      {/* Config Schema */}
      <Card>
        <CardHeader>
          <CardTitle>Config Schema</CardTitle>
          <CardDescription>JSON schema for plugin configuration options. Leave as {"{ }"} if none.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={configSchemaText}
            onChange={(e) => setConfigSchemaText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            placeholder='{ "apiKey": { "type": "string", "label": "API Key" } }'
          />
        </CardContent>
      </Card>
    </div>
  );
}
