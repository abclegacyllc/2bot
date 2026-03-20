"use client";

/**
 * Workflow Plugin Sidebar
 *
 * Draggable plugin catalog for workflow canvas. Users drag plugins
 * from this sidebar onto the canvas to add steps.
 *
 * @module components/bot-studio/workflow-plugin-sidebar
 */

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useWorkflowPlugins } from "@/hooks/use-workflow-plugins";
import type { PluginListItem } from "@/shared/types/plugin";
import { GripVertical, Loader2, Puzzle, Search } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowPluginSidebarProps {
  gatewayType: string;
  token: string | null;
}

/** Drag data format used on the canvas drop zone */
export const PLUGIN_DRAG_TYPE = "application/x-workflow-plugin";

// ===========================================
// Component
// ===========================================

export function WorkflowPluginSidebar({
  gatewayType,
  token,
}: WorkflowPluginSidebarProps) {
  const { plugins, isLoading, error } = useWorkflowPlugins({ gatewayType, token });
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = searchQuery.trim()
    ? plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : plugins;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Plugins
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-muted border-border"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-center py-6 text-xs text-destructive">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground">
            No plugins found.
          </p>
        ) : (
          filtered.map((plugin) => (
            <DraggablePluginCard key={plugin.id} plugin={plugin} />
          ))
        )}
      </div>
    </div>
  );
}

// ===========================================
// Draggable Plugin Card
// ===========================================

function DraggablePluginCard({ plugin }: { plugin: PluginListItem }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      PLUGIN_DRAG_TYPE,
      JSON.stringify({ id: plugin.id, name: plugin.name, slug: plugin.slug })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center gap-2 px-2 py-2 rounded-md border border-transparent hover:border-border hover:bg-card/80 cursor-grab active:cursor-grabbing transition-colors group"
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
      <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Puzzle className="h-3.5 w-3.5 text-emerald-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {plugin.name}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {plugin.description}
        </p>
      </div>
      {plugin.isBuiltin ? (
        <Badge variant="secondary" className="text-[9px] px-1 shrink-0">
          Built-in
        </Badge>
      ) : null}
    </div>
  );
}
