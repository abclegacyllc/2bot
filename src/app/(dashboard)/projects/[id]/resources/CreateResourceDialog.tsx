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
    type DatabaseDriver,
    type DatabaseSpec,
    type DatabaseSslMode,
    type ExternalApiAuthMode,
    type ExternalApiCredentials,
    type ExternalApiSpec,
    type HttpMethod,
    type ProjectResourceKind,
} from "@/lib/api-client";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { useResourceTargets } from "./useResourceTargets";

type SupportedKind =
  | "HTTP_ROUTE"
  | "SCHEDULE"
  | "SECRET"
  | "EXTERNAL_API"
  | "DATABASE";

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

  // EXTERNAL_API
  const [extBaseUrl, setExtBaseUrl] = useState("");
  const [extAuthMode, setExtAuthMode] = useState<ExternalApiAuthMode>("NONE");
  const [extApiKey, setExtApiKey] = useState("");
  const [extHeaderName, setExtHeaderName] = useState("X-API-Key");
  const [extToken, setExtToken] = useState("");
  const [extUsername, setExtUsername] = useState("");
  const [extPassword, setExtPassword] = useState("");
  const [extHmacSecret, setExtHmacSecret] = useState("");
  const [extDefaultHeaders, setExtDefaultHeaders] = useState("");

  // DATABASE
  const [dbDriver, setDbDriver] = useState<DatabaseDriver>("POSTGRES");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState<string>("");
  const [dbName, setDbName] = useState("");
  const [dbUsername, setDbUsername] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbSslMode, setDbSslMode] = useState<DatabaseSslMode>("REQUIRE");

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
    setExtBaseUrl("");
    setExtAuthMode("NONE");
    setExtApiKey("");
    setExtHeaderName("X-API-Key");
    setExtToken("");
    setExtUsername("");
    setExtPassword("");
    setExtHmacSecret("");
    setExtDefaultHeaders("");
    setDbDriver("POSTGRES");
    setDbHost("");
    setDbPort("");
    setDbName("");
    setDbUsername("");
    setDbPassword("");
    setDbSslMode("REQUIRE");
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
    if (kind === "EXTERNAL_API") {
      if (!extBaseUrl.trim()) {
        setError("Base URL is required");
        return;
      }
      if (!/^https?:\/\//i.test(extBaseUrl.trim())) {
        setError("Base URL must start with http:// or https://");
        return;
      }
      if (extBaseUrl.trim().endsWith("/")) {
        setError("Base URL must not have a trailing slash");
        return;
      }
    }
    if (kind === "DATABASE") {
      if (!dbHost.trim()) {
        setError("Host is required");
        return;
      }
      if (!dbName.trim()) {
        setError("Database name is required");
        return;
      }
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
      } else if (kind === "EXTERNAL_API") {
        const externalApi: ExternalApiSpec = {
          baseUrl: extBaseUrl.trim(),
          authMode: extAuthMode,
        };
        if (extAuthMode === "API_KEY") {
          const creds: ExternalApiCredentials = {
            apiKey: extApiKey,
          };
          if (extHeaderName.trim() && extHeaderName.trim() !== "X-API-Key") {
            (creds as { apiKey: string; headerName?: string }).headerName =
              extHeaderName.trim();
          }
          externalApi.credentials = creds;
        } else if (extAuthMode === "BEARER") {
          externalApi.credentials = { token: extToken };
        } else if (extAuthMode === "BASIC") {
          externalApi.credentials = {
            username: extUsername,
            password: extPassword,
          };
        } else if (extAuthMode === "HMAC") {
          externalApi.credentials = { hmacSecret: extHmacSecret };
        }
        if (extDefaultHeaders.trim()) {
          try {
            const parsed = JSON.parse(extDefaultHeaders.trim());
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              externalApi.defaultHeaders = parsed as Record<string, string>;
            } else {
              setError("Default headers must be a JSON object");
              return;
            }
          } catch {
            setError("Default headers must be valid JSON");
            return;
          }
        }
        body.externalApi = externalApi;
      } else if (kind === "DATABASE") {
        const database: DatabaseSpec = {
          driver: dbDriver,
          host: dbHost.trim(),
          database: dbName.trim(),
          sslMode: dbSslMode,
        };
        if (dbPort.trim()) {
          const portNum = Number.parseInt(dbPort, 10);
          if (!Number.isFinite(portNum) || portNum < 0 || portNum > 65535) {
            setError("Port must be between 0 and 65535");
            return;
          }
          database.port = portNum;
        }
        if (dbUsername.trim()) database.username = dbUsername.trim();
        if (dbPassword) database.password = dbPassword;
        body.database = database;
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
                <SelectItem value="EXTERNAL_API">External API</SelectItem>
                <SelectItem value="DATABASE">Database</SelectItem>
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

          {kind === "EXTERNAL_API" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="ext-baseurl">Base URL</Label>
                <Input
                  id="ext-baseurl"
                  value={extBaseUrl}
                  onChange={(e) => setExtBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  disabled={submitting}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  http(s) URL with no trailing slash.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ext-authmode">Auth mode</Label>
                <Select
                  value={extAuthMode}
                  onValueChange={(v) => setExtAuthMode(v as ExternalApiAuthMode)}
                >
                  <SelectTrigger id="ext-authmode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="API_KEY">API Key</SelectItem>
                    <SelectItem value="BEARER">Bearer token</SelectItem>
                    <SelectItem value="BASIC">Basic auth</SelectItem>
                    <SelectItem value="HMAC">HMAC signed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {extAuthMode === "API_KEY" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ext-apikey">API Key</Label>
                    <Input
                      id="ext-apikey"
                      type="password"
                      value={extApiKey}
                      onChange={(e) => setExtApiKey(e.target.value)}
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ext-headername">Header name</Label>
                    <Input
                      id="ext-headername"
                      value={extHeaderName}
                      onChange={(e) => setExtHeaderName(e.target.value)}
                      placeholder="X-API-Key"
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                </>
              ) : null}
              {extAuthMode === "BEARER" ? (
                <div className="space-y-2">
                  <Label htmlFor="ext-token">Bearer token</Label>
                  <Input
                    id="ext-token"
                    type="password"
                    value={extToken}
                    onChange={(e) => setExtToken(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
              ) : null}
              {extAuthMode === "BASIC" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="ext-username">Username</Label>
                    <Input
                      id="ext-username"
                      value={extUsername}
                      onChange={(e) => setExtUsername(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ext-password">Password</Label>
                    <Input
                      id="ext-password"
                      type="password"
                      value={extPassword}
                      onChange={(e) => setExtPassword(e.target.value)}
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                </>
              ) : null}
              {extAuthMode === "HMAC" ? (
                <div className="space-y-2">
                  <Label htmlFor="ext-hmac">HMAC secret</Label>
                  <Input
                    id="ext-hmac"
                    type="password"
                    value={extHmacSecret}
                    onChange={(e) => setExtHmacSecret(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="ext-headers">Default headers (optional)</Label>
                <Textarea
                  id="ext-headers"
                  value={extDefaultHeaders}
                  onChange={(e) => setExtDefaultHeaders(e.target.value)}
                  placeholder='{"Accept": "application/json"}'
                  disabled={submitting}
                  rows={2}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  JSON object. Non-secret headers only.
                </p>
              </div>
            </>
          ) : null}

          {kind === "DATABASE" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="db-driver">Driver</Label>
                <Select
                  value={dbDriver}
                  onValueChange={(v) => setDbDriver(v as DatabaseDriver)}
                >
                  <SelectTrigger id="db-driver">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POSTGRES">PostgreSQL</SelectItem>
                    <SelectItem value="MYSQL">MySQL</SelectItem>
                    <SelectItem value="SQLITE">SQLite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="db-host">
                  {dbDriver === "SQLITE" ? "File path" : "Host"}
                </Label>
                <Input
                  id="db-host"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  placeholder={
                    dbDriver === "SQLITE" ? "/data/app.db" : "db.example.com"
                  }
                  disabled={submitting}
                  className="font-mono"
                />
              </div>
              {dbDriver !== "SQLITE" ? (
                <div className="space-y-2">
                  <Label htmlFor="db-port">
                    Port (optional, defaults to{" "}
                    {dbDriver === "POSTGRES" ? "5432" : "3306"})
                  </Label>
                  <Input
                    id="db-port"
                    inputMode="numeric"
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="db-name">Database</Label>
                <Input
                  id="db-name"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  placeholder={
                    dbDriver === "SQLITE" ? "/data/app.db" : "app_production"
                  }
                  disabled={submitting}
                  className="font-mono"
                />
              </div>
              {dbDriver !== "SQLITE" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="db-username">Username</Label>
                    <Input
                      id="db-username"
                      value={dbUsername}
                      onChange={(e) => setDbUsername(e.target.value)}
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-password">Password</Label>
                    <Input
                      id="db-password"
                      type="password"
                      value={dbPassword}
                      onChange={(e) => setDbPassword(e.target.value)}
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-ssl">SSL mode</Label>
                    <Select
                      value={dbSslMode}
                      onValueChange={(v) => setDbSslMode(v as DatabaseSslMode)}
                    >
                      <SelectTrigger id="db-ssl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DISABLE">Disable</SelectItem>
                        <SelectItem value="REQUIRE">Require</SelectItem>
                        <SelectItem value="VERIFY_CA">Verify CA</SelectItem>
                        <SelectItem value="VERIFY_FULL">Verify full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Credentials are encrypted at rest. Plaintext is only available
                via the runtime resource API (workflow steps / plugin code).
              </p>
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
