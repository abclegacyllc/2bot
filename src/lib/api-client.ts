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
