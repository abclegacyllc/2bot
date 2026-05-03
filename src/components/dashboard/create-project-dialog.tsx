"use client";

/**
 * Create-project dialog — Wave 3
 *
 * Modal that lets a user create a new project (BOT/WEB_APP/AUTOMATION/HYBRID).
 * Wraps `createProject` from the api-client and forwards `x-organization-id`
 * when an org context is active.
 *
 * Slug is auto-derived from the name unless edited; the server still
 * sanitises and uniquifies on its end.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/components/providers/auth-provider";
import { createProject, type ProjectKind } from "@/lib/api-client";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

const KIND_OPTIONS: { value: ProjectKind; label: string; hint: string }[] = [
  { value: "BOT", label: "Bot", hint: "Telegram / Discord / Slack / WhatsApp bot" },
  { value: "WEB_APP", label: "Web app", hint: "Hosted web frontend / API" },
  { value: "AUTOMATION", label: "Automation", hint: "Webhook or schedule-driven workflow" },
  { value: "HYBRID", label: "Hybrid", hint: "Multiple kinds in one project" },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export interface CreateProjectDialogProps {
  trigger: ReactNode;
  onCreated?: (projectId: string) => void;
}

export function CreateProjectDialog({ trigger, onCreated }: CreateProjectDialogProps) {
  const { token, context } = useAuth();
  const orgId =
    context.type === "organization" ? context.organizationId ?? null : null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<ProjectKind>("BOT");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setKind("BOT");
    setDescription("");
    setError(null);
    setSubmitting(false);
  };

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createProject(
        {
          name: name.trim(),
          slug: slug.trim() || undefined,
          kind,
          description: description.trim() || null,
        },
        { organizationId: orgId },
        token ?? undefined,
      );
      if (!res.success || !res.data) {
        setError(res.error?.message || "Failed to create project");
        setSubmitting(false);
        return;
      }
      const projectId = res.data.id;
      setOpen(false);
      reset();
      onCreated?.(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project groups gateways, plugins, and workflows that ship together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cp-name">Name</Label>
            <Input
              id="cp-name"
              autoFocus
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My new project"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-slug">Slug</Label>
            <Input
              id="cp-slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              placeholder="my-new-project"
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Used in URLs and plugin paths. Lowercase, hyphens only.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ProjectKind)}>
              <SelectTrigger id="cp-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-description">Description (optional)</Label>
            <Textarea
              id="cp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this project do?"
              rows={2}
              maxLength={500}
            />
          </div>
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
