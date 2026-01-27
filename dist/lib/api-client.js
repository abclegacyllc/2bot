"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRequest = apiRequest;
exports.apiGet = apiGet;
exports.apiPost = apiPost;
exports.apiPut = apiPut;
exports.apiPatch = apiPatch;
exports.apiDelete = apiDelete;
exports.apiPostForm = apiPostForm;
const urls_1 = require("@/shared/config/urls");
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
async function apiRequest(path, options = {}) {
    const { token, headers, body, ...rest } = options;
    const url = (0, urls_1.apiUrl)(path);
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
    }
    catch (error) {
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
function apiGet(path, token) {
    return apiRequest(path, { method: "GET", token });
}
/**
 * POST request
 *
 * @example
 * const result = await apiPost<Gateway>("/user/gateways", { name: "New Gateway" }, token);
 */
function apiPost(path, body, token) {
    return apiRequest(path, { method: "POST", body, token });
}
/**
 * PUT request
 *
 * @example
 * const result = await apiPut<Gateway>("/user/gateways/123", { name: "Updated" }, token);
 */
function apiPut(path, body, token) {
    return apiRequest(path, { method: "PUT", body, token });
}
/**
 * PATCH request
 *
 * @example
 * const result = await apiPatch<Gateway>("/user/gateways/123", { name: "Patched" }, token);
 */
function apiPatch(path, body, token) {
    return apiRequest(path, { method: "PATCH", body, token });
}
/**
 * DELETE request
 *
 * @example
 * const { success } = await apiDelete("/user/gateways/123", token);
 */
function apiDelete(path, token) {
    return apiRequest(path, { method: "DELETE", token });
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
async function apiPostForm(path, formData, token) {
    const url = (0, urls_1.apiUrl)(path);
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
    }
    catch (error) {
        return {
            success: false,
            error: {
                code: "NETWORK_ERROR",
                message: error instanceof Error ? error.message : "Network request failed",
            },
        };
    }
}
//# sourceMappingURL=api-client.js.map