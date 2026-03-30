/**
 * Workflow Undo/Redo Hook
 *
 * Tracks workflow step mutations (add, delete, move, toggle) and
 * provides undo/redo via Ctrl+Z / Ctrl+Shift+Z. Operations are
 * reversed by issuing the appropriate API calls.
 *
 * @module hooks/use-workflow-undo
 */

import { useCallback, useEffect, useRef } from "react";

import type { WorkflowStepItem } from "@/lib/api-client";
import {
    addWorkflowStep,
    deleteWorkflowStep,
    updateWorkflowStep,
} from "@/lib/api-client";
import { toast } from "sonner";

// ===========================================
// Types
// ===========================================

type UndoAction =
  | { type: "add"; workflowId: string; stepId: string }
  | { type: "delete"; workflowId: string; step: WorkflowStepItem }
  | { type: "move"; workflowId: string; stepId: string; oldOrder: number }
  | { type: "toggle"; workflowId: string; stepId: string; wasEnabled: boolean };

interface UseWorkflowUndoOpts {
  workflowId: string | undefined;
  organizationId?: string;
  token: string | null;
  fetchWorkflow: () => Promise<void>;
}

const MAX_HISTORY = 30;

// ===========================================
// Hook
// ===========================================

export function useWorkflowUndo({
  workflowId,
  organizationId,
  token,
  fetchWorkflow,
}: UseWorkflowUndoOpts) {
  const undoStack = useRef<UndoAction[]>([]);
  const redoStack = useRef<UndoAction[]>([]);
  const isUndoing = useRef(false);

  const headers = organizationId
    ? { organizationId }
    : {};

  // Push an action onto the undo stack
  const pushUndo = useCallback((action: UndoAction) => {
    if (isUndoing.current) return;
    undoStack.current.push(action);
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    // Clear redo on new action
    redoStack.current = [];
  }, []);

  // Reverse an action
  const reverseAction = useCallback(
    async (action: UndoAction): Promise<UndoAction | null> => {
      if (!workflowId) return null;
      isUndoing.current = true;

      try {
        switch (action.type) {
          case "add": {
            // Undo add → delete the step
            await deleteWorkflowStep(
              action.workflowId,
              action.stepId,
              headers,
              token ?? undefined
            );
            return { type: "delete", workflowId: action.workflowId, step: { id: action.stepId } as WorkflowStepItem };
          }
          case "delete": {
            // Undo delete → re-add the step
            const result = await addWorkflowStep(
              action.workflowId,
              {
                order: action.step.order,
                pluginId: action.step.pluginId,
                name: action.step.name,
                isEnabled: action.step.isEnabled,
                inputMapping: action.step.inputMapping,
                config: action.step.config,
                onError: action.step.onError,
                maxRetries: action.step.maxRetries,
              },
              headers,
              token ?? undefined
            );
            if (result.success && result.data) {
              return { type: "add", workflowId: action.workflowId, stepId: result.data.id };
            }
            return null;
          }
          case "move": {
            // Undo move → move back to old order
            const currentStep = await updateWorkflowStep(
              action.workflowId,
              action.stepId,
              { order: action.oldOrder },
              headers,
              token ?? undefined
            );
            if (currentStep.success) {
              return { type: "move", workflowId: action.workflowId, stepId: action.stepId, oldOrder: action.oldOrder };
            }
            return null;
          }
          case "toggle": {
            // Undo toggle → restore previous state
            await updateWorkflowStep(
              action.workflowId,
              action.stepId,
              { isEnabled: action.wasEnabled },
              headers,
              token ?? undefined
            );
            return { type: "toggle", workflowId: action.workflowId, stepId: action.stepId, wasEnabled: !action.wasEnabled };
          }
        }
      } catch {
        toast.error("Undo failed");
        return null;
      } finally {
        isUndoing.current = false;
      }
    },
    [workflowId, headers, token]
  );

  const undo = useCallback(async () => {
    const action = undoStack.current.pop();
    if (!action) {
      toast.info("Nothing to undo");
      return;
    }

    const reverse = await reverseAction(action);
    if (reverse) {
      redoStack.current.push(action);
      toast.success("Undone");
      await fetchWorkflow();
    }
  }, [reverseAction, fetchWorkflow]);

  const redo = useCallback(async () => {
    const action = redoStack.current.pop();
    if (!action) {
      toast.info("Nothing to redo");
      return;
    }

    const reverse = await reverseAction(action);
    if (reverse) {
      undoStack.current.push(action);
      toast.success("Redone");
      await fetchWorkflow();
    }
  }, [reverseAction, fetchWorkflow]);

  // Keyboard listener: Ctrl+Z for undo, Ctrl+Shift+Z for redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return {
    pushUndo,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
