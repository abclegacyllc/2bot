/**
 * Preflight Result Dialog
 *
 * Shows the results of a workflow preflight check (Test → Quick mode and the
 * up-front phase of Standard / Deep modes).
 *
 * Renders:
 *   - Overall status (ok / errors / warnings)
 *   - Workflow-level errors and warnings
 *   - Per-step problems with file + line references when available
 *   - Action buttons:  "Run anyway"  |  "Close"
 *
 * @module components/bot-studio/preflight-result-dialog
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { PreflightReport, PreflightProblem } from "@/lib/api-client";
import { AlertCircle, AlertTriangle, CheckCircle2, FileWarning, Info, Loader2, Wrench, Zap } from "lucide-react";
import { useState } from "react";

// ===========================================
// Types
// ===========================================

interface PreflightResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: PreflightReport | null;
  /** Called when the user clicks "Run anyway" — caller decides which mode to run */
  onProceed?: () => void;
  /** When true, show the Run-anyway button regardless of report.ok */
  alwaysAllowProceed?: boolean;
  /** Visible label for the proceed button (defaults to "Run anyway") */
  proceedLabel?: string;
  /**
   * Called when the user clicks "Fix with AI".
   * Receives a ready-made prompt summarising the errors.
   */
  onFixWithAI?: (prompt: string) => void;
  /**
   * Called when the user clicks the per-problem "Fix" button.
   * Receives the fixId and any extra fixContext from the problem.
   * Should call applyPreflightFix() and re-run preflight on success.
   */
  onApplyFix?: (
    fixId: string,
    fixContext: Record<string, unknown>
  ) => Promise<void>;
}

// ===========================================
// Problem row
// ===========================================

function ProblemIcon({ severity }: { severity: PreflightProblem["severity"] }) {
  if (severity === "error") return <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
}

function ProblemRow({
  problem,
  onFix,
  isFixing,
}: {
  problem: PreflightProblem;
  onFix?: (fixId: string, fixContext: Record<string, unknown>) => void;
  isFixing?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/40">
      <ProblemIcon severity={problem.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground break-words">{problem.message}</p>
        {problem.file ? (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {problem.file}
            {problem.line !== undefined ? `:${problem.line}` : ""}
            {problem.column !== undefined ? `:${problem.column}` : ""}
          </p>
        ) : null}
      </div>
      {problem.fixId && onFix ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isFixing}
          onClick={() => onFix(problem.fixId!, problem.fixContext ?? {})}
          className="h-6 px-2 text-[10px] gap-1 shrink-0 border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400"
        >
          {isFixing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Zap className="h-3 w-3" />
          )}
          {isFixing ? "Fixing…" : "Fix"}
        </Button>
      ) : null}
    </div>
  );
}

// ===========================================
// Main component
// ===========================================

export function PreflightResultDialog({
  open,
  onOpenChange,
  report,
  onProceed,
  alwaysAllowProceed = false,
  proceedLabel = "Run anyway",
  onFixWithAI,
  onApplyFix,
}: PreflightResultDialogProps) {
  const [fixingId, setFixingId] = useState<string | null>(null);

  if (!report) return null;

  const stepsWithProblems = report.steps.filter((s) => s.problems.length > 0);
  const totalProblems = report.summary.errorCount + report.summary.warningCount;
  const canProceed = onProceed && (report.ok || alwaysAllowProceed);
  const hasErrors = report.summary.errorCount > 0;

  async function handleFix(fixId: string, fixContext: Record<string, unknown>) {
    if (!onApplyFix || fixingId) return;
    setFixingId(fixId);
    try {
      await onApplyFix(fixId, fixContext);
    } finally {
      setFixingId(null);
    }
  }

  const fixHandler = onApplyFix ? handleFix : undefined;

  /** Build a concise AI prompt from the preflight errors. */
  function buildFixPrompt(): string {
    const lines: string[] = [
      `Fix the plugin errors found by the workflow preflight check for "${report!.workflowName}":`,
      "",
    ];
    // Workflow-level errors
    for (const p of report!.errors) {
      lines.push(`- ${p.message}`);
    }
    // Step-level errors
    for (const step of stepsWithProblems) {
      const stepErrors = step.problems.filter((p) => p.severity === "error");
      if (stepErrors.length === 0) continue;
      lines.push(`\nStep ${step.stepOrder} "${step.stepName}" (${step.entryFile ?? step.pluginSlug}):`);
      for (const p of stepErrors) {
        const loc = p.line !== undefined ? `:${p.line}` : "";
        lines.push(`  - ${p.message}${loc ? ` (line${loc})` : ""}`);
      }
    }
    lines.push("");
    lines.push("Create any missing files or fix the require paths so all modules resolve correctly.");
    return lines.join("\n");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {report.ok ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span>Preflight passed</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-500" />
                <span>Preflight found issues</span>
              </>
            )}
            <Badge variant="outline" className="ml-2 text-[10px]">
              {report.durationMs}ms
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {report.summary.stepsEnabled} of {report.summary.stepsTotal} steps enabled •{" "}
            {report.summary.errorCount} error{report.summary.errorCount === 1 ? "" : "s"} •{" "}
            {report.summary.warningCount} warning{report.summary.warningCount === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          {totalProblems === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/70 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No issues detected. Everything looks ready to run.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Workflow-level problems */}
              {report.errors.length + report.warnings.length > 0 ? (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Workflow
                  </h4>
                  <div className="rounded border border-border/40 divide-y divide-border/40">
                    {report.errors.map((p, i) => (
                      <ProblemRow
                        key={`e${i}`}
                        problem={p}
                        onFix={fixHandler}
                        isFixing={fixingId === p.fixId}
                      />
                    ))}
                    {report.warnings.map((p, i) => (
                      <ProblemRow
                        key={`w${i}`}
                        problem={p}
                        onFix={fixHandler}
                        isFixing={fixingId === p.fixId}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Per-step problems */}
              {stepsWithProblems.length > 0 ? (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Steps
                  </h4>
                  <div className="space-y-2">
                    {stepsWithProblems.map((step) => (
                      <div key={step.stepId} className="rounded border border-border/40">
                        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 bg-muted/30">
                          <FileWarning className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">
                            Step {step.stepOrder}: {step.stepName}
                          </span>
                          {step.bridgeSkipped ? (
                            <Badge variant="outline" className="text-[9px] ml-auto">
                              workspace offline
                            </Badge>
                          ) : null}
                          {step.bridgeChecked ? (
                            <Badge variant="outline" className="text-[9px] ml-auto bg-emerald-500/10 border-emerald-500/30">
                              checked
                            </Badge>
                          ) : null}
                        </div>
                        <div className="divide-y divide-border/40">
                          {step.problems.map((p, i) => (
                            <ProblemRow
                              key={i}
                              problem={p}
                              onFix={fixHandler}
                              isFixing={fixingId === p.fixId}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-2">
          {hasErrors && onFixWithAI ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onFixWithAI(buildFixPrompt());
              }}
              className="text-xs gap-1.5 mr-auto border-purple-500/40 text-purple-400 hover:text-purple-300 hover:border-purple-400"
            >
              <Wrench className="h-3.5 w-3.5" />
              Fix with AI
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
          {canProceed ? (
            <Button
              variant={report.ok ? "default" : "destructive"}
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onProceed?.();
              }}
              className="text-xs"
            >
              {proceedLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
