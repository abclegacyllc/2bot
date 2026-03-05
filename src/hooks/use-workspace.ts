"use client";

/**
 * Workspace Hook
 *
 * Main hook for managing Docker workspace state, lifecycle, files,
 * plugins, git, and packages. Provides a comprehensive API for
 * the workspace dashboard UI.
 *
 * @module hooks/use-workspace
 */

import { useAuth } from "@/components/providers/auth-provider";
import { apiUrl } from "@/shared/config/urls";
import type {
  GitCloneResult,
  PackageInstallResult,
  WorkspaceFileEntry,
  WorkspaceLogEntry,
  WorkspaceLogQuery,
  WorkspacePluginProcess,
  WorkspaceResourceUsage,
  WorkspaceStatus
} from "@/shared/types/workspace";
import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================
// Types
// ===========================================

interface UseWorkspaceOptions {
  /** Auto-poll status when running */
  autoPoll?: boolean;
  /** Poll interval in ms (default: 5000) */
  pollInterval?: number;
}

/** Result of plugin pre-flight validation */
export interface PluginValidationResult {
  valid: boolean;
  problems: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    column?: number;
  }>;
}

interface UseWorkspaceReturn {
  // State
  workspace: WorkspaceStatus | null;
  loading: boolean;
  error: string | null;
  files: WorkspaceFileEntry[];
  plugins: WorkspacePluginProcess[];
  logs: WorkspaceLogEntry[];

  // Lifecycle
  createWorkspace: () => Promise<void>;
  startWorkspace: () => Promise<void>;
  stopWorkspace: () => Promise<void>;
  destroyWorkspace: () => Promise<void>;
  refreshStatus: () => Promise<void>;

  // Files
  listFiles: (path?: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createDir: (path: string) => Promise<void>;
  renameFile: (oldPath: string, newPath: string) => Promise<void>;

  // Plugins
  startPlugin: (file: string, env?: Record<string, string>) => Promise<void>;
  stopPlugin: (fileOrPid: string | number, force?: boolean) => Promise<void>;
  restartPlugin: (fileOrPid: string | number) => Promise<void>;
  refreshPlugins: () => Promise<void>;
  validatePlugin: (file: string) => Promise<PluginValidationResult>;
  registerDirectoryAsPlugin: (dirPath: string, gatewayId?: string) => Promise<{ id: string; pluginSlug: string }>;

  // Git
  gitClone: (url: string, branch?: string) => Promise<GitCloneResult>;
  gitPull: (dir?: string) => Promise<void>;
  gitStatus: (dir?: string) => Promise<unknown>;

  // Packages
  installPackages: (packages: string[], dev?: boolean) => Promise<PackageInstallResult>;
  uninstallPackages: (packages: string[]) => Promise<void>;
  listPackages: () => Promise<unknown>;

  // Logs
  fetchLogs: (query?: WorkspaceLogQuery) => Promise<void>;

  // Stats
  stats: WorkspaceResourceUsage | null;
  refreshStats: () => Promise<void>;

  // Auto-stop
  updateAutoStop: (minutes: number | null) => Promise<void>;
}

// ===========================================
// Helper
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options?.headers || {}),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    // error may be string or object { code, message }
    const errMsg = typeof json.error === 'string'
      ? json.error
      : json.error?.message || json.message || `API error ${res.status}`;
    throw new Error(errMsg);
  }
  // Use 'in' check to distinguish { data: null } from missing data field.
  // json.data ?? json would treat null as nullish and return the full response
  // object, breaking callers that expect null (e.g., workspace status).
  return ('data' in json) ? json.data : json;
}

// ===========================================
// Hook
// ===========================================

export function useWorkspace(options: UseWorkspaceOptions = {}): UseWorkspaceReturn {
  const { autoPoll = true, pollInterval = 5000 } = options;
  const { context } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [plugins, setPlugins] = useState<WorkspacePluginProcess[]>([]);
  const [logs, setLogs] = useState<WorkspaceLogEntry[]>([]);
  const [stats, setStats] = useState<WorkspaceResourceUsage | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const containerId = workspace?.id;

  // ===========================================
  // Get org query param
  // ===========================================
  const orgParam = context.type === "organization" && context.organizationId
    ? `?organizationId=${context.organizationId}`
    : "";

  // ===========================================
  // Lifecycle
  // ===========================================

  const refreshStatus = useCallback(async () => {
    try {
      const data = await apiFetch<WorkspaceStatus>(`/workspace/status${orgParam}`);
      setWorkspace(data);
      setError(null);
    } catch (err) {
      // No workspace yet is not an error
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("not found") || message.includes("No workspace")) {
        setWorkspace(null);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [orgParam]);

  const createWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/workspace${orgParam}`, { method: "POST" });
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
      setLoading(false);
    }
  }, [orgParam, refreshStatus]);

  const startWorkspace = useCallback(async () => {
    if (!containerId) return;
    setError(null);
    try {
      await apiFetch(`/workspace/${containerId}/start`, { method: "POST" });
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workspace");
    }
  }, [containerId, refreshStatus]);

  const stopWorkspace = useCallback(async () => {
    if (!containerId) return;
    setError(null);
    try {
      await apiFetch(`/workspace/${containerId}/stop`, { method: "POST" });
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop workspace");
    }
  }, [containerId, refreshStatus]);

  const destroyWorkspace = useCallback(async () => {
    if (!containerId) return;
    setError(null);
    try {
      await apiFetch(`/workspace/${containerId}?deleteData=true`, { method: "DELETE" });
      setWorkspace(null);
      setFiles([]);
      setPlugins([]);
      setLogs([]);
      setStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to destroy workspace");
    }
  }, [containerId]);

  // ===========================================
  // Files
  // ===========================================

  const listFiles = useCallback(async (path = "/") => {
    if (!containerId) return;
    try {
      const data = await apiFetch<WorkspaceFileEntry[]>(
        `/workspace/${containerId}/files?path=${encodeURIComponent(path)}&recursive=true`
      );
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list files");
    }
  }, [containerId]);

  const readFile = useCallback(async (path: string): Promise<string> => {
    if (!containerId) throw new Error("No workspace");
    const data = await apiFetch<{ content: string }>(
      `/workspace/${containerId}/files/read?path=${encodeURIComponent(path)}`
    );
    return data.content;
  }, [containerId]);

  const writeFile = useCallback(async (path: string, content: string) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/files`, {
      method: "POST",
      body: JSON.stringify({ path, content, createDirs: true }),
    });
  }, [containerId]);

  const deleteFile = useCallback(async (path: string) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/files`, {
      method: "DELETE",
      body: JSON.stringify({ path }),
    });
  }, [containerId]);

  const createDir = useCallback(async (path: string) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/files/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }, [containerId]);

  const renameFile = useCallback(async (oldPath: string, newPath: string) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/files/rename`, {
      method: "POST",
      body: JSON.stringify({ oldPath, newPath }),
    });
  }, [containerId]);

  // ===========================================
  // Plugins
  // ===========================================

  const refreshPlugins = useCallback(async () => {
    if (!containerId) return;
    try {
      const data = await apiFetch<WorkspacePluginProcess[]>(
        `/workspace/${containerId}/plugins`
      );
      setPlugins(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list plugins");
    }
  }, [containerId]);

  const startPlugin = useCallback(async (file: string, env?: Record<string, string>) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/plugins/start`, {
      method: "POST",
      body: JSON.stringify({ file, env }),
    });
    await refreshPlugins();
  }, [containerId, refreshPlugins]);

  const stopPlugin = useCallback(async (fileOrPid: string | number, force = false) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/plugins/stop`, {
      method: "POST",
      body: JSON.stringify({ file: String(fileOrPid), force }),
    });
    await refreshPlugins();
  }, [containerId, refreshPlugins]);

  const restartPlugin = useCallback(async (fileOrPid: string | number) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/plugins/restart`, {
      method: "POST",
      body: JSON.stringify({ file: String(fileOrPid) }),
    });
    await refreshPlugins();
  }, [containerId, refreshPlugins]);

  const validatePlugin = useCallback(async (file: string): Promise<PluginValidationResult> => {
    if (!containerId) return { valid: false, problems: [{ severity: 'error', message: 'No workspace running' }] };
    return apiFetch<PluginValidationResult>(`/workspace/${containerId}/plugins/validate`, {
      method: "POST",
      body: JSON.stringify({ file }),
    });
  }, [containerId]);

  const registerDirectoryAsPlugin = useCallback(async (dirPath: string, gatewayId?: string): Promise<{ id: string; pluginSlug: string }> => {
    const result = await apiFetch<{ id: string; pluginSlug: string }>(`/plugins/register-dir`, {
      method: "POST",
      body: JSON.stringify({ dirPath, gatewayId }),
    });
    await refreshPlugins();
    return result;
  }, [refreshPlugins]);

  // ===========================================
  // Git
  // ===========================================

  const gitClone = useCallback(async (url: string, branch?: string): Promise<GitCloneResult> => {
    if (!containerId) throw new Error("No workspace");
    return apiFetch<GitCloneResult>(`/workspace/${containerId}/git/clone`, {
      method: "POST",
      body: JSON.stringify({ url, branch, depth: 1 }),
    });
  }, [containerId]);

  const gitPull = useCallback(async (dir?: string) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/git/pull`, {
      method: "POST",
      body: JSON.stringify({ dir }),
    });
  }, [containerId]);

  const gitStatus = useCallback(async (dir?: string) => {
    if (!containerId) return null;
    return apiFetch(`/workspace/${containerId}/git/status?dir=${encodeURIComponent(dir || "/workspace")}`);
  }, [containerId]);

  // ===========================================
  // Packages
  // ===========================================

  const installPackages = useCallback(async (packages: string[], dev = false): Promise<PackageInstallResult> => {
    if (!containerId) throw new Error("No workspace");
    return apiFetch<PackageInstallResult>(`/workspace/${containerId}/packages/install`, {
      method: "POST",
      body: JSON.stringify({ packages, dev }),
    });
  }, [containerId]);

  const uninstallPackages = useCallback(async (packages: string[]) => {
    if (!containerId) return;
    await apiFetch(`/workspace/${containerId}/packages/uninstall`, {
      method: "POST",
      body: JSON.stringify({ packages }),
    });
  }, [containerId]);

  const listPackages = useCallback(async () => {
    if (!containerId) return null;
    return apiFetch(`/workspace/${containerId}/packages`);
  }, [containerId]);

  // ===========================================
  // Logs
  // ===========================================

  const fetchLogs = useCallback(async (query?: WorkspaceLogQuery) => {
    if (!containerId) return;
    const params = new URLSearchParams();
    if (query?.level) params.set("level", query.level);
    if (query?.source) params.set("source", query.source);
    if (query?.search) params.set("search", query.search);
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.order) params.set("order", query.order);

    try {
      const data = await apiFetch<WorkspaceLogEntry[]>(
        `/workspace/${containerId}/logs?${params.toString()}`
      );
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    }
  }, [containerId]);

  // ===========================================
  // Stats
  // ===========================================

  const refreshStats = useCallback(async () => {
    if (!containerId) return;
    try {
      const data = await apiFetch<WorkspaceResourceUsage>(
        `/workspace/${containerId}/stats`
      );
      setStats(data);
    } catch {
      // Stats may not be available if container is stopped
    }
  }, [containerId]);

  // ===========================================
  // Auto-stop
  // ===========================================

  const updateAutoStop = useCallback(async (minutes: number | null) => {
    if (!containerId) return;
    try {
      await apiFetch(`/workspace/${containerId}/auto-stop`, {
        method: "PATCH",
        body: JSON.stringify({ autoStopMinutes: minutes }),
      });
      // Refresh status to get updated autoStopMinutes value
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update auto-stop");
    }
  }, [containerId, refreshStatus]);

  // ===========================================
  // Auto-poll
  // ===========================================

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!autoPoll || !workspace) return;

    const isRunning = workspace.status === "RUNNING" || workspace.status === "STARTING";
    if (!isRunning) return;

    pollRef.current = setInterval(() => {
      refreshStatus();
      refreshStats();
      refreshPlugins();
    }, pollInterval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [autoPoll, pollInterval, workspace?.status, refreshStatus, refreshStats, refreshPlugins]);

  // ===========================================
  // Cleanup
  // ===========================================

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    workspace,
    loading,
    error,
    files,
    plugins,
    logs,
    createWorkspace,
    startWorkspace,
    stopWorkspace,
    destroyWorkspace,
    refreshStatus,
    listFiles,
    readFile,
    writeFile,
    deleteFile,
    createDir,
    renameFile,
    startPlugin,
    stopPlugin,
    restartPlugin,
    refreshPlugins,
    validatePlugin,
    registerDirectoryAsPlugin,
    gitClone,
    gitPull,
    gitStatus,
    installPackages,
    uninstallPackages,
    listPackages,
    fetchLogs,
    stats,
    refreshStats,
    updateAutoStop,
  };
}
