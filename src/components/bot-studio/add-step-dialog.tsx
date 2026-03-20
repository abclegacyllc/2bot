"use client";

/**
 * Add Step Dialog
 *
 * Dialog for selecting a plugin from the catalog to add as a new workflow step.
 * Shows a searchable, filterable list of available plugins.
 *
 * @module components/bot-studio/add-step-dialog
 */

import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkflowPlugins } from "@/hooks/use-workflow-plugins";
import type { PluginListItem } from "@/shared/types/plugin";
import { Check, Loader2, Plus, Puzzle, Search, Sparkles } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface AddStepDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (plugin: PluginListItem) => void;
  gatewayType: string;
  token: string | null;
}

// ===========================================
// Component
// ===========================================

export function AddStepDialog({
  open,
  onClose,
  onSelect,
  gatewayType,
  token,
}: AddStepDialogProps) {
  const { plugins, isLoading, error } = useWorkflowPlugins({
    gatewayType,
    token,
    enabled: open,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset on open
  const handleOpenChange = useCallback(
    (o: boolean) => {
      if (!o) {
        onClose();
      } else {
        setSelectedId(null);
        setSearchQuery("");
      }
    },
    [onClose]
  );

  const filtered = searchQuery.trim()
    ? plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : plugins;

  const handleConfirm = useCallback(() => {
    const plugin = plugins.find((p) => p.id === selectedId);
    if (plugin) {
      onSelect(plugin);
    }
  }, [plugins, selectedId, onSelect]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Add Workflow Step
          </DialogTitle>
          <DialogDescription>
            Choose a plugin to add as a step in your workflow pipeline.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted border-border"
          />
        </div>

        {/* Plugin list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh] pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive text-sm">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No compatible plugins found.
            </div>
          ) : (
            filtered.map((plugin) => {
              const isSelected = plugin.id === selectedId;
              return (
                <Card
                  key={plugin.id}
                  className={`cursor-pointer transition-colors border ${
                    isSelected
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-border hover:bg-card"
                  }`}
                  onClick={() => setSelectedId(plugin.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Puzzle className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {plugin.name}
                          </span>
                          {plugin.isBuiltin ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Built-in
                            </Badge>
                          ) : null}
                          {!plugin.isBuiltin && plugin.authorType === "USER" ? (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                              My Plugin
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {plugin.description}
                        </p>
                      </div>
                      {isSelected ? (
                        <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Confirm */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add Step
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
