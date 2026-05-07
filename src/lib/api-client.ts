/**
 * API Client for Enterprise Architecture
 *
 * Makes direct calls to the API server (api.2bot.org in prod, localhost:3001 in dev).
 * Uses the same URL structure in both environments - only base URL differs.
 *
 * @example
 * // GET request
 * const { success, data, error } = await apiGet<Gateway[]>("/user/gateways", token);
 *
 * // POST request
 * const result = await apiPost<Gateway>("/user/gateways", { name: "My Gateway" }, token);
 */

import { apiUrl } from "@/shared/config/urls";

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: { total: number; page: number; limit: number };
}

export interface FetchOptions extends Omit<RequestInit, "body"> {
  token?: string;
  body?: unknown;
}

// ============================================================================
// Core Request Function
// ============================================================================

/**
 * Make authenticated API request
 *
 * @param path - API path (e.g., "/user/gateways")
 * @param options - Fetch options including optional token
 * @returns Promise with typed response
 */
export async function apiRequest<T>(
  path: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { token, headers, body, ...rest } = options;

  const url = apiUrl(path);

  try {
    const response = await fetch(url, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      credentials: "include", // Include cookies for session-based auth
    });

    // Handle non-JSON responses (e.g., 204 No Content)
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      if (response.ok) {
        return { success: true };
      }
      return {
        success: false,
        error: {
          code: "UNEXPECTED_RESPONSE",
          message: `Unexpected response: ${response.status} ${response.statusText}`,
        },
      };
    }

    const json = await response.json();

    // Handle API error responses
    if (!response.ok) {
      return {
        success: false,
        error: json.error || {
          code: "API_ERROR",
          message: json.message || `Request failed: ${response.status}`,
        },
      };
    }

    return json;
  } catch (error) {
    // Network or parsing error
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

// ============================================================================
// HTTP Method Helpers
// ============================================================================

/**
 * GET request
 *
 * @example
 * const { success, data } = await apiGet<Gateway[]>("/user/gateways", token);
 */
export function apiGet<T>(path: string, token?: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "GET", token });
}

/**
 * POST request
 *
 * @example
 * const result = await apiPost<Gateway>("/user/gateways", { name: "New Gateway" }, token);
 */
export function apiPost<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "POST", body, token });
}

/**
 * PUT request
 *
 * @example
 * const result = await apiPut<Gateway>("/user/gateways/123", { name: "Updated" }, token);
 */
export function apiPut<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "PUT", body, token });
}

/**
 * PATCH request
 *
 * @example
 * const result = await apiPatch<Gateway>("/user/gateways/123", { name: "Patched" }, token);
 */
export function apiPatch<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "PATCH", body, token });
}

/**
 * DELETE request
 *
 * @example
 * const { success } = await apiDelete("/user/gateways/123", token);
 */
export function apiDelete<T = void>(path: string, token?: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: "DELETE", token });
}

// ============================================================================
// Form Data Support
// ============================================================================

/**
 * POST request with FormData (for file uploads)
 *
 * @example
 * const formData = new FormData();
 * formData.append("file", file);
 * const result = await apiPostForm<Upload>("/uploads", formData, token);
 */
export async function apiPostForm<T>(
  path: string,
  formData: FormData,
  token?: string
): Promise<ApiResponse<T>> {
  const url = apiUrl(path);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        // Don't set Content-Type - browser will set it with boundary
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
      credentials: "include",
    });

    const json = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: json.error || {
          code: "API_ERROR",
          message: json.message || `Request failed: ${response.status}`,
        },
      };
    }

    return json;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

// ============================================================================
// Gateway API Functions
// ============================================================================

/** Minimal gateway info for dropdowns */
export interface GatewayOption {
  id: string;
  name: string;
  type: string;
  status: string;
  mode?: string;
  workflowSummary?: {
    id: string;
    name: string;
    status: string;
    isEnabled: boolean;
    stepCount: number;
    executionCount: number;
    lastExecutedAt?: string | null;
    lastError?: string | null;
  };
}

/**
 * List user's gateways (personal scope)
 */
export function getUserGateways(
  token?: string
): Promise<ApiResponse<GatewayOption[]>> {
  return apiGet<GatewayOption[]>("/user/gateways", token);
}

/**
 * List org gateways
 */
export function getOrgGateways(
  orgId: string,
  token?: string
): Promise<ApiResponse<GatewayOption[]>> {
  return apiGet<GatewayOption[]>(`/orgs/${orgId}/gateways`, token);
}

/** Payload for creating a bot gateway */
export interface CreateBotGatewayPayload {
  name: string;
  type: string;
  credentials: Record<string, string>;
}

/** @deprecated Use CreateBotGatewayPayload */
export type CreateTelegramBotGatewayPayload = CreateBotGatewayPayload;

/**
 * Create a new gateway (personal scope)
 */
export function createUserGateway(
  data: CreateBotGatewayPayload,
  token?: string
): Promise<ApiResponse<GatewayOption>> {
  return apiPost<GatewayOption>("/gateways", data, token);
}

/**
 * Create a new gateway (org scope)
 */
export function createOrgGateway(
  orgId: string,
  data: CreateBotGatewayPayload,
  token?: string
): Promise<ApiResponse<GatewayOption>> {
  return apiPost<GatewayOption>(`/orgs/${orgId}/gateways`, data, token);
}

/**
 * Update a gateway
 */
export function updateGateway(
  gatewayId: string,
  data: { name?: string },
  token?: string
): Promise<ApiResponse<GatewayOption>> {
  return apiPut<GatewayOption>(`/gateways/${gatewayId}`, data, token);
}

// ============================================================================
// Plugin API Functions
// ============================================================================

import type {
    AnyPluginTemplate,
    CreateCustomPluginRequest,
    CreatePluginFromRepoRequest,
    PluginDefinition,
    PluginListItem,
    PluginTemplateListItem,
    RegisterDirectoryAsPluginRequest,
    UpdateCustomPluginRequest,
    UserPlugin,
} from "@/shared/types/plugin";

/** Custom plugin with code included */
export interface CustomPluginDetail extends PluginDefinition {
  code: string;
  /** Entry file path relative to workspace (present for directory plugins) */
  entryFile?: string | null;
}

/**
 * List available plugins in the catalog
 */
export function getPluginCatalog(
  params?: { category?: string; search?: string; tags?: string },
  token?: string
): Promise<ApiResponse<PluginListItem[]>> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.search) qs.set("search", params.search);
  if (params?.tags) qs.set("tags", params.tags);
  const query = qs.toString();
  return apiGet<PluginListItem[]>(`/plugins${query ? `?${query}` : ""}`, token);
}

/**
 * List user's installed plugins
 */
export function getInstalledPlugins(
  token?: string
): Promise<ApiResponse<UserPlugin[]>> {
  return apiGet<UserPlugin[]>("/plugins/installed", token);
}

/**
 * Get a plugin by slug (full details including configSchema)
 */
export function getPluginBySlug(
  slug: string,
  token?: string
): Promise<ApiResponse<PluginDefinition>> {
  return apiGet<PluginDefinition>(`/plugins/${slug}`, token);
}

/**
 * List plugin templates
 */
export function getPluginTemplates(
  params?: { category?: string; difficulty?: string },
  token?: string
): Promise<ApiResponse<PluginTemplateListItem[]>> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.difficulty) qs.set("difficulty", params.difficulty);
  const query = qs.toString();
  return apiGet<PluginTemplateListItem[]>(`/plugins/templates${query ? `?${query}` : ""}`, token);
}

/**
 * Get a single template by ID (includes code or files for directory templates)
 */
export function getPluginTemplate(
  id: string,
  token?: string
): Promise<ApiResponse<AnyPluginTemplate>> {
  return apiGet<AnyPluginTemplate>(`/plugins/templates/${id}`, token);
}

/**
 * Create a custom plugin
 */
export function createCustomPlugin(
  data: CreateCustomPluginRequest,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>("/plugins/custom", data, token);
}

/**
 * Create a plugin from a Git repository
 */
export function createPluginFromRepo(
  data: CreatePluginFromRepoRequest,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>("/plugins/from-repo", data, token);
}

/**
 * Register a workspace directory as a plugin
 */
export function registerDirectoryAsPlugin(
  data: RegisterDirectoryAsPluginRequest,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>("/plugins/register-dir", data, token);
}

/** Plugin health entry returned by the health endpoint */
export interface PluginHealthEntry {
  pluginSlug: string;
  userPluginId: string;
  entryFile: string;
  fileExists: boolean;
  processRunning: boolean;
}

/**
 * Get health status for all enabled plugins in the user's workspace.
 */
export function getPluginHealth(
  token?: string,
): Promise<ApiResponse<PluginHealthEntry[]>> {
  return apiGet<PluginHealthEntry[]>("/plugins/health", token);
}

/**
 * Get a custom plugin's full details including code
 */
export function getCustomPlugin(
  id: string,
  token?: string
): Promise<ApiResponse<CustomPluginDetail>> {
  return apiGet<CustomPluginDetail>(`/plugins/custom/${id}`, token);
}

/**
 * Update a custom plugin
 */
export function updateCustomPlugin(
  id: string,
  data: UpdateCustomPluginRequest,
  token?: string
): Promise<ApiResponse<PluginDefinition>> {
  return apiPut<PluginDefinition>(`/plugins/custom/${id}`, data, token);
}

/**
 * Delete a custom plugin
 */
export function deleteCustomPlugin(
  id: string,
  token?: string
): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/plugins/custom/${id}`, token);
}

/**
 * Toggle a plugin on or off
 */
export function togglePlugin(
  id: string,
  enabled: boolean,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>(`/plugins/installed/${id}/toggle`, { enabled }, token);
}

/**
 * Pull the latest catalog code bundle into this install's container and clear
 * the `needsUpdate` flag.
 */
export function updateInstalledPlugin(
  id: string,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>(`/plugins/installed/${id}/update`, {}, token);
}

/**
 * Update plugin config, gateway binding, and/or storage quota
 */
export function updatePluginConfig(
  id: string,
  data: { config: Record<string, unknown>; gatewayId?: string | null; storageQuotaMb?: number },
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPut<UserPlugin>(`/plugins/installed/${id}/config`, data, token);
}

/**
 * Install a plugin to a specific bot (gateway) with optional config.
 * Auto-fills schema defaults on the backend.
 */
export function installPluginToBot(
  slug: string,
  gatewayId: string,
  config?: Record<string, unknown>,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>("/plugins/install", { slug, gatewayId, config: config ?? {} }, token);
}

/**
 * Install a plugin to a bot within an organization context.
 */
export function installPluginToBotOrg(
  orgId: string,
  slug: string,
  gatewayId: string,
  config?: Record<string, unknown>,
  token?: string
): Promise<ApiResponse<UserPlugin>> {
  return apiPost<UserPlugin>(`/orgs/${orgId}/plugins/install`, { slug, gatewayId, config: config ?? {} }, token);
}

/**
 * Uninstall a plugin (personal workspace).
 */
export function uninstallPlugin(
  userPluginId: string,
  token?: string
): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/plugins/installed/${userPluginId}`, token);
}

/**
 * Uninstall a plugin (organization context).
 */
export function uninstallPluginOrg(
  orgId: string,
  userPluginId: string,
  token?: string
): Promise<ApiResponse<void>> {
  return apiDelete<void>(`/orgs/${orgId}/plugins/${userPluginId}`, token);
}

// ============================================================================
// Workflow API
// ============================================================================

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  slug: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  gatewayId?: string;
  status: string;
  isEnabled: boolean;
  steps: WorkflowStepItem[];
  edges: WorkflowEdgeItem[];
  executionCount: number;
  lastExecutedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepItem {
  id: string;
  order: number;
  name?: string;
  pluginId: string;
  pluginSlug?: string;
  pluginName?: string;
  isEnabled: boolean;
  inputMapping: Record<string, string>;
  config: Record<string, unknown>;
  gatewayId?: string;
  condition?: { if: string };
  onError: string;
  maxRetries: number;
  // Canvas position (graph layout)
  positionX: number;
  positionY: number;
  // Unified Engine fields
  entryFile?: string;
  userPluginId?: string;
  storageQuotaMb?: number;
  executionCount?: number;
  lastExecutedAt?: string;
  lastError?: string;
}

export interface WorkflowEdgeItem {
  id: string;
  sourceStepId: string | null;  // null = from trigger
  targetStepId: string;
  sourcePort: string;
  targetPort: string;
}

export function getWorkflows(
  opts: { gatewayId?: string; organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowListItem[]>> {
  const params = new URLSearchParams();
  if (opts.gatewayId && opts.gatewayId !== "undefined") params.set("gatewayId", opts.gatewayId);
  const qs = params.toString();
  return apiRequest<WorkflowListItem[]>(`/workflows${qs ? `?${qs}` : ""}`, {
    method: "GET",
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function createWorkflow(
  data: {
    name: string;
    slug: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    gatewayId?: string;
    description?: string;
  },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowListItem>> {
  return apiRequest<WorkflowListItem>("/workflows", {
    method: "POST",
    body: data,
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function updateWorkflow(
  workflowId: string,
  data: {
    name?: string;
    status?: string;
    isEnabled?: boolean;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
  },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowListItem>> {
  return apiRequest<WorkflowListItem>(`/workflows/${workflowId}`, {
    method: "PATCH",
    body: data,
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function addWorkflowStep(
  workflowId: string,
  data: {
    order: number;
    name?: string;
    pluginId: string;
    isEnabled?: boolean;
    inputMapping?: Record<string, string>;
    config?: Record<string, unknown>;
    onError?: string;
    maxRetries?: number;
  },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowStepItem>> {
  return apiRequest<WorkflowStepItem>(`/workflows/${workflowId}/steps`, {
    method: "POST",
    body: data,
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

/**
 * Install a marketplace plugin as a workflow step (unified operation).
 * Deploys to container + creates step in one call.
 */
export function installPluginStep(
  workflowId: string,
  data: {
    slug: string;
    order: number;
    name?: string;
    config?: Record<string, unknown>;
    gatewayId?: string;
  },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowStepItem>> {
  return apiRequest<WorkflowStepItem>(
    `/workflows/${workflowId}/steps/install-plugin`,
    {
      method: "POST",
      body: data,
      token,
      headers: opts.organizationId
        ? { "x-organization-id": opts.organizationId }
        : undefined,
    }
  );
}

export function updateWorkflowStep(
  workflowId: string,
  stepId: string,
  data: {
    name?: string;
    order?: number;
    pluginId?: string;
    isEnabled?: boolean;
    inputMapping?: Record<string, string>;
    config?: Record<string, unknown>;
    onError?: string;
    maxRetries?: number;
    condition?: { if: string } | null;
    positionX?: number;
    positionY?: number;
  },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowStepItem>> {
  return apiRequest<WorkflowStepItem>(
    `/workflows/${workflowId}/steps/${stepId}`,
    {
      method: "PATCH",
      body: data,
      token,
      headers: opts.organizationId
        ? { "x-organization-id": opts.organizationId }
        : undefined,
    }
  );
}

export function deleteWorkflowStep(
  workflowId: string,
  stepId: string,
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/workflows/${workflowId}/steps/${stepId}`, {
    method: "DELETE",
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

// --- Workflow Edges (Graph connections) ---

export function addWorkflowEdge(
  workflowId: string,
  data: { sourceStepId?: string | null; targetStepId: string; sourcePort?: string; targetPort?: string },
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowEdgeItem>> {
  return apiRequest<WorkflowEdgeItem>(`/workflows/${workflowId}/edges`, {
    method: "POST",
    body: data,
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function deleteWorkflowEdge(
  workflowId: string,
  edgeId: string,
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/workflows/${workflowId}/edges/${edgeId}`, {
    method: "DELETE",
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function replaceWorkflowEdges(
  workflowId: string,
  edges: Array<{ sourceStepId?: string | null; targetStepId: string; sourcePort?: string; targetPort?: string }>,
  opts: { organizationId?: string },
  token?: string
): Promise<ApiResponse<WorkflowEdgeItem[]>> {
  return apiRequest<WorkflowEdgeItem[]>(`/workflows/${workflowId}/edges`, {
    method: "PUT",
    body: { edges },
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

// --- Workflow Run History ---

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  triggeredBy: string;
  status: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  stepsCompleted: number;
  totalSteps: number;
}

export interface WorkflowStepRunDetail {
  id: string;
  stepOrder: number;
  stepName?: string;
  pluginSlug: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  triggerData?: unknown;
  output?: unknown;
  failedStepOrder?: number;
  stepRuns: WorkflowStepRunDetail[];
}

export function getWorkflowRuns(
  workflowId: string,
  params: { status?: string; page?: number; limit?: number; sortOrder?: "asc" | "desc" } = {},
  opts: { organizationId?: string } = {},
  token?: string
): Promise<ApiResponse<WorkflowRunSummary[]>> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.sortOrder) searchParams.set("sortOrder", params.sortOrder);
  const qs = searchParams.toString();
  return apiRequest(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ""}`, {
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function getWorkflowRunDetail(
  workflowId: string,
  runId: string,
  opts: { organizationId?: string } = {},
  token?: string
): Promise<ApiResponse<WorkflowRunDetail>> {
  return apiRequest(`/workflows/${workflowId}/runs/${runId}`, {
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

export function triggerWorkflow(
  workflowId: string,
  data: {
    params?: Record<string, unknown>;
    /** Test mode — see backend triggerWorkflowSchema for semantics */
    mode?: "quick" | "standard" | "deep" | "ai";
    /** Force dry-run when not using a `mode` */
    dryRun?: boolean;
  } = {},
  opts: { organizationId?: string } = {},
  token?: string
): Promise<ApiResponse<{ runId?: string; preflight?: PreflightReport }>> {
  return apiRequest(`/workflows/${workflowId}/trigger`, {
    method: "POST",
    body: data,
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

// ===========================================
// Workflow Preflight (Test → Quick mode)
// ===========================================

export interface PreflightProblem {
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  /**
   * When set, a server-side fix task with this ID can repair the problem
   * automatically.  The UI renders a "Fix" button for these problems.
   */
  fixId?: string;
  /** Extra context forwarded to the fix task alongside workflowId */
  fixContext?: Record<string, unknown>;
}

export interface StepPreflightReport {
  stepId: string;
  stepOrder: number;
  stepName: string;
  pluginSlug: string;
  entryFile: string | null;
  problems: PreflightProblem[];
  bridgeChecked: boolean;
  bridgeSkipped: boolean;
}

export interface PreflightReport {
  workflowId: string;
  workflowName: string;
  ok: boolean;
  errors: PreflightProblem[];
  warnings: PreflightProblem[];
  steps: StepPreflightReport[];
  durationMs: number;
  summary: {
    stepsTotal: number;
    stepsEnabled: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Run a static-only preflight check on a workflow (Quick test mode).
 * No workflow run is created. No plugins are executed.
 */
export function preflightWorkflow(
  workflowId: string,
  opts: { organizationId?: string } = {},
  token?: string
): Promise<ApiResponse<PreflightReport>> {
  return apiRequest(`/workflows/${workflowId}/preflight`, {
    method: "POST",
    body: {},
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

/**
 * Apply a registered preflight fix task to repair a specific problem.
 * The server looks up the fixId in the fix registry and runs it.
 */
export function applyPreflightFix(
  workflowId: string,
  fixId: string,
  context: Record<string, unknown> = {},
  opts: { organizationId?: string } = {},
  token?: string
): Promise<ApiResponse<{ message: string; rerunPreflight?: boolean }>> {
  return apiRequest(`/workflows/${workflowId}/preflight/fix`, {
    method: "POST",
    body: { fixId, context },
    token,
    headers: opts.organizationId
      ? { "x-organization-id": opts.organizationId }
      : undefined,
  });
}

// ===========================================
// Projects (/ 7.1)
// ===========================================

export type ProjectKind = "BOT" | "WEB_APP" | "AUTOMATION" | "HYBRID";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  kind: ProjectKind;
  status: ProjectStatus;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  slug?: string;
  description?: string | null;
  kind?: ProjectKind;
  icon?: string | null;
  color?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  slug?: string;
  description?: string | null;
  kind?: ProjectKind;
  status?: ProjectStatus;
  icon?: string | null;
  color?: string | null;
}

function projectScopeHeader(orgId?: string | null): Record<string, string> | undefined {
  return orgId ? { "x-organization-id": orgId } : undefined;
}

/** List projects in the current scope (personal or org). */
export function listProjects(
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<ProjectListItem[]>> {
  return apiRequest<ProjectListItem[]>("/projects", {
    method: "GET",
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

/** Get a single project by id. */
export function getProject(
  id: string,
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<ProjectListItem>> {
  return apiRequest<ProjectListItem>(`/projects/${id}`, {
    method: "GET",
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

/** Get or create the default project for the current scope. */
export function getDefaultProject(
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<ProjectListItem>> {
  return apiRequest<ProjectListItem>("/projects/default", {
    method: "GET",
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

/** Create a new project. */
export function createProject(
  data: CreateProjectPayload,
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<ProjectListItem>> {
  return apiRequest<ProjectListItem>("/projects", {
    method: "POST",
    body: data,
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

/** Update a project. */
export function updateProject(
  id: string,
  data: UpdateProjectPayload,
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<ProjectListItem>> {
  return apiRequest<ProjectListItem>(`/projects/${id}`, {
    method: "PATCH",
    body: data,
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

/** Archive (soft-delete) a project. */
export function archiveProject(
  id: string,
  opts: { organizationId?: string | null } = {},
  token?: string,
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/projects/${id}`, {
    method: "DELETE",
    token,
    headers: projectScopeHeader(opts.organizationId),
  });
}

// ===========================================
// Cursor BuildSpec apply (consolidated under /cursor/buildspec/*)
// ===========================================

export interface BuildSpecApplyOptions {
  dryRun?: boolean;
  rollbackOnSmokeFailure?: boolean;
  source?: string;
}

export interface BuildSpecSmokeResult {
  workflowRef: string;
  workflowId: string;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  errors: Array<{ code: string; message: string }>;
}

export interface BuildSpecApplyResult {
  status: "applied" | "rolled-back" | "validation-failed";
  projectId?: string;
  refMap: {
    gateways: Record<string, string>;
    plugins: Record<string, string>;
    workflows: Record<string, string>;
    /** ProjectResource ids created during apply (HTTP_ROUTE / SCHEDULE / SECRET / EXTERNAL_API / DATABASE). */
    resources: Record<string, string>;
  };
  smokeResults: BuildSpecSmokeResult[];
  rollbackReason?: string;
  validationErrors?: Record<string, string[]>;
}

/**
 * Apply a BuildSpec produced by the Cursor Builder agent. The endpoint is
 * gated on FEATURE_CURSOR_BUILDSPEC (or the legacy FEATURE_AI_BUILDER) and
 * returns 403 when disabled.
 */
export function applyBuildSpec(
  spec: unknown,
  options: BuildSpecApplyOptions = {},
  token?: string,
): Promise<ApiResponse<BuildSpecApplyResult>> {
  return apiPost<BuildSpecApplyResult>(
    "/cursor/buildspec/apply",
    { spec, options },
    token,
  );
}

/**
 * Validate a BuildSpec without mutating anything. Same gate as apply.
 */
export function validateBuildSpec(
  spec: unknown,
  token?: string,
): Promise<ApiResponse<{ ok: true } | { ok: false; errors: Record<string, string[]> }>> {
  return apiPost("/cursor/buildspec/validate", { spec }, token);
}

// ====================================================================
// Project Versions (/ 7.1 Wave 3)
// ====================================================================

export type ProjectVersionStatus = "STAGING" | "ACTIVE" | "ROLLED_BACK";

export interface ProjectVersionListItem {
  id: string;
  projectId: string;
  versionNumber: number;
  status: ProjectVersionStatus;
  source: string | null;
  buildspecHash: string | null;
  appliedBy: string | null;
  createdAt: string;
  rolledBackAt: string | null;
  rollbackReason: string | null;
}

export interface ProjectVersionWithManifest extends ProjectVersionListItem {
  manifest: unknown;
}

/** List versions for a project (newest first). */
export function listProjectVersions(
  projectId: string,
  token?: string,
): Promise<ApiResponse<ProjectVersionListItem[]>> {
  return apiRequest<ProjectVersionListItem[]>(
    `/projects/${projectId}/versions`,
    { method: "GET", token },
  );
}

/** Fetch a single version with its full manifest. */
export function getProjectVersion(
  projectId: string,
  versionId: string,
  token?: string,
): Promise<ApiResponse<ProjectVersionWithManifest>> {
  return apiRequest<ProjectVersionWithManifest>(
    `/projects/${projectId}/versions/${versionId}`,
    { method: "GET", token },
  );
}

/** Activate a STAGING version (promote to ACTIVE; demotes prior ACTIVE). */
export function activateProjectVersion(
  projectId: string,
  versionId: string,
  token?: string,
): Promise<ApiResponse<ProjectVersionListItem>> {
  return apiPost<ProjectVersionListItem>(
    `/projects/${projectId}/versions/${versionId}/activate`,
    {},
    token,
  );
}

/** Roll back to a prior version. `reason` is required. */
export function rollbackProjectVersion(
  projectId: string,
  versionId: string,
  reason: string,
  token?: string,
): Promise<ApiResponse<ProjectVersionListItem>> {
  return apiPost<ProjectVersionListItem>(
    `/projects/${projectId}/versions/${versionId}/rollback`,
    { reason },
    token,
  );
}

// ====================================================================
// Project Resources (Path C, polymorphic resource layer)
// ====================================================================

export type ProjectResourceKind =
  | "GATEWAY_BOT"
  | "HTTP_ROUTE"
  | "SCHEDULE"
  | "SECRET"
  | "EXTERNAL_API"
  | "DATABASE"
  | "KV_STORE"
  | "OBJECT_STORE";

export type ProjectResourceStatus = "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";

export interface ProjectResource {
  id: string;
  projectId: string;
  userId: string;
  organizationId: string | null;
  kind: ProjectResourceKind;
  name: string;
  slug: string;
  status: ProjectResourceStatus;
  config: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  gatewayId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectResourceWithSidecar extends ProjectResource {
  gateway?: unknown | null;
  httpRoute?: HttpRoute | null;
  schedule?: Schedule | null;
  /** SECRET sidecar metadata only — plaintext value is never returned. */
  secret?: SafeSecret | null;
  /** EXTERNAL_API sidecar metadata only — credentials are never returned. */
  externalApi?: SafeExternalApi | null;
  /** DATABASE sidecar metadata only — password is never returned. */
  database?: SafeDatabaseConnection | null;
}

// HTTP_ROUTE sidecar

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "ANY";

export type HttpAuthMode = "NONE" | "API_KEY" | "HMAC" | "BEARER_JWT";

export interface HttpRouteSpec {
  method?: HttpMethod;
  path: string;
  targetUserPluginId?: string | null;
  targetExport?: string | null;
  /**
   * Phase 7.3c: optional Workflow target. When set (and targetUserPluginId is
   * unset) an inbound match fires a WEBHOOK-triggered Workflow run.
   */
  targetWorkflowId?: string | null;
  authMode?: HttpAuthMode;
  authConfig?: Record<string, unknown>;
  maxBodyKb?: number;
  timeoutMs?: number;
  corsOrigin?: string | null;
  passthroughBody?: boolean;
}

export interface HttpRoute {
  id: string;
  resourceId: string;
  method: HttpMethod;
  path: string;
  targetUserPluginId: string | null;
  targetExport: string | null;
  targetWorkflowId: string | null;
  authMode: HttpAuthMode;
  authConfig: Record<string, unknown>;
  maxBodyKb: number;
  timeoutMs: number;
  corsOrigin: string | null;
  passthroughBody: boolean;
  createdAt: string;
  updatedAt: string;
}

// SCHEDULE sidecar (Phase 7.4)

export interface ScheduleSpec {
  /** 5-field cron expression. */
  cron: string;
  /** IANA timezone name. Defaults to UTC. */
  timezone?: string | null;
  /** Workflow fired on each tick. Optional. */
  targetWorkflowId?: string | null;
  /** When false, the schedule exists but does not fire. */
  enabled?: boolean;
}

export interface Schedule {
  id: string;
  resourceId: string;
  cron: string;
  timezone: string | null;
  targetWorkflowId: string | null;
  enabled: boolean;
  lastFiredAt: string | null;
  nextFireAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// SECRET sidecar (Phase 7.4)

export interface SecretSpec {
  /** Logical identifier referenced by plugin/workflow code, e.g. `OPENAI_API_KEY`. */
  key: string;
  /** Plaintext value. Encrypted at rest; never returned by the API. */
  value: string;
  description?: string | null;
}

export interface SecretPatch {
  key?: string;
  value?: string;
  description?: string | null;
}

/** Public Secret shape — NEVER includes the plaintext value. */
export interface SafeSecret {
  id: string;
  resourceId: string;
  key: string;
  description: string | null;
  version: number;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// EXTERNAL_API sidecar (Phase 7.5)

export type ExternalApiAuthMode = "NONE" | "API_KEY" | "BEARER" | "BASIC" | "HMAC";

export type ExternalApiCredentials =
  | { apiKey: string; headerName?: string }
  | { token: string }
  | { username: string; password: string }
  | { hmacSecret: string; algorithm?: "sha256" | "sha512" }
  | Record<string, never>;

export interface ExternalApiSpec {
  baseUrl: string;
  authMode?: ExternalApiAuthMode;
  /** Plaintext credentials. Encrypted at rest; never returned by the API. */
  credentials?: ExternalApiCredentials;
  defaultHeaders?: Record<string, string>;
  /** Per-call timeout in ms. 0 = platform default (15s). */
  timeoutMs?: number;
}

/** Public ExternalApi shape — NEVER includes the encrypted credentials. */
export interface SafeExternalApi {
  id: string;
  resourceId: string;
  baseUrl: string;
  authMode: ExternalApiAuthMode;
  defaultHeaders: Record<string, string>;
  timeoutMs: number;
  version: number;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// DATABASE sidecar (Phase 7.5)

export type DatabaseDriver = "POSTGRES" | "MYSQL" | "SQLITE";
export type DatabaseSslMode = "DISABLE" | "REQUIRE" | "VERIFY_CA" | "VERIFY_FULL";

export interface DatabaseSpec {
  driver: DatabaseDriver;
  /** Hostname or IP. For SQLITE this holds the file path. */
  host: string;
  /** TCP port. POSTGRES default 5432, MYSQL 3306. Ignored for SQLITE. */
  port?: number;
  /** Database / schema name. For SQLITE same as the file path. */
  database: string;
  username?: string | null;
  /** Plaintext password. Encrypted at rest; never returned by the API. */
  password?: string | null;
  sslMode?: DatabaseSslMode;
  poolMin?: number;
  poolMax?: number;
}

/** Public DatabaseConnection shape — NEVER includes the encrypted password. */
export interface SafeDatabaseConnection {
  id: string;
  resourceId: string;
  driver: DatabaseDriver;
  host: string;
  port: number;
  database: string;
  username: string | null;
  sslMode: DatabaseSslMode;
  poolMin: number;
  poolMax: number;
  version: number;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listProjectResources(
  projectId: string,
  options: { kind?: ProjectResourceKind; status?: ProjectResourceStatus } = {},
  token?: string,
): Promise<ApiResponse<ProjectResource[]>> {
  const params = new URLSearchParams();
  if (options.kind) params.set("kind", options.kind);
  if (options.status) params.set("status", options.status);
  const qs = params.toString();
  return apiRequest<ProjectResource[]>(
    `/projects/${projectId}/resources${qs ? `?${qs}` : ""}`,
    { method: "GET", token },
  );
}

export function getProjectResource(
  projectId: string,
  resourceId: string,
  token?: string,
): Promise<ApiResponse<ProjectResourceWithSidecar>> {
  return apiRequest<ProjectResourceWithSidecar>(
    `/projects/${projectId}/resources/${resourceId}`,
    { method: "GET", token },
  );
}

export function createProjectResource(
  projectId: string,
  body: {
    kind: ProjectResourceKind;
    name: string;
    slug?: string;
    status?: ProjectResourceStatus;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    gatewayId?: string;
    httpRoute?: HttpRouteSpec;
    schedule?: ScheduleSpec;
    secret?: SecretSpec;
    externalApi?: ExternalApiSpec;
    database?: DatabaseSpec;
  },
  token?: string,
): Promise<ApiResponse<ProjectResource>> {
  return apiPost<ProjectResource>(
    `/projects/${projectId}/resources`,
    body,
    token,
  );
}

export function updateProjectResource(
  projectId: string,
  resourceId: string,
  body: {
    name?: string;
    slug?: string;
    status?: ProjectResourceStatus;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    httpRoute?: Partial<HttpRouteSpec>;
    schedule?: Partial<ScheduleSpec>;
    secret?: SecretPatch;
    externalApi?: Partial<ExternalApiSpec>;
    database?: Partial<DatabaseSpec>;
  },
  token?: string,
): Promise<ApiResponse<ProjectResource>> {
  return apiPatch<ProjectResource>(
    `/projects/${projectId}/resources/${resourceId}`,
    body,
    token,
  );
}

export function archiveProjectResource(
  projectId: string,
  resourceId: string,
  token?: string,
): Promise<ApiResponse<ProjectResource>> {
  return apiPost<ProjectResource>(
    `/projects/${projectId}/resources/${resourceId}/archive`,
    {},
    token,
  );
}

export function deleteProjectResource(
  projectId: string,
  resourceId: string,
  token?: string,
): Promise<ApiResponse<void>> {
  return apiDelete<void>(
    `/projects/${projectId}/resources/${resourceId}`,
    token,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Topology (Architecture Canvas)
// ─────────────────────────────────────────────────────────────────────────────

export type {
    DatabaseNode,
    ExternalApiNode,
    GatewayNode,
    HttpRouteNode,
    PluginNode,
    ProjectTopology,
    ScheduleNode,
    SecretNode,
    TopologyEdge,
    TopologyEdgeKind,
    TopologyNode,
    TopologyNodeKind,
    TopologyProjectMeta,
    WorkflowNode
} from "@/modules/project-resource/project-topology.service";

import type { ProjectTopology } from "@/modules/project-resource/project-topology.service";

export function getProjectTopology(
  projectId: string,
  token?: string,
): Promise<ApiResponse<ProjectTopology>> {
  return apiRequest<ProjectTopology>(
    `/projects/${projectId}/topology`,
    { method: "GET", token },
  );
}
