"use client";

/**
 * ProjectStudioTopTabs
 *
 * Horizontal tab bar for `/studio/[projectId]/*` routes — mirrors the
 * `bot-studio-view.tsx` layered look (breadcrumb header → tab strip with
 * bottom-border active state → content). Replaces the old left-rail
 * `ProjectStudioSidebar`, which collided visually with the persistent
 * `CursorStudioBar` on the left.
 *
 * Pure presentation: no data fetching. Active tab derived from `usePathname()`.
 *
 * @module components/studio/project-studio-top-tabs
 */

import { useStudioBasePath } from "@/hooks/use-studio-base-path";
import { cn } from "@/lib/utils";
import {
    GitBranch,
    Layers,
    Network,
    Plug,
    Router as RouterIcon,
    Settings,
    Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProjectStudioTopTabsProps {
  projectId: string;
  projectName?: string | null;
}

const TABS = [
  { slug: "architecture", label: "Architecture", icon: Network },
  { slug: "workflows", label: "Workflows", icon: Workflow },
  { slug: "resources", label: "Resources", icon: Layers },
  { slug: "plugins", label: "Plugins", icon: Plug },
  { slug: "gateways", label: "Gateways", icon: RouterIcon },
  { slug: "versions", label: "Versions", icon: GitBranch },
  { slug: "settings", label: "Settings", icon: Settings },
] as const;

export function ProjectStudioTopTabs({
  projectId,
  projectName,
}: ProjectStudioTopTabsProps) {
  const pathname = usePathname();
  const base = useStudioBasePath(projectId);

  return (
    <div className="flex flex-shrink-0 flex-col border-b bg-card/20">
      {/* Breadcrumb / project header */}
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <span className="text-muted-foreground">Studio</span>
        <span className="text-muted-foreground">/</span>
        <span className="truncate font-semibold" title={projectName ?? ""}>
          {projectName ?? "Loading…"}
        </span>
      </div>

      {/* Tab strip */}
      <nav className="flex h-9 items-center gap-0 overflow-x-auto px-4">
        {TABS.map((tab) => {
          const href = `${base}/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.slug}
              href={href}
              className={cn(
                "relative flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-xs font-medium capitalize transition-colors",
                active
                  ? "border-emerald-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
