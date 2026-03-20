"use client";

/**
 * Template App Card
 *
 * Displays a plugin template as an "App" card in Bot Studio.
 * Shows template info with a "Use Template" action button.
 *
 * @module components/bot-studio/template-app-card
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type { PluginTemplateListItem } from "@/shared/types/plugin";
import { Sparkles } from "lucide-react";

// ===========================================
// Constants
// ===========================================

const CATEGORY_EMOJI: Record<string, string> = {
  general: "🔌",
  analytics: "📈",
  messaging: "💬",
  automation: "⚙️",
  moderation: "🛡️",
  utilities: "🔧",
};

const DIFFICULTY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  beginner: "secondary",
  intermediate: "default",
  advanced: "destructive",
};

// ===========================================
// Component
// ===========================================

interface TemplateAppCardProps {
  template: PluginTemplateListItem;
  onUse: (templateId: string) => void;
}

export function TemplateAppCard({ template, onUse }: TemplateAppCardProps) {
  const emoji = CATEGORY_EMOJI[template.category] || "🔌";

  return (
    <Card className="border-border bg-card/50 hover:bg-card/80 transition-colors group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{emoji}</span>
            <div>
              <CardTitle className="text-foreground text-base leading-tight">
                {template.name}
              </CardTitle>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant={DIFFICULTY_VARIANT[template.difficulty] || "outline"} className="text-[10px] px-1.5 py-0">
                  {template.difficulty}
                </Badge>
                {template.isDirectory ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    📁 Multi-file
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <CardDescription className="text-muted-foreground text-sm mt-2 line-clamp-2">
          {template.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        {template.requiredGateways.length > 0 ? (
          <p className="text-[11px] text-muted-foreground mb-3">
            Requires: {template.requiredGateways.join(", ")}
          </p>
        ) : null}
        <Button
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          onClick={() => onUse(template.id)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Use Template
        </Button>
      </CardContent>
    </Card>
  );
}
