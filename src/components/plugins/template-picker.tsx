"use client";

/**
 * Template Picker Component
 *
 * Displays plugin templates as selectable cards with difficulty badges.
 * Used during custom plugin creation to pick a starter template.
 *
 * @module components/plugins/template-picker
 */

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPluginTemplates } from "@/lib/api-client";
import type { PluginTemplateListItem } from "@/shared/types/plugin";

// ===========================================
// Types
// ===========================================

interface TemplatePickerProps {
  onSelect: (templateId: string) => void;
  selectedId?: string;
  token?: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-900/50 text-green-300",
  intermediate: "bg-yellow-900/50 text-yellow-300",
  advanced: "bg-red-900/50 text-red-300",
};

const CATEGORY_EMOJI: Record<string, string> = {
  general: "🔌",
  analytics: "📈",
  messaging: "💬",
  automation: "⚙️",
  moderation: "🛡️",
  utilities: "🔧",
};

// ===========================================
// Component
// ===========================================

export function TemplatePicker({ onSelect, selectedId, token }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<PluginTemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const result = await getPluginTemplates(undefined, token);
      if (result.success && result.data) {
        setTemplates(result.data);
      } else {
        setError(result.error?.message || "Failed to load templates");
      }
    } catch {
      setError("Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border bg-card/50 animate-pulse">
            <CardHeader>
              <div className="h-5 bg-muted rounded w-2/3" />
              <div className="h-4 bg-muted rounded w-full mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((template) => (
        <Card
          key={template.id}
          className={`border-border bg-card/50 cursor-pointer transition-all hover:bg-card/70 ${
            selectedId === template.id
              ? "ring-2 ring-emerald-500 border-emerald-500/50"
              : ""
          }`}
          onClick={() => onSelect(template.id)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {CATEGORY_EMOJI[template.category] || "🔌"}
                </span>
                <CardTitle className="text-foreground text-base">
                  {template.name}
                </CardTitle>
              </div>
              <div className="flex items-center gap-1.5">
                {template.isDirectory ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    📁 Multi-file
                  </span>
                ) : null}
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    DIFFICULTY_COLORS[template.difficulty] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {template.difficulty}
                </span>
              </div>
            </div>
            <CardDescription className="text-muted-foreground text-sm mt-1">
              {template.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1.5">
              {template.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
            {template.requiredGateways.length > 0 ? (
              <div className="text-xs text-muted-foreground mt-2">
                Requires: {template.requiredGateways.join(", ")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
