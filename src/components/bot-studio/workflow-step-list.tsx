"use client";

/**
 * Workflow Step List
 *
 * Renders a vertical pipeline of workflow steps with visual connectors.
 * Each step shows its plugin name, order, status, and action buttons.
 * Supports reorder (move up/down), delete, and selecting a step for editing.
 *
 * @module components/bot-studio/workflow-step-list
 */

import { useCallback, useState } from "react";

import type { WorkflowStepItem } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  GripVertical,
  Loader2,
  Plus,
  Puzzle,
  Settings2,
  Trash2,
} from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowStepListProps {
  steps: WorkflowStepItem[];
  selectedStepId: string | null;
  onSelectStep: (step: WorkflowStepItem) => void;
  onAddStep: (afterOrder: number) => void;
  onMoveStep: (stepId: string, newOrder: number) => Promise<void>;
  onDeleteStep: (stepId: string) => Promise<void>;
  isDisabled?: boolean;
}

// ===========================================
// Component
// ===========================================

export function WorkflowStepList({
  steps,
  selectedStepId,
  onSelectStep,
  onAddStep,
  onMoveStep,
  onDeleteStep,
  isDisabled,
}: WorkflowStepListProps) {
  const [movingId, setMovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  const handleMoveUp = useCallback(
    async (step: WorkflowStepItem, idx: number) => {
      if (idx === 0) return;
      setMovingId(step.id);
      try {
        const prev = sortedSteps[idx - 1];
        if (prev) await onMoveStep(step.id, prev.order);
      } finally {
        setMovingId(null);
      }
    },
    [onMoveStep, sortedSteps]
  );

  const handleMoveDown = useCallback(
    async (step: WorkflowStepItem, idx: number) => {
      if (idx === sortedSteps.length - 1) return;
      setMovingId(step.id);
      try {
        const next = sortedSteps[idx + 1];
        if (next) await onMoveStep(step.id, next.order);
      } finally {
        setMovingId(null);
      }
    },
    [onMoveStep, sortedSteps]
  );

  const handleDelete = useCallback(
    async (stepId: string) => {
      setDeletingId(stepId);
      try {
        await onDeleteStep(stepId);
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteStep]
  );

  // Empty state
  if (sortedSteps.length === 0) {
    return (
      <Card className="border-border bg-card/50 border-dashed">
        <CardContent className="py-10 text-center">
          <Puzzle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <h4 className="text-sm font-medium text-foreground mb-1">
            No steps yet
          </h4>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
            Add a plugin step to start building your workflow pipeline.
          </p>
          <Button
            onClick={() => onAddStep(0)}
            size="sm"
            disabled={isDisabled}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add First Step
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1">
      {sortedSteps.map((step, idx) => {
        const isSelected = step.id === selectedStepId;
        const isMoving = step.id === movingId;
        const isDeleting = step.id === deletingId;

        return (
          <div key={step.id}>
            {/* Step card */}
            <Card
              className={`border transition-colors cursor-pointer ${
                isSelected
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border bg-card/80 hover:bg-card"
              } ${isDisabled ? "opacity-60 pointer-events-none" : ""}`}
              onClick={() => onSelectStep(step)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  {/* Grip + Order */}
                  <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 min-w-[22px] justify-center"
                    >
                      {idx + 1}
                    </Badge>
                  </div>

                  {/* Plugin info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Puzzle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {step.name || step.pluginName || step.pluginSlug || "Unnamed Step"}
                      </span>
                    </div>
                    {step.condition && (
                      <p className="text-[10px] text-amber-500 mt-0.5 truncate">
                        Condition: {step.condition.if}
                      </p>
                    )}
                  </div>

                  {/* Error handling badge */}
                  {step.onError !== "stop" && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {step.onError === "continue" ? "Skip on error" : "Retry"}
                    </Badge>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(step, idx);
                      }}
                      disabled={idx === 0 || isMoving || isDisabled}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(step, idx);
                      }}
                      disabled={
                        idx === sortedSteps.length - 1 || isMoving || isDisabled
                      }
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStep(step);
                      }}
                      disabled={isDisabled}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(step.id);
                      }}
                      disabled={isDeleting || isDisabled}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>

            {/* Connector with add button between steps */}
            {idx < sortedSteps.length - 1 && (
              <div className="flex items-center justify-center py-0.5">
                <div className="flex flex-col items-center">
                  <div className="w-px h-2 bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 rounded-full border border-dashed border-muted-foreground/30 hover:border-emerald-500 hover:text-emerald-500"
                    onClick={() => onAddStep(step.order + 1)}
                    disabled={isDisabled}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <div className="w-px h-2 bg-border" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add step at end */}
      <div className="flex items-center justify-center pt-1">
        <div className="flex flex-col items-center">
          <div className="w-px h-3 bg-border" />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              const last = sortedSteps[sortedSteps.length - 1];
              onAddStep(last ? last.order + 1 : 0);
            }}
            disabled={isDisabled}
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </Button>
        </div>
      </div>
    </div>
  );
}
