/**
 * useProjects / useProject
 *
 * Client hooks for the Project layer (/ 7.1).
 * Auto-resolves the active scope (personal vs organization) from the auth
 * context and forwards it to the API client.
 *
 * @module hooks/use-project
 */

"use client";

import { useAuth } from "@/components/providers/auth-provider";
import {
  getProject,
  listProjects,
  type ProjectListItem,
} from "@/lib/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseProjectsState {
  projects: ProjectListItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetch the list of projects in the currently active scope.
 * Re-fetches automatically when the scope changes.
 */
export function useProjects(): UseProjectsState {
  const { token, context, isAuthenticated } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const orgId = context.type === "organization" ? context.organizationId ?? null : null;

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await listProjects({ organizationId: orgId }, token);
      if (reqId !== reqIdRef.current) return; // stale
      if (res.success && res.data) {
        setProjects(res.data);
      } else {
        setProjects([]);
        setError(res.error?.message ?? "Failed to load projects");
      }
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false);
    }
  }, [isAuthenticated, token, orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { projects, isLoading, error, refresh };
}

interface UseProjectState {
  project: ProjectListItem | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetch a single project by id in the currently active scope.
 */
export function useProject(projectId: string | null | undefined): UseProjectState {
  const { token, context, isAuthenticated } = useAuth();
  const [project, setProject] = useState<ProjectListItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const orgId = context.type === "organization" ? context.organizationId ?? null : null;

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !token || !projectId) {
      setProject(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getProject(projectId, { organizationId: orgId }, token);
      if (reqId !== reqIdRef.current) return;
      if (res.success && res.data) {
        setProject(res.data);
      } else {
        setProject(null);
        setError(res.error?.message ?? "Failed to load project");
      }
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false);
    }
  }, [isAuthenticated, token, orgId, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { project, isLoading, error, refresh };
}
