"use client";

/**
 * Create-resource dialog for HTTP_ROUTE / SCHEDULE / SECRET (Path C, Phase 7.4).
 *
 * Single dialog that switches form based on the selected kind. GATEWAY_BOT
 * resources are created via the gateway flow elsewhere — this dialog covers
 * only the additive Path C kinds.
 */

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import {
    createProjectResource,
    type HttpMethod,
    type ProjectResourceKind,
} from "@/lib/api-client";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useResourceTargets } from "./useResourceTargets";

type SupportedKind = "HTTP_ROUTE" | "SCHEDULE" | "SECRET";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  token: string | null;
  onCreated: () => void;
}

export function CreateResourceDialog({
  open,
  onOpenChange,
  projectId,
  token,
  onCreated,
}: Props) {
  const [kind, setKind] = useState<SupportedKind>("HTTP_ROUTE");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = useResourceTargets(open, token);

  // HTTP_ROUTE
  const [httpMethod, setHttpMethod] = useState<HttpMethod>("ANY");
  const [httpPath, setHttpPath] = useState("/");
  // "" = no binding; "wf:<id>" = workflow; "up:<id>" = user plugin.
  const [httpTarget, setHttpTarget] = useState<string>("");

  // SCHEDULE
  const [cron, setCron] = useState("0 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [scheduleWorkflowId, setScheduleWorkflowId] = useState<string>("");

  // SECRET
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretDesc, setSecretDesc] = useState("");

  function reset() {
    setName("");
    setHttpPath("/");
    setHttpMethod("ANY");
    setHttpTarget("");
    setCron("0 * * * *");
    setTimezone("UTC");
    setScheduleWorkflowId("");
    setSecretKey("");
    setSecretValue("");
    setSecretDesc("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (kind === "HTTP_ROUTE" && !httpPath.startsWith("/")) {
      setError("Path must start with '/'");
      return;
    }
    if (kind === "SECRET" && !/^[A-Z0-9_]{1,128}$/.test(secretKey)) {
      setError("Key must match ^[A-Z0-9_]{1,128}$");
      return;
    }
    if (kind === "SECRET" && !secretValue) {
      setError("Secret value is required");
      return;
    }

    setSubmitting(true);
    try {
      const body: Parameters<typeof createProjectResource>[1] = {
        kind: kind as ProjectResourceKind,
        name: name.trim(),
      };

      if (kind === "HTTP_ROUTE") {
        const httpRoute: NonNullable<typeof body.httpRoute> = {
          method: httpMethod,
          path: httpPath.trim(),
        };
        if (httpTarget.startsWith("wf:")) {
          httpRoute.targetWorkflowId = httpTarget.slice(3);
        } else if (httpTarget.startsWith("up:")) {
          httpRoute.targetUserPluginId = httpTarget.slice(3);
        }
        body.httpRoute = httpRoute;
      } else if (kind === "SCHEDULE") {
        body.schedule = {
          cron: cron.trim(),
          timezone: timezone.trim() || null,
          targetWorkflowId: scheduleWorkflowId || null,
        };
      } else if (kind === "SECRET") {
        body.secret = {
          key: secretKey.trim(),
          value: secretValue,
          description: secretDesc.trim() || null,
        };
      }

      const res = await createProjectResource(projectId, body, token ?? undefined);
      if (!res.success) {
        setError(res.error?.message || "Failed to create resource");
        return;
      }
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create resource</DialogTitle>
          <DialogDescription>
            Add an HTTP route, schedule, or project secret.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resource-kind">Kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as SupportedKind)}
            >
              <SelectTrigger id="resource-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HTTP_ROUTE">HTTP Route</SelectItem>
                <SelectItem value="SCHEDULE">Schedule</SelectItem>
                <SelectItem value="SECRET">Secret</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-name">Name</Label>
            <Input
              id="resource-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My resource"
              disabled={submitting}
            />
          </div>

          {kind === "HTTP_ROUTE" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="http-method">Method</Label>
                <Select
                  value={httpMethod}
                  onValueChange={(v) => setHttpMethod(v as HttpMethod)}
                >
                  <SelectTrigger id="http-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["ANY", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].map(
                      (m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="http-path">Path</Label>
                <Input
                  id="http-path"
                  value={httpPath}
                  onChange={(e) => setHttpPath(e.target.value)}
                  placeholder="/hooks/run"
                  disabled={submitting}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="http-target">Target (optional)</Label>
                <Select
                  value={httpTarget || "none"}
                  onValueChange={(v) => setHttpTarget(v === "none" ? "" : v)}
                  disabled={submitting || targets.loading}
                >
                  <SelectTrigger id="http-target">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (unbound)</SelectItem>
                    {targets.workflows.length > 0 ? (
                      <SelectItem value="__wf_header" disabled>
                        — Workflows —
                      </SelectItem>
                    ) : null}
                    {targets.workflows.map((wf) => (
                      <SelectItem key={wf.id} value={`wf:${wf.id}`}>
                        {wf.name}
                      </SelectItem>
                    ))}
                    {targets.userPlugins.length > 0 ? (
                      <SelectItem value="__up_header" disabled>
                        — Installed plugins —
                      </SelectItem>
                    ) : null}
                    {targets.userPlugins.map((up) => (
                      <SelectItem key={up.id} value={`up:${up.id}`}>
                        {up.pluginName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Workflow target fires a WEBHOOK run; plugin target invokes
                  the installed plugin directly.
                </p>
              </div>
            </>
          ) : null}

          {kind === "SCHEDULE" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="schedule-cron">Cron expression</Label>
                <Input
                  id="schedule-cron"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 * * * *"
                  disabled={submitting}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  5-field cron: minute hour dom month dow
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-tz">Timezone</Label>
                <Input
                  id="schedule-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="UTC"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="schedule-workflow">Workflow (optional)</Label>
                <Select
                  value={scheduleWorkflowId || "none"}
                  onValueChange={(v) =>
                    setScheduleWorkflowId(v === "none" ? "" : v)
                  }
                  disabled={submitting || targets.loading}
                >
                  <SelectTrigger id="schedule-workflow">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (unbound)</SelectItem>
                    {targets.workflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>
                        {wf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Unbound schedules tick but do not fire.
                </p>
              </div>
            </>
          ) : null}

          {kind === "SECRET" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="secret-key">Key</Label>
                <Input
                  id="secret-key"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                  placeholder="OPENAI_API_KEY"
                  disabled={submitting}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Uppercase A–Z, 0–9, underscore. Up to 128 characters.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret-value">Value</Label>
                <Textarea
                  id="secret-value"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="sk-..."
                  disabled={submitting}
                  rows={3}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Stored encrypted. Never displayed after creation.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret-desc">Description (optional)</Label>
                <Input
                  id="secret-desc"
                  value={secretDesc}
                  onChange={(e) => setSecretDesc(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
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
