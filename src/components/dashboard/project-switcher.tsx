/**
 * ProjectSwitcher — dropdown to pick the current project from the active scope.
 * Stores selection in localStorage so it persists across page loads.
 *
 * @module components/dashboard/project-switcher
 */

"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/use-project";
import type { ProjectListItem } from "@/lib/api-client";
import { Check, ChevronDown, FolderKanban } from "lucide-react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

const STORAGE_KEY = "2bot:active-project-id";

// External store: localStorage. Lets us derive the active id without
// useState+useEffect coupling that React's stricter effect rules dislike.
const storeListeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  storeListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    storeListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

function setActive(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id === null) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  storeListeners.forEach((l) => l());
}

export interface ProjectSwitcherProps {
  /** Called whenever the active project changes. */
  onChange?: (project: ProjectListItem | null) => void;
  className?: string;
}

export function ProjectSwitcher({ onChange, className }: ProjectSwitcherProps) {
  const { projects, isLoading } = useProjects();
  const storedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Resolve the effective id: stored selection if still valid, else the
  // default project, else the first one.
  const effectiveId = useMemo<string | null>(() => {
    if (storedId && projects.some((p) => p.id === storedId)) return storedId;
    if (projects.length === 0) return null;
    return (projects.find((p) => p.isDefault) ?? projects[0])?.id ?? null;
  }, [storedId, projects]);

  const active = useMemo(
    () => projects.find((p) => p.id === effectiveId) ?? null,
    [projects, effectiveId],
  );

  // Notify parent whenever the active project changes. Synchronizing an
  // external listener with derived state — no setState in the body.
  useEffect(() => {
    onChange?.(active);
  }, [active, onChange]);

  const handleSelect = useCallback((id: string) => {
    setActive(id);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className} disabled={isLoading}>
          <FolderKanban className="mr-2 h-4 w-4" />
          <span className="max-w-[12rem] truncate">
            {active?.name ?? (isLoading ? "Loading…" : "Select project")}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.length === 0 ? (
          <DropdownMenuItem disabled>
            {isLoading ? "Loading…" : "No projects yet"}
          </DropdownMenuItem>
        ) : null}
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => handleSelect(p.id)}
            className="flex items-center gap-2"
          >
            <Check
              className={`h-3.5 w-3.5 ${p.id === effectiveId ? "opacity-100" : "opacity-0"}`}
            />
            <span className="flex-1 truncate">{p.name}</span>
            {p.isDefault ? (
              <span className="text-[10px] uppercase text-muted-foreground">default</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Read the currently selected project id (for non-React callers). */
export function getActiveProjectId(): string | null {
  return getSnapshot();
}
