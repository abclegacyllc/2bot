"use client";

/**
 * Workflow Step Editor
 *
 * Panel for configuring a single workflow step: plugin info,
 * input mapping editor, conditional execution, and error handling.
 *
 * @module components/bot-studio/workflow-step-editor
 */

import { useCallback, useRef, useState } from "react";

import { ConfigFormRenderer } from "@/components/bot-studio/config-form-renderer";
import type { WorkflowStepItem } from "@/lib/api-client";
import type { ConfigSchema } from "@/shared/types/plugin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  Loader2,
  Plus,
  Puzzle,
  Save,
  Trash2,
  X,
} from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowStepEditorProps {
  step: WorkflowStepItem;
  configSchema?: ConfigSchema | null;
  onSave: (stepId: string, data: StepEditorData) => Promise<void>;
  onClose: () => void;
  isDisabled?: boolean;
  /** Steps that come before this one in the workflow (for dynamic variables) */
  previousSteps?: WorkflowStepItem[];
}

// Known valid variable patterns for real-time validation
const KNOWN_VARIABLE_ROOTS = [
  "trigger.message.text",
  "trigger.message.from",
  "trigger.message.chat_id",
  "trigger.message",
  "trigger.data",
  "trigger",
  "prev.output",
  "prev.error",
  "prev",
];

// Also validate the form: steps[N].xxx
const KNOWN_STEP_SUBPATHS = ["output", "error"];

/** Match all {{...}} variable references in a string */
function extractVariables(value: string): Array<{ variable: string; start: number; end: number }> {
  const results: Array<{ variable: string; start: number; end: number }> = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    results.push({ variable: match[1]!.trim(), start: match.index, end: regex.lastIndex });
  }
  return results;
}

/** Check if a variable reference is valid */
function isValidVariable(variable: string, stepCount: number): boolean {
  if (KNOWN_VARIABLE_ROOTS.some((r) => variable === r || variable.startsWith(r + "."))) return true;
  // steps[N].output or steps[N].output.xxx  or steps[N].error
  const stepsMatch = variable.match(/^steps\[(\d+)\]\.(output|error)/);
  if (stepsMatch) {
    const idx = parseInt(stepsMatch[1]!, 10);
    return idx >= 0 && idx < stepCount;
  }
  // Also accept steps.N.output dot notation
  const dotMatch = variable.match(/^steps\.(\d+)\.(output|error)/);
  if (dotMatch) {
    const idx = parseInt(dotMatch[1]!, 10);
    return idx >= 0 && idx < stepCount;
  }
  return false;
}

// ===========================================
// Condition Builder (D4)
// ===========================================

const CONDITION_OPERATORS = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "truthy", label: "is not empty" },
  { value: "falsy", label: "is empty" },
] as const;

function parseCondition(expr: string): { field: string; operator: string; value: string } | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  // Try to match: {{field}} == 'value' or {{field}} != 'value'
  const compareMatch = trimmed.match(/^\{\{([^}]+)\}\}\s*(==|!=)\s*['"]?([^'"]*?)['"]?$/);
  if (compareMatch) {
    return { field: compareMatch[1]!.trim(), operator: compareMatch[2]!, value: compareMatch[3]! };
  }
  // Truthy check: just {{field}}
  const truthyMatch = trimmed.match(/^\{\{([^}]+)\}\}$/);
  if (truthyMatch) {
    return { field: truthyMatch[1]!.trim(), operator: "truthy", value: "" };
  }
  return null;
}

function buildCondition(field: string, operator: string, value: string): string {
  if (!field) return "";
  if (operator === "truthy") return `{{${field}}}`;
  if (operator === "falsy") return `{{${field}}} == ''`;
  if (operator === "contains") return `{{${field}}} contains '${value}'`;
  return `{{${field}}} ${operator} '${value}'`;
}

function ConditionBuilder({
  value,
  onChange,
  previousSteps,
  isDisabled,
}: {
  value: string;
  onChange: (v: string) => void;
  previousSteps: WorkflowStepItem[];
  isDisabled?: boolean;
}) {
  const [useRawMode, setUseRawMode] = useState(() => {
    // Default to raw mode if the expression can't be parsed by the builder
    return value.trim() !== "" && parseCondition(value) === null;
  });

  const parsed = parseCondition(value);
  const field = parsed?.field ?? "";
  const operator = parsed?.operator ?? "==";
  const condValue = parsed?.value ?? "";

  // Build field options from available variables
  const fieldOptions = [
    { value: "trigger.message.text", label: "Message text" },
    { value: "trigger.message.from", label: "Sender" },
    { value: "prev.output", label: "Previous step output" },
    { value: "prev.error", label: "Previous step error" },
    ...previousSteps.map((ps) => ({
      value: `steps[${ps.order}].output`,
      label: `Step ${ps.order + 1} output (${ps.name || ps.pluginName || ps.pluginSlug})`,
    })),
  ];

  const handleFieldChange = (f: string) => onChange(buildCondition(f, operator, condValue));
  const handleOperatorChange = (op: string) => onChange(buildCondition(field, op, condValue));
  const handleValueChange = (v: string) => onChange(buildCondition(field, operator, v));

  if (useRawMode) {
    return (
      <div className="space-y-1.5">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"{{prev.sentiment}} == 'negative'"}
          className="bg-muted border-border text-xs font-mono min-h-[60px]"
          disabled={isDisabled}
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Supported: <code className="bg-muted px-1 rounded">== !=</code> comparisons and truthy checks.
          </p>
          <button
            type="button"
            className="text-[10px] text-sky-500 hover:underline"
            onClick={() => setUseRawMode(false)}
          >
            Use builder
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Select value={field || "__placeholder"} onValueChange={(v) => handleFieldChange(v === "__placeholder" ? "" : v)} disabled={isDisabled}>
          <SelectTrigger className="bg-muted border-border text-xs h-8">
            <SelectValue placeholder="Select a field…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__placeholder" disabled>Select a field…</SelectItem>
            {fieldOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={operator} onValueChange={handleOperatorChange} disabled={isDisabled}>
          <SelectTrigger className="bg-muted border-border text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value}>
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {operator !== "truthy" && operator !== "falsy" && (
          <Input
            value={condValue}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Value to compare…"
            className="bg-muted border-border text-xs h-8"
            disabled={isDisabled}
          />
        )}
      </div>

      {field ? (
        <p className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
          {value || "…"}
        </p>
      ) : null}

      <button
        type="button"
        className="text-[10px] text-sky-500 hover:underline"
        onClick={() => setUseRawMode(true)}
      >
        Edit as expression
      </button>
    </div>
  );
}

export interface StepEditorData {
  name?: string;
  inputMapping?: Record<string, string>;
  config?: Record<string, unknown>;
  onError?: string;
  maxRetries?: number;
  condition?: { if: string } | null;
}

// ===========================================
// Component
// ===========================================

export function WorkflowStepEditor({
  step,
  configSchema,
  onSave,
  onClose,
  isDisabled,
  previousSteps = [],
}: WorkflowStepEditorProps) {
  const [name, setName] = useState(step.name || "");
  const [pluginConfig, setPluginConfig] = useState<Record<string, unknown>>(step.config || {});
  const [onError, setOnError] = useState(step.onError || "stop");
  const [maxRetries, setMaxRetries] = useState(step.maxRetries ?? 0);
  const [timeoutSec, setTimeoutSec] = useState(() => {
    const ms = (step.config as Record<string, unknown> | null)?.timeoutMs;
    return typeof ms === "number" ? Math.round(ms / 1000) : 60;
  });
  const [conditionEnabled, setConditionEnabled] = useState(!!step.condition);
  const [conditionExpr, setConditionExpr] = useState(step.condition?.if || "");
  const [gatewayActionsEnabled, setGatewayActionsEnabled] = useState(
    () => (step.config as Record<string, unknown> | null)?.gatewayActionsEnabled === true
  );
  const [mappings, setMappings] = useState<Array<{ key: string; value: string }>>(
    () => {
      const entries = Object.entries(step.inputMapping || {});
      return entries.length > 0
        ? entries.map(([key, value]) => ({ key, value }))
        : [];
    }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showVarRef, setShowVarRef] = useState(false);

  // Track which mapping value field was last focused for click-to-insert
  const activeMappingIdx = useRef<number | null>(null);
  const mappingValueRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const handleAddMapping = useCallback(() => {
    setMappings((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const handleRemoveMapping = useCallback((idx: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleMappingChange = useCallback(
    (idx: number, field: "key" | "value", val: string) => {
      setMappings((prev) =>
        prev.map((m, i) => (i === idx ? { ...m, [field]: val } : m))
      );
    },
    []
  );

  const handleInsertVariable = useCallback((variable: string) => {
    const idx = activeMappingIdx.current;
    if (idx !== null && mappingValueRefs.current.has(idx)) {
      const input = mappingValueRefs.current.get(idx)!;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const newValue = input.value.slice(0, start) + variable + input.value.slice(end);
      handleMappingChange(idx, "value", newValue);
      requestAnimationFrame(() => {
        input.focus();
        const pos = start + variable.length;
        input.setSelectionRange(pos, pos);
      });
      toast.success("Variable inserted");
    } else {
      navigator.clipboard.writeText(variable);
      toast.success("Copied to clipboard");
    }
  }, [handleMappingChange]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const inputMapping: Record<string, string> = {};
      for (const m of mappings) {
        if (m.key.trim()) {
          inputMapping[m.key.trim()] = m.value;
        }
      }

      await onSave(step.id, {
        name: name.trim() || undefined,
        inputMapping,
        config: { ...pluginConfig, timeoutMs: timeoutSec * 1000, gatewayActionsEnabled },
        onError,
        maxRetries,
        condition: conditionEnabled && conditionExpr.trim()
          ? { if: conditionExpr.trim() }
          : null,
      });
    } catch {
      toast.error("Failed to save step configuration");
    } finally {
      setIsSaving(false);
    }
  }, [step.id, name, mappings, pluginConfig, timeoutSec, onError, maxRetries, conditionEnabled, conditionExpr, gatewayActionsEnabled, onSave]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-foreground">
              Step {step.order + 1}: {step.pluginName || step.pluginSlug || "Plugin"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Step name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Step Name (optional)</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={step.pluginName || "Step name"}
            className="bg-muted border-border text-sm"
            disabled={isDisabled}
          />
        </div>

        {/* Input Mapping */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Pass data to this step</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1 px-2"
              onClick={handleAddMapping}
              disabled={isDisabled}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Connect data from the message or previous steps using template variables like{" "}
            <code className="bg-muted px-1 rounded">{"{{trigger.message.text}}"}</code>{" "}
            or <code className="bg-muted px-1 rounded">{"{{prev.output}}"}</code>
          </p>

          {/* Variable Reference */}
          <div className="rounded-md border border-border bg-muted/30">
            <button
              type="button"
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowVarRef((v) => !v)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showVarRef ? "" : "-rotate-90"}`} />
              Available Variables
            </button>
            {showVarRef ? (
              <div className="px-2.5 pb-2.5 space-y-2 text-[10px]">
                <div>
                  <p className="font-medium text-foreground mb-0.5">Trigger Data</p>
                  <div className="space-y-0.5 text-muted-foreground font-mono">
                    <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{trigger.message.text}}")}>{"{{trigger.message.text}}"}</code> — message text</p>
                    <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{trigger.message.from}}")}>{"{{trigger.message.from}}"}</code> — sender info</p>
                    <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{trigger.message.chat_id}}")}>{"{{trigger.message.chat_id}}"}</code> — chat identifier</p>
                    <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{trigger.data}}")}>{"{{trigger.data}}"}</code> — full trigger payload</p>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-0.5">Previous Steps</p>
                  <div className="space-y-1 text-muted-foreground font-mono">
                    {previousSteps.length > 0 ? (
                      previousSteps.map((ps) => (
                        <div key={ps.id}>
                          <p className="text-[9px] text-foreground/70 font-sans mb-0.5">
                            Step {ps.order + 1}: {ps.name || ps.pluginName || ps.pluginSlug}
                          </p>
                          <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable(`{{steps[${ps.order}].output}}`)}>
                            {`{{steps[${ps.order}].output}}`}
                          </code> — output</p>
                          <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable(`{{steps[${ps.order}].error}}`)}>
                            {`{{steps[${ps.order}].error}}`}
                          </code> — error (if any)</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground/60 font-sans italic">No previous steps yet</p>
                    )}
                    <div className="border-t border-border/50 pt-1 mt-1">
                      <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{prev.output}}")}>{"{{prev.output}}"}</code> — previous step output</p>
                      <p><code className="bg-muted px-1 rounded cursor-pointer hover:bg-muted/80" onClick={() => handleInsertVariable("{{prev.error}}")}>{"{{prev.error}}"}</code> — previous step error</p>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground/60 italic">Click to insert into active field, or copy to clipboard</p>
              </div>
            ) : null}
          </div>
          {mappings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No input mappings. Trigger data will be passed directly.
            </p>
          ) : (
            <div className="space-y-2">
              {mappings.map((m, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                  <Input
                    value={m.key}
                    onChange={(e) => handleMappingChange(idx, "key", e.target.value)}
                    placeholder="key"
                    className="bg-muted border-border text-xs flex-1"
                    disabled={isDisabled}
                  />
                  <span className="text-muted-foreground text-xs">=</span>
                  <Input
                    value={m.value}
                    onChange={(e) => handleMappingChange(idx, "value", e.target.value)}
                    placeholder="{{trigger.message.text}}"
                    className="bg-muted border-border text-xs flex-[2]"
                    disabled={isDisabled}
                    ref={(el) => {
                      if (el) mappingValueRefs.current.set(idx, el);
                      else mappingValueRefs.current.delete(idx);
                    }}
                    onFocus={() => { activeMappingIdx.current = idx; }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                    onClick={() => handleRemoveMapping(idx)}
                    disabled={isDisabled}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  </div>
                  {/* D2: Variable validation indicators */}
                  {(() => {
                    const vars = extractVariables(m.value);
                    if (vars.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1 pl-0">
                        {vars.map((v, vi) => {
                          const valid = isValidVariable(v.variable, previousSteps.length);
                          return (
                            <span
                              key={vi}
                              className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1 rounded ${
                                valid
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-red-500/10 text-red-500"
                              }`}
                              title={valid ? "Valid variable" : "Unknown variable — check spelling"}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${valid ? "bg-emerald-500" : "bg-red-500"}`} />
                              {v.variable}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plugin Configuration */}
        {configSchema?.properties && Object.keys(configSchema.properties).length > 0 ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Step Settings</Label>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <ConfigFormRenderer
                schema={configSchema}
                values={pluginConfig}
                onChange={setPluginConfig}
              />
            </div>
          </div>
        ) : null}

        {/* Error Handling & Timeout */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">On Error</Label>
            <Select
              value={onError}
              onValueChange={setOnError}
              disabled={isDisabled}
            >
              <SelectTrigger className="bg-muted border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stop">Stop everything</SelectItem>
                <SelectItem value="continue">Skip this step and continue</SelectItem>
                <SelectItem value="retry">Try again</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Max Retries</Label>
            <Input
              type="number"
              value={maxRetries}
              onChange={(e) => setMaxRetries(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              max={10}
              className="bg-muted border-border text-sm"
              disabled={isDisabled || onError !== "retry"}
            />
            {onError === "retry" && <p className="text-[10px] text-muted-foreground">How many times to retry before giving up</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Timeout</Label>
            <Input
              type="number"
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(Math.max(1, Math.min(300, parseInt(e.target.value) || 60)))}
              min={1}
              max={300}
              className="bg-muted border-border text-sm"
              disabled={isDisabled}
            />
            <p className="text-[10px] text-muted-foreground">Max seconds to wait for this step to finish</p>
          </div>
        </div>

        {/* Gateway Actions Toggle */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={gatewayActionsEnabled}
              onChange={(e) => setGatewayActionsEnabled(e.target.checked)}
              className="rounded"
              disabled={isDisabled}
              id="gateway-actions-toggle"
            />
            <Label htmlFor="gateway-actions-toggle" className="text-xs cursor-pointer">
              Allow this step to reply to users
            </Label>
          </div>
          <p className="text-[10px] text-muted-foreground pl-5">
            When off, the step only processes data. Turn on to let it send messages back to the chat.
          </p>
        </div>

        {/* Conditional Execution */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={conditionEnabled}
              onChange={(e) => setConditionEnabled(e.target.checked)}
              className="rounded"
              disabled={isDisabled}
              id="condition-toggle"
            />
            <Label htmlFor="condition-toggle" className="text-xs cursor-pointer">
              Only run this step if…
            </Label>
          </div>
          {conditionEnabled ? (
            <ConditionBuilder
              value={conditionExpr}
              onChange={setConditionExpr}
              previousSteps={previousSteps}
              isDisabled={isDisabled}
            />
          ) : null}
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || isDisabled}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save Step
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
