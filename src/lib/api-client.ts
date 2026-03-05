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
