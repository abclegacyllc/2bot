"use client";

/**
 * ProjectStudioContext
 *
 * Shared state for `/studio/[projectId]/*` pages: the active Project and its
 * topology (used by every tab — Architecture renders it as a canvas, the other
 * tabs read filtered slices of it).
 *
 * @module components/studio/project-studio-context
 */

import { useAuth } from "@/components/providers/auth-provider";
import { useProject } from "@/hooks/use-project";
import {
    getProjectTopology,
    type ProjectListItem,
    type ProjectTopology,
} from "@/lib/api-client";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

interface ProjectStudioContextValue {
  projectId: string;
  project: ProjectListItem | null;
  topology: ProjectTopology | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch project + topology (use after a mutation). */
  refresh: () => Promise<void>;
}

const ProjectStudioContext = createContext<ProjectStudioContextValue | null>(null);

export function useProjectStudio(): ProjectStudioContextValue {
  const ctx = useContext(ProjectStudioContext);
  if (!ctx) {
    throw new Error("useProjectStudio must be used within ProjectStudioProvider");
  }
  return ctx;
}

interface ProjectStudioProviderProps {
  projectId: string;
  children: ReactNode;
}

export function ProjectStudioProvider({
  projectId,
  children,
}: ProjectStudioProviderProps) {
  const { token } = useAuth();
  const { project, isLoading: projectLoading, error: projectError, refresh: refreshProject } =
    useProject(projectId);

  const [topology, setTopology] = useState<ProjectTopology | null>(null);
  const [topologyLoading, setTopologyLoading] = useState(true);
  const [topologyError, setTopologyError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const refreshTopology = useCallback(async () => {
    if (!projectId) return;
    const reqId = ++reqIdRef.current;
    setTopologyLoading(true);
    setTopologyError(null);
    try {
      const res = await getProjectTopology(projectId, token ?? undefined);
      if (reqId !== reqIdRef.current) return;
      if (res.success && res.data) {
        setTopology(res.data);
      } else {
        setTopologyError(res.error?.message ?? "Failed to load topology");
      }
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setTopologyError(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqId === reqIdRef.current) setTopologyLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    void refreshTopology();
  }, [refreshTopology]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshProject(), refreshTopology()]);
  }, [refreshProject, refreshTopology]);

  const value: ProjectStudioContextValue = {
    projectId,
    project,
    topology,
    isLoading: projectLoading || topologyLoading,
    error: projectError ?? topologyError,
    refresh,
  };

  return (
    <ProjectStudioContext.Provider value={value}>
      {children}
    </ProjectStudioContext.Provider>
  );
}
