"use client";

import { useCallback, useState } from "react";

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
import {
  Loader2,
  Save,
  X,
  Zap,
} from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowTriggerEditorProps {
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  gatewayType: string;
  onSave: (data: { triggerType?: string; triggerConfig?: Record<string, unknown> }) => Promise<void>;
  onClose: () => void;
  isDisabled?: boolean;
}

const TRIGGER_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "BOT_MESSAGE", label: "When a message arrives", description: "Runs when any message is sent to your bot" },
  { value: "WEBHOOK", label: "When a webhook is called", description: "Runs when an external service sends data to a URL" },
  { value: "SCHEDULE", label: "On a schedule", description: "Runs at set times using a cron expression" },
  { value: "MANUAL", label: "Run manually", description: "Only runs when you click the Run button" },
];

// ===========================================
// Component
// ===========================================

export function WorkflowTriggerEditor({
  triggerType,
  triggerConfig,
  gatewayType,
  onSave,
  onClose,
  isDisabled,
}: WorkflowTriggerEditorProps) {
  const [type, setType] = useState(triggerType);
  const [textPattern, setTextPattern] = useState(
    (triggerConfig.textPattern as string) ?? ""
  );
  const [commandPrefix, setCommandPrefix] = useState(
    (triggerConfig.commandPrefix as string) ?? ""
  );
  const [cronExpr, setCronExpr] = useState(
    (triggerConfig.cron as string) ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const config: Record<string, unknown> = { ...triggerConfig };

      if (textPattern.trim()) config.textPattern = textPattern.trim();
      else delete config.textPattern;

      if (commandPrefix.trim()) config.commandPrefix = commandPrefix.trim();
      else delete config.commandPrefix;

      if (type === "SCHEDULE" && cronExpr.trim()) config.cron = cronExpr.trim();
      else delete config.cron;

      await onSave({ triggerType: type, triggerConfig: config });
    } finally {
      setIsSaving(false);
    }
  }, [type, textPattern, commandPrefix, cronExpr, triggerConfig, onSave]);

  const isBotMessage = type === "BOT_MESSAGE" || type.endsWith("_MESSAGE") || type.endsWith("_COMMAND");

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-foreground">
              Trigger Settings
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
        {/* Trigger type */}
        <div className="space-y-1.5">
          <Label className="text-xs">What starts this workflow?</Label>
          <Select
            value={type}
            onValueChange={setType}
            disabled={isDisabled}
          >
            <SelectTrigger className="bg-muted border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {TRIGGER_OPTIONS.find((o) => o.value === type)?.description
              ?? "Choose when this workflow should run"}
          </p>
        </div>

        {/* Message filters — only for bot message triggers */}
        {isBotMessage ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Only messages starting with (optional)</Label>
              <Input
                value={commandPrefix}
                onChange={(e) => setCommandPrefix(e.target.value)}
                placeholder="/help"
                className="bg-muted border-border text-sm"
                disabled={isDisabled}
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank to trigger on all messages, or enter a command prefix like <code className="bg-muted px-1 rounded">/weather</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Message text pattern (optional)</Label>
              <Input
                value={textPattern}
                onChange={(e) => setTextPattern(e.target.value)}
                placeholder="hello.*"
                className="bg-muted border-border text-sm font-mono"
                disabled={isDisabled}
              />
              <p className="text-[10px] text-muted-foreground">
                A regex pattern to match against the message text. Only matching messages will trigger the workflow.
              </p>
            </div>
          </>
        ) : null}

        {/* Schedule config */}
        {type === "SCHEDULE" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Cron expression</Label>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 */5 * * *"
              className="bg-muted border-border text-sm font-mono"
              disabled={isDisabled}
            />
            <p className="text-[10px] text-muted-foreground">
              Standard cron syntax. Example: <code className="bg-muted px-1 rounded">0 */5 * * *</code> = every 5 minutes
            </p>
          </div>
        ) : null}

        {/* Webhook info */}
        {type === "WEBHOOK" ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs text-foreground font-medium mb-1">Webhook URL</p>
            <p className="text-[10px] text-muted-foreground">
              After activating this workflow, a unique webhook URL will be generated. External services can POST data to that URL to trigger this workflow.
            </p>
          </div>
        ) : null}

        {/* Gateway context */}
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="text-[10px] text-muted-foreground">
            This trigger is connected to your <span className="font-medium text-foreground">{gatewayType.replace(/_/g, " ").toLowerCase()}</span>. Messages from that platform will start this workflow.
          </p>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || isDisabled}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Save Trigger
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
