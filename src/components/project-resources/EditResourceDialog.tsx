"use client";

/**
 * Edit-resource dialog (Path C, Phase 7.4).
 *
 * Loads the resource with its sidecar, then exposes per-kind editable fields.
 * The SECRET rotation form intentionally treats the value field as
 * write-only — the existing plaintext is never displayed (it is not even
 * returned by the API). A non-empty value triggers rotation server-side.
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    getProjectResource,
    updateProjectResource,
    type DatabaseDriver,
    type DatabaseSpec,
    type DatabaseSslMode,
    type ExternalApiAuthMode,
    type ExternalApiCredentials,
    type ExternalApiSpec,
    type HttpMethod,
    type ProjectResource,
    type ProjectResourceWithSidecar,
} from "@/lib/api-client";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useResourceTargets } from "./useResourceTargets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  resource: ProjectResource | null;
  token: string | null;
  onSaved: () => void;
}

export function EditResourceDialog({
  open,
  onOpenChange,
  projectId,
  resource,
  token,
  onSaved,
}: Props) {
  const [loaded, setLoaded] = useState<ProjectResourceWithSidecar | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  // HTTP_ROUTE
  const [httpMethod, setHttpMethod] = useState<HttpMethod>("ANY");
  const [httpPath, setHttpPath] = useState("/");
  const [httpTarget, setHttpTarget] = useState<string>("");

  // SCHEDULE
  const [cron, setCron] = useState("0 * * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [scheduleWorkflowId, setScheduleWorkflowId] = useState<string>("");

  // SECRET
  const [secretValue, setSecretValue] = useState("");
  const [secretDesc, setSecretDesc] = useState("");

  // EXTERNAL_API (rotation: credentials are write-only — existing values
  // never come back over the wire).
  const [extBaseUrl, setExtBaseUrl] = useState("");
  const [extAuthMode, setExtAuthMode] = useState<ExternalApiAuthMode>("NONE");
  const [extApiKey, setExtApiKey] = useState("");
  const [extHeaderName, setExtHeaderName] = useState("X-API-Key");
  const [extToken, setExtToken] = useState("");
  const [extUsername, setExtUsername] = useState("");
  const [extPassword, setExtPassword] = useState("");
  const [extHmacSecret, setExtHmacSecret] = useState("");
  const [extDefaultHeaders, setExtDefaultHeaders] = useState("");

  // DATABASE (password is write-only — a non-empty value triggers rotation).
  const [dbDriver, setDbDriver] = useState<DatabaseDriver>("POSTGRES");
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState<string>("");
  const [dbName, setDbName] = useState("");
  const [dbUsername, setDbUsername] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [dbSslMode, setDbSslMode] = useState<DatabaseSslMode>("REQUIRE");

  const targets = useResourceTargets(open, token);

  useEffect(() => {
    if (!open || !resource) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getProjectResource(
          projectId,
          resource!.id,
          token ?? undefined,
        );
        if (cancelled) return;
        if (res.success && res.data) {
          setLoaded(res.data);
          setName(res.data.name);
          if (res.data.httpRoute) {
            setHttpMethod(res.data.httpRoute.method);
            setHttpPath(res.data.httpRoute.path);
            if (res.data.httpRoute.targetWorkflowId) {
              setHttpTarget(`wf:${res.data.httpRoute.targetWorkflowId}`);
            } else if (res.data.httpRoute.targetUserPluginId) {
              setHttpTarget(`up:${res.data.httpRoute.targetUserPluginId}`);
            } else {
              setHttpTarget("");
            }
          }
          if (res.data.schedule) {
            setCron(res.data.schedule.cron);
            setTimezone(res.data.schedule.timezone ?? "UTC");
            setEnabled(res.data.schedule.enabled);
            setScheduleWorkflowId(res.data.schedule.targetWorkflowId ?? "");
          }
          if (res.data.secret) {
            setSecretValue("");
            setSecretDesc(res.data.secret.description ?? "");
          }
          if (res.data.externalApi) {
            setExtBaseUrl(res.data.externalApi.baseUrl);
            setExtAuthMode(res.data.externalApi.authMode);
            setExtApiKey("");
            setExtHeaderName("X-API-Key");
            setExtToken("");
            setExtUsername("");
            setExtPassword("");
            setExtHmacSecret("");
            const h = res.data.externalApi.defaultHeaders;
            setExtDefaultHeaders(
              h && Object.keys(h).length > 0 ? JSON.stringify(h, null, 2) : "",
            );
          }
          if (res.data.database) {
            setDbDriver(res.data.database.driver);
            setDbHost(res.data.database.host);
            setDbPort(
              res.data.database.port ? String(res.data.database.port) : "",
            );
            setDbName(res.data.database.database);
            setDbUsername(res.data.database.username ?? "");
            setDbPassword("");
            setDbSslMode(res.data.database.sslMode);
          }
        } else {
          setError(res.error?.message || "Failed to load resource");
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, resource, projectId, token]);

  async function handleSubmit() {
    if (!loaded || !resource) return;
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const body: Parameters<typeof updateProjectResource>[2] = {
      name: name.trim(),
    };

    if (loaded.kind === "HTTP_ROUTE") {
      if (!httpPath.startsWith("/")) {
        setError("Path must start with '/'");
        return;
      }
      const httpRoute: NonNullable<typeof body.httpRoute> = {
        method: httpMethod,
        path: httpPath.trim(),
        targetWorkflowId: httpTarget.startsWith("wf:")
          ? httpTarget.slice(3)
          : null,
        targetUserPluginId: httpTarget.startsWith("up:")
          ? httpTarget.slice(3)
          : null,
      };
      body.httpRoute = httpRoute;
    } else if (loaded.kind === "SCHEDULE") {
      body.schedule = {
        cron: cron.trim(),
        timezone: timezone.trim() || null,
        enabled,
        targetWorkflowId: scheduleWorkflowId || null,
      };
    } else if (loaded.kind === "SECRET") {
      body.secret = { description: secretDesc.trim() || null };
      if (secretValue) {
        body.secret.value = secretValue;
      }
    } else if (loaded.kind === "EXTERNAL_API") {
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
      const externalApi: Partial<ExternalApiSpec> = {
        baseUrl: extBaseUrl.trim(),
        authMode: extAuthMode,
      };
      // Credentials are write-only: only send when the user typed something.
      let credentials: ExternalApiCredentials | undefined;
      if (extAuthMode === "API_KEY" && extApiKey) {
        credentials = {
          apiKey: extApiKey,
          ...(extHeaderName.trim() && extHeaderName.trim() !== "X-API-Key"
            ? { headerName: extHeaderName.trim() }
            : {}),
        };
      } else if (extAuthMode === "BEARER" && extToken) {
        credentials = { token: extToken };
      } else if (extAuthMode === "BASIC" && (extUsername || extPassword)) {
        credentials = {
          username: extUsername,
          password: extPassword,
        };
      } else if (extAuthMode === "HMAC" && extHmacSecret) {
        credentials = { hmacSecret: extHmacSecret };
      } else if (extAuthMode === "NONE") {
        credentials = {};
      }
      if (credentials !== undefined) {
        externalApi.credentials = credentials;
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
      } else {
        externalApi.defaultHeaders = {};
      }
      body.externalApi = externalApi;
    } else if (loaded.kind === "DATABASE") {
      if (!dbHost.trim()) {
        setError("Host is required");
        return;
      }
      if (!dbName.trim()) {
        setError("Database name is required");
        return;
      }
      const database: Partial<DatabaseSpec> = {
        driver: dbDriver,
        host: dbHost.trim(),
        database: dbName.trim(),
        sslMode: dbSslMode,
        username: dbUsername.trim() || null,
      };
      if (dbPort.trim()) {
        const portNum = Number.parseInt(dbPort, 10);
        if (!Number.isFinite(portNum) || portNum < 0 || portNum > 65535) {
          setError("Port must be between 0 and 65535");
          return;
        }
        database.port = portNum;
      }
      // Password is write-only: only send when the user typed something.
      if (dbPassword) {
        database.password = dbPassword;
      }
      body.database = database;
    }

    setSubmitting(true);
    try {
      const res = await updateProjectResource(
        projectId,
        resource.id,
        body,
        token ?? undefined,
      );
      if (!res.success) {
        setError(res.error?.message || "Failed to update resource");
        return;
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const kind = loaded?.kind;
  const isSecret = kind === "SECRET";
  const isHttpRoute = kind === "HTTP_ROUTE";
  const isSchedule = kind === "SCHEDULE";
  const isExternalApi = kind === "EXTERNAL_API";
  const isDatabase = kind === "DATABASE";
  const credentialsTouched =
    isExternalApi &&
    (extApiKey.length > 0 ||
      extToken.length > 0 ||
      extPassword.length > 0 ||
      extHmacSecret.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit resource</DialogTitle>
          <DialogDescription>
            {isSecret
              ? "Rotate the value or update the description. The existing value is never displayed."
              : isExternalApi
                ? "Update the API URL or rotate credentials. Existing credentials are never displayed."
                : isDatabase
                  ? "Update connection details or rotate the password. The existing password is never displayed."
                  : "Update fields and save."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : null}

        {!loading && loaded ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-resource-name">Name</Label>
              <Input
                id="edit-resource-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </div>

            {isHttpRoute ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-http-method">Method</Label>
                  <Select
                    value={httpMethod}
                    onValueChange={(v) => setHttpMethod(v as HttpMethod)}
                  >
                    <SelectTrigger id="edit-http-method">
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
                  <Label htmlFor="edit-http-path">Path</Label>
                  <Input
                    id="edit-http-path"
                    value={httpPath}
                    onChange={(e) => setHttpPath(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-http-target">Target (optional)</Label>
                  <Select
                    value={httpTarget || "none"}
                    onValueChange={(v) =>
                      setHttpTarget(v === "none" ? "" : v)
                    }
                    disabled={submitting || targets.loading}
                  >
                    <SelectTrigger id="edit-http-target">
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
                </div>
              </>
            ) : null}

            {isSchedule ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-schedule-cron">Cron expression</Label>
                  <Input
                    id="edit-schedule-cron"
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-schedule-tz">Timezone</Label>
                  <Input
                    id="edit-schedule-tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label htmlFor="edit-schedule-enabled">Enabled</Label>
                    <p className="text-xs text-muted-foreground">
                      When off, the schedule does not fire.
                    </p>
                  </div>
                  <Switch
                    id="edit-schedule-enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-schedule-workflow">Workflow</Label>
                  <Select
                    value={scheduleWorkflowId || "none"}
                    onValueChange={(v) =>
                      setScheduleWorkflowId(v === "none" ? "" : v)
                    }
                    disabled={submitting || targets.loading}
                  >
                    <SelectTrigger id="edit-schedule-workflow">
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
                </div>
              </>
            ) : null}

            {isSecret && loaded.secret ? (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="font-mono text-sm text-foreground">
                    {loaded.secret.key}
                  </div>
                  <div>
                    Version {loaded.secret.version}
                    {loaded.secret.lastRotatedAt
                      ? ` • Rotated ${new Date(loaded.secret.lastRotatedAt).toLocaleDateString()}`
                      : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-secret-value">
                    New value (leave empty to keep current)
                  </Label>
                  <Textarea
                    id="edit-secret-value"
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Paste new secret to rotate…"
                    disabled={submitting}
                    rows={3}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    A non-empty value rotates the secret (version increments,
                    timestamp updates).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-secret-desc">Description</Label>
                  <Input
                    id="edit-secret-desc"
                    value={secretDesc}
                    onChange={(e) => setSecretDesc(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </>
            ) : null}

            {isExternalApi ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-ext-baseurl">Base URL</Label>
                  <Input
                    id="edit-ext-baseurl"
                    value={extBaseUrl}
                    onChange={(e) => setExtBaseUrl(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-ext-authmode">Auth mode</Label>
                  <Select
                    value={extAuthMode}
                    onValueChange={(v) => setExtAuthMode(v as ExternalApiAuthMode)}
                  >
                    <SelectTrigger id="edit-ext-authmode">
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
                      <Label htmlFor="edit-ext-apikey">API Key (rotate)</Label>
                      <Input
                        id="edit-ext-apikey"
                        type="password"
                        value={extApiKey}
                        onChange={(e) => setExtApiKey(e.target.value)}
                        placeholder="Leave empty to keep existing…"
                        disabled={submitting}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-ext-headername">Header name</Label>
                      <Input
                        id="edit-ext-headername"
                        value={extHeaderName}
                        onChange={(e) => setExtHeaderName(e.target.value)}
                        disabled={submitting}
                        className="font-mono"
                      />
                    </div>
                  </>
                ) : null}
                {extAuthMode === "BEARER" ? (
                  <div className="space-y-2">
                    <Label htmlFor="edit-ext-token">Bearer token (rotate)</Label>
                    <Input
                      id="edit-ext-token"
                      type="password"
                      value={extToken}
                      onChange={(e) => setExtToken(e.target.value)}
                      placeholder="Leave empty to keep existing…"
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                ) : null}
                {extAuthMode === "BASIC" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-ext-username">Username</Label>
                      <Input
                        id="edit-ext-username"
                        value={extUsername}
                        onChange={(e) => setExtUsername(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-ext-password">
                        Password (rotate)
                      </Label>
                      <Input
                        id="edit-ext-password"
                        type="password"
                        value={extPassword}
                        onChange={(e) => setExtPassword(e.target.value)}
                        placeholder="Leave empty to keep existing…"
                        disabled={submitting}
                        className="font-mono"
                      />
                    </div>
                  </>
                ) : null}
                {extAuthMode === "HMAC" ? (
                  <div className="space-y-2">
                    <Label htmlFor="edit-ext-hmac">HMAC secret (rotate)</Label>
                    <Input
                      id="edit-ext-hmac"
                      type="password"
                      value={extHmacSecret}
                      onChange={(e) => setExtHmacSecret(e.target.value)}
                      placeholder="Leave empty to keep existing…"
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="edit-ext-headers">Default headers</Label>
                  <Textarea
                    id="edit-ext-headers"
                    value={extDefaultHeaders}
                    onChange={(e) => setExtDefaultHeaders(e.target.value)}
                    placeholder='{"Accept": "application/json"}'
                    disabled={submitting}
                    rows={2}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON object. Empty clears all default headers.
                  </p>
                </div>
              </>
            ) : null}

            {isDatabase ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-db-driver">Driver</Label>
                  <Select
                    value={dbDriver}
                    onValueChange={(v) => setDbDriver(v as DatabaseDriver)}
                  >
                    <SelectTrigger id="edit-db-driver">
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
                  <Label htmlFor="edit-db-host">
                    {dbDriver === "SQLITE" ? "File path" : "Host"}
                  </Label>
                  <Input
                    id="edit-db-host"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
                {dbDriver !== "SQLITE" ? (
                  <div className="space-y-2">
                    <Label htmlFor="edit-db-port">Port</Label>
                    <Input
                      id="edit-db-port"
                      inputMode="numeric"
                      value={dbPort}
                      onChange={(e) => setDbPort(e.target.value)}
                      disabled={submitting}
                      className="font-mono"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="edit-db-name">Database</Label>
                  <Input
                    id="edit-db-name"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    disabled={submitting}
                    className="font-mono"
                  />
                </div>
                {dbDriver !== "SQLITE" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-db-username">Username</Label>
                      <Input
                        id="edit-db-username"
                        value={dbUsername}
                        onChange={(e) => setDbUsername(e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-db-password">Password (rotate)</Label>
                      <Input
                        id="edit-db-password"
                        type="password"
                        value={dbPassword}
                        onChange={(e) => setDbPassword(e.target.value)}
                        placeholder="Leave empty to keep existing…"
                        disabled={submitting}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-db-ssl">SSL mode</Label>
                      <Select
                        value={dbSslMode}
                        onValueChange={(v) => setDbSslMode(v as DatabaseSslMode)}
                      >
                        <SelectTrigger id="edit-db-ssl">
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
                  A non-empty password rotates it (version increments).
                </p>
              </>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

        {error && !loaded && !loading ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || loading || !loaded}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isSecret && secretValue ? (
              "Rotate"
            ) : credentialsTouched || (isDatabase && dbPassword) ? (
              "Rotate"
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
