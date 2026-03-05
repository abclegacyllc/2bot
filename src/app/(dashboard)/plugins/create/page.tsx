"use client";

/**
 * Create Custom Plugin Page
 *
 * Full-featured form for creating a custom plugin with:
 * - Template picker (optional starter template)
 * - Metadata form (slug, name, description, category, tags)
 * - Code editor for plugin JavaScript
 * - Gateway selection
 *
 * @module app/(dashboard)/plugins/create
 */

import { useCallback, useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { PluginCodeEditor } from "@/components/plugins/plugin-code-editor";
import { TemplatePicker } from "@/components/plugins/template-picker";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { GatewayOption } from "@/lib/api-client";
import { createCustomPlugin, createPluginFromRepo, getOrgGateways, getPluginTemplate, getUserGateways } from "@/lib/api-client";
import type { ConfigSchema, CreateCustomPluginRequest, PluginCategory, PluginDirectoryTemplate } from "@/shared/types/plugin";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ===========================================
// Constants
// ===========================================

const CATEGORIES: { value: PluginCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "analytics", label: "Analytics" },
  { value: "messaging", label: "Messaging" },
  { value: "automation", label: "Automation" },
  { value: "moderation", label: "Moderation" },
  { value: "utilities", label: "Utilities" },
];

const DEFAULT_CODE = `'use strict';

/**
 * My Custom Plugin
 *
 * Uses the 2Bot Plugin SDK for storage and gateway access.
 */

const { storage, gateway } = require('/bridge-agent/plugin-sdk');

async function main() {
  console.log('[my-plugin] Plugin started');

  // Your plugin code here
}

main().catch(err => {
  console.error('[my-plugin] Fatal error:', err);
  process.exit(1);
});
`;

/** Default file set for a blank directory plugin */
const DEFAULT_DIR_FILES: Record<string, string> = {
  "index.js": `'use strict';

/**
 * My Multi-file Plugin — Entry Point
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  console.log('[my-plugin] Event:', event.type);
});

console.log('[my-plugin] Plugin started');
`,
};

// ===========================================
// Main Content
// ===========================================

function CreatePluginContent() {
  const { token, context } = useAuth();
  const router = useRouter();
  const isOrgContext = context.type === "organization" && !!context.organizationId;
  const orgId = context.organizationId;

  // Form state
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PluginCategory>("general");
  const [tags, setTags] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [configSchema, setConfigSchema] = useState<ConfigSchema | undefined>(undefined);
  const [requiredGateways, setRequiredGateways] = useState<string[]>([]);
  const [gatewayId, setGatewayId] = useState<string | null>(null);
  const [gateways, setGateways] = useState<GatewayOption[]>([]);

  // Directory (multi-file) plugin state
  const [isDirectory, setIsDirectory] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>(DEFAULT_DIR_FILES);
  const [entry, setEntry] = useState("index.js");
  const [activeFilePath, setActiveFilePath] = useState("index.js");
  const [newFileName, setNewFileName] = useState("");

  // UI state
  const [step, setStep] = useState<"template" | "form" | "git-clone">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Git clone state
  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  // Fetch gateways when required gateways are set
  useEffect(() => {
    if (requiredGateways.length === 0) {
      setGateways([]);
      return;
    }
    (async () => {
      try {
        const result = isOrgContext && orgId
          ? await getOrgGateways(orgId, token || undefined)
          : await getUserGateways(token || undefined);
        if (result.success && result.data) {
          const matching = result.data.filter((g) => requiredGateways.includes(g.type));
          setGateways(matching);
        }
      } catch {
        // non-critical
      }
    })();
  }, [requiredGateways, token, isOrgContext, orgId]);

  // Check for template query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get("template");
    if (templateId) {
      setSelectedTemplateId(templateId);
      loadTemplate(templateId);
      setStep("form");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplate = useCallback(
    async (templateId: string) => {
      setLoadingTemplate(true);
      try {
        const result = await getPluginTemplate(templateId, token || undefined);
        if (result.success && result.data) {
          const t = result.data;

          // Handle directory templates
          if ('isDirectory' in t && t.isDirectory) {
            const dirT = t as PluginDirectoryTemplate;
            setIsDirectory(true);
            setFiles({ ...dirT.files });
            setEntry(dirT.entry || "index.js");
            setActiveFilePath(dirT.entry || "index.js");
            setCode(""); // not used in directory mode
          } else {
            setIsDirectory(false);
            if ('code' in t) setCode(t.code);
          }

          setCategory(t.category);
          setTags(t.tags.join(", "));
          if (t.configSchema && Object.keys(t.configSchema).length > 0) {
            setConfigSchema(t.configSchema as ConfigSchema);
          }
          if (t.requiredGateways?.length) {
            setRequiredGateways(t.requiredGateways);
          }
          if (!name) setName(t.name.replace(" Template", "").replace(" Bot", " Bot"));
          if (!description) setDescription(t.description);
        }
      } catch {
        setError("Failed to load template");
      } finally {
        setLoadingTemplate(false);
      }
    },
    [token, name, description]
  );

  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    await loadTemplate(templateId);
    setStep("form");
  };

  // Auto-generate slug from name
  useEffect(() => {
    if (name) {
      setSlug(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .substring(0, 50)
      );
    }
  }, [name]);

  const handleCreate = async () => {
    // Validation
    if (!slug.trim()) {
      setError("Plugin slug is required");
      return;
    }
    if (!name.trim()) {
      setError("Plugin name is required");
      return;
    }
    if (!isDirectory && !code.trim()) {
      setError("Plugin code is required");
      return;
    }
    if (isDirectory && Object.keys(files).length === 0) {
      setError("At least one file is required for directory plugins");
      return;
    }
    if (isDirectory && !(entry in files)) {
      setError(`Entry file "${entry}" must exist in the file list`);
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const data: CreateCustomPluginRequest = {
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        ...(configSchema && Object.keys(configSchema).length > 0 ? { configSchema } : {}),
        ...(requiredGateways.length > 0 ? { requiredGateways } : {}),
        ...(gatewayId ? { gatewayId } : {}),
      };

      if (isDirectory) {
        data.files = files;
        data.entry = entry;
      } else {
        data.code = code;
      }

      const result = await createCustomPlugin(data, token || undefined);

      if (result.success) {
        // Navigate to workspace with the plugin focused
        const focusPath = isDirectory
          ? `plugins/${slug.trim()}`
          : `plugins/${slug.trim()}.js`;
        router.push(`/workspace?focus=${focusPath}`);
      } else {
        setError(result.error?.message || "Failed to create plugin");
      }
    } catch {
      setError("Failed to create plugin");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloneFromRepo = async () => {
    if (!gitUrl.trim()) {
      setError("Git URL is required");
      return;
    }

    setIsCloning(true);
    setError(null);

    try {
      const result = await createPluginFromRepo(
        {
          gitUrl: gitUrl.trim(),
          ...(gitBranch.trim() ? { branch: gitBranch.trim() } : {}),
        },
        token || undefined
      );

      if (result.success && result.data) {
        // Navigate to workspace with the plugin directory focused
        const repoName = gitUrl.trim().replace(/\.git$/, '').split('/').pop() || 'plugin';
        router.push(`/workspace?focus=plugins/${repoName}`);
      } else {
        setError(result.error?.message || "Failed to clone repository");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone repository");
    } finally {
      setIsCloning(false);
    }
  };

  // Template selection step
  if (step === "template") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Create Custom Plugin</h1>
              <p className="text-muted-foreground mt-1">
                Choose a template, clone a Git repo, or create from scratch
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push("/plugins")}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("git-clone")}
                className="border-border text-foreground"
              >
                Clone from Git
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDirectory(true);
                  setFiles({ ...DEFAULT_DIR_FILES });
                  setEntry("index.js");
                  setActiveFilePath("index.js");
                  setStep("form");
                }}
                className="border-border text-foreground"
              >
                Multi-file Plugin
              </Button>
              <Button
                onClick={() => {
                  setIsDirectory(false);
                  setStep("form");
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-ai-target="start-from-scratch-btn"
              >
                Start from Scratch
              </Button>
            </div>
          </div>

          <TemplatePicker
            onSelect={handleTemplateSelect}
            selectedId={selectedTemplateId || undefined}
            token={token || undefined}
          />
        </div>
      </div>
    );
  }

  // Git clone step
  if (step === "git-clone") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Clone from Git</h1>
              <p className="text-muted-foreground mt-1">
                Clone a Git repository as a new plugin. The repo should contain a{" "}
                <code className="text-emerald-400 bg-muted px-1 rounded">plugin.json</code> manifest.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setStep("template")}
              className="border-border text-foreground"
            >
              Back
            </Button>
          </div>

          {/* Error */}
          {error ? (
            <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground">Repository Details</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter the Git URL of the plugin repository
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gitUrl" className="text-foreground">
                  Git URL *
                </Label>
                <Input
                  id="gitUrl"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/my-plugin.git"
                  className="bg-muted border-border text-foreground"
                  data-ai-target="git-url-input"
                />
                <p className="text-xs text-muted-foreground">
                  HTTPS or SSH URL of the Git repository
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gitBranch" className="text-foreground">
                  Branch (optional)
                </Label>
                <Input
                  id="gitBranch"
                  value={gitBranch}
                  onChange={(e) => setGitBranch(e.target.value)}
                  placeholder="main"
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default branch
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <div className="mt-0.5 text-emerald-400">ℹ</div>
                <div>
                  <p className="font-medium text-foreground mb-1">Expected repository structure</p>
                  <pre className="bg-muted p-3 rounded text-xs mt-2">
{`plugin.json       # Plugin manifest (name, slug, entry, etc.)
index.js          # Entry point (or as specified in plugin.json)
package.json      # Optional — dependencies will be auto-installed`}
                  </pre>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setStep("template")}
              className="border-border text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCloneFromRepo}
              disabled={isCloning || !gitUrl.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 px-8"
              data-ai-target="clone-repo-btn"
            >
              {isCloning ? "Cloning..." : "Clone & Create Plugin"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Form step
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Create Custom Plugin</h1>
            <p className="text-muted-foreground mt-1">
              {selectedTemplateId
                ? "Customize your plugin based on the selected template"
                : "Write your own plugin from scratch"}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (selectedTemplateId) {
                  setStep("template");
                } else {
                  router.push("/plugins");
                }
              }}
              className="border-border text-foreground"
            >
              {selectedTemplateId ? "Change Template" : "Cancel"}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Plugin Metadata */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">Plugin Details</CardTitle>
            <CardDescription className="text-muted-foreground">
              Basic information about your plugin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">
                  Name *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Plugin"
                  className="bg-muted border-border text-foreground"
                  data-ai-target="plugin-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug" className="text-foreground">
                  Slug *
                </Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-awesome-plugin"
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier. Letters, numbers, and hyphens only.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-foreground">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your plugin does..."
                rows={3}
                className="bg-muted border-border text-foreground"
                data-ai-target="plugin-description-input"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-foreground">
                  Category
                </Label>
                <Select
                  value={category}
                  onValueChange={(val) => setCategory(val as PluginCategory)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags" className="text-foreground">
                  Tags
                </Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="tag1, tag2, tag3"
                  className="bg-muted border-border text-foreground"
                />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gateway Configuration */}
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">Gateway</CardTitle>
            <CardDescription className="text-muted-foreground">
              Select the gateway type(s) your plugin needs, then pick a specific gateway to connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Gateway type selector */}
            <div className="space-y-2">
              <Label className="text-foreground text-sm">Gateway Type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  { type: "TELEGRAM_BOT", label: "Telegram Bot", desc: "Receive messages from Telegram", icon: "🤖" },
                  { type: "AI", label: "AI Provider", desc: "Use AI models in your plugin", icon: "🧠" },
                  { type: "CUSTOM_GATEWAY", label: "Custom Gateway", desc: "Receive webhooks from external services", icon: "🔗" },
                ] as const).map((gw) => {
                  const isSelected = requiredGateways.includes(gw.type);
                  return (
                    <button
                      key={gw.type}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setRequiredGateways((prev) => prev.filter((t) => t !== gw.type));
                          setGatewayId(null);
                        } else {
                          setRequiredGateways((prev) => [...prev, gw.type]);
                        }
                      }}
                      className={`relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-950/30"
                          : "border-border bg-muted/50 hover:bg-muted"
                      }`}
                    >
                      <span className="text-lg">{gw.icon}</span>
                      <span className="text-sm font-medium text-foreground">{gw.label}</span>
                      <span className="text-xs text-muted-foreground">{gw.desc}</span>
                      {isSelected ? (
                        <span className="absolute top-2 right-2 text-emerald-400 text-xs">✓</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Select none if your plugin doesn&apos;t need a gateway. You can change this later in plugin settings.
              </p>
            </div>

            {/* Gateway instance selector (when types selected) */}
            {requiredGateways.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-foreground text-sm">Connect Gateway</Label>
                {gateways.length === 0 ? (
                  <div className="p-3 rounded bg-yellow-900/20 border border-yellow-800/50 text-yellow-300 text-sm">
                    No matching gateways found. Create a {requiredGateways.join(" or ")} gateway in the{" "}
                    <Link href="/gateways" className="underline hover:no-underline">Gateways page</Link> first.
                  </div>
                ) : (
                  <Select
                    value={gatewayId ?? "__none__"}
                    onValueChange={(val) => setGatewayId(val === "__none__" ? null : val)}
                  >
                    <SelectTrigger className="w-full bg-muted border-border text-foreground">
                      <SelectValue placeholder="— Select a gateway —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select a gateway —</SelectItem>
                      {gateways.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} ({g.type}) — {g.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Code Editor — single-file or multi-file */}
        {isDirectory ? (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Plugin Files</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Multi-file directory plugin. Edit each file and manage the file structure below.
                  </CardDescription>
                </div>
                <span className="px-2 py-1 rounded text-xs bg-purple-900/50 text-purple-300">
                  📁 Directory Plugin
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File tabs */}
              <div className="flex flex-wrap gap-1 border-b border-border pb-2">
                {Object.keys(files).sort().map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => setActiveFilePath(filePath)}
                    className={`px-3 py-1.5 rounded-t text-xs font-mono transition-colors ${
                      activeFilePath === filePath
                        ? "bg-muted text-foreground border border-b-0 border-border"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {filePath}
                    {filePath === entry && (
                      <span className="ml-1 text-emerald-400" title="Entry file">●</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Active file editor */}
              {activeFilePath && files[activeFilePath] !== undefined ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-muted-foreground">{activeFilePath}</span>
                    <div className="flex gap-2">
                      {activeFilePath !== entry && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEntry(activeFilePath)}
                          className="text-xs text-muted-foreground hover:text-emerald-400"
                        >
                          Set as Entry
                        </Button>
                      )}
                      {Object.keys(files).length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newFiles = { ...files };
                            delete newFiles[activeFilePath];
                            setFiles(newFiles);
                            // If we deleted the entry, reset entry to first available file
                            if (activeFilePath === entry) {
                              setEntry(Object.keys(newFiles)[0] ?? 'index.js');
                            }
                            setActiveFilePath(Object.keys(newFiles)[0] ?? 'index.js');
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete File
                        </Button>
                      )}
                    </div>
                  </div>
                  <PluginCodeEditor
                    value={files[activeFilePath]}
                    onChange={(val) => setFiles((prev) => ({ ...prev, [activeFilePath]: val }))}
                  />
                </div>
              ) : null}

              {/* Add new file */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="path/to/new-file.js"
                  className="bg-muted border-border text-foreground text-sm font-mono flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileName.trim()) {
                      const path = newFileName.trim();
                      if (!files[path]) {
                        setFiles((prev) => ({ ...prev, [path]: `'use strict';\n\n// ${path}\n` }));
                        setActiveFilePath(path);
                        setNewFileName("");
                      }
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!newFileName.trim() || !!files[newFileName.trim()]}
                  onClick={() => {
                    const path = newFileName.trim();
                    if (path && !files[path]) {
                      setFiles((prev) => ({ ...prev, [path]: `'use strict';\n\n// ${path}\n` }));
                      setActiveFilePath(path);
                      setNewFileName("");
                    }
                  }}
                  className="border-border text-foreground"
                >
                  Add File
                </Button>
              </div>

              {/* Entry file info */}
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="text-emerald-400">●</span>
                Entry file: <code className="text-emerald-400 bg-muted px-1 rounded">{entry}</code>
                — this file is executed when the plugin starts.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card/50">
            <CardHeader>
              <CardTitle className="text-foreground">Plugin Code</CardTitle>
              <CardDescription className="text-muted-foreground">
                Write JavaScript code that runs in a workspace container. Use{" "}
                <code className="text-emerald-400 bg-muted px-1 rounded">
                  require(&apos;/bridge-agent/plugin-sdk&apos;)
                </code>{" "}
                for storage and gateway access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTemplate ? (
                <div className="h-[400px] bg-muted rounded-lg animate-pulse flex items-center justify-center">
                  <span className="text-muted-foreground">Loading template code...</span>
                </div>
              ) : (
                <PluginCodeEditor value={code} onChange={setCode} />
              )}
            </CardContent>
          </Card>
        )}

        {/* Create button */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => router.push("/plugins")}
            className="border-border text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              isCreating ||
              !slug.trim() ||
              !name.trim() ||
              (!isDirectory && !code.trim()) ||
              (isDirectory && Object.keys(files).length === 0)
            }
            className="bg-emerald-600 hover:bg-emerald-700 px-8"
            data-ai-target="save-plugin-btn"
          >
            {isCreating ? "Creating..." : isDirectory ? "Create Directory Plugin" : "Create Plugin"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Page Export
// ===========================================

export default function CreatePluginPage() {
  return (
    <ProtectedRoute>
      <CreatePluginContent />
    </ProtectedRoute>
  );
}
