/**
 * 2Bot AI Agent Chat
 *
 * Full agent chat UI for the workspace page.
 * Streams SSE events from POST /api/2bot-ai/agent and renders:
 * - AI text (markdown)
 * - Tool call cards (expand/collapse with input/output)
 * - Session metrics header (iterations, tool calls, credits, time)
 *
 * Manages conversation history so the agent has context across turns.
 *
 * @module components/2bot-ai-assistant/agent-chat
 */

"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/shared/config/urls";
import {
    Bot,
    Check,
    FileEdit,
    FilePlus,
    FileText,
    FileX,
    Loader2,
    RotateCcw,
    Send,
    Square,
    Terminal,
    Trash2,
    User,
    Wrench,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AgentSessionHeader, type AgentSessionMetrics } from "./agent-session-header";
import { AgentToolCallCard, type ToolCallData } from "./agent-tool-call";

// ===========================================
// Types
// ===========================================

/** A message block in the agent chat timeline */
interface AgentChatBlock {
  id: string;
  type: "user" | "assistant-text" | "tool-calls" | "system" | "file-action" | "approval";
  content?: string;
  toolCalls?: ToolCallData[];
  fileAction?: FileActionData;
  approval?: ApprovalData;
  timestamp: Date;
}

/** Tracked file modification from AI */
interface FileActionData {
  actionId: string;
  type: "created" | "modified" | "deleted" | "renamed";
  path: string;
  newPath?: string;
  originalPreview: string | null;
  newPreview: string | null;
  toolCallId: string;
  showDiff: boolean;
}

/** Pending approval request for terminal commands */
interface ApprovalData {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "timeout";
  timeoutAt?: number;
}

/** Model info from the catalog for agent-compatible models */
interface AgentModelOption {
  id: string;
  displayName: string;
  tier: string;
}

interface AgentChatProps {
  workspaceId: string;
  organizationId?: string;
}

// ===========================================
// Helpers
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

let blockIdCounter = 0;
function nextBlockId(): string {
  return `block-${Date.now()}-${++blockIdCounter}`;
}

// ===========================================
// Component
// ===========================================

export function AgentChat({ workspaceId, organizationId }: AgentChatProps) {
  // State
  const [blocks, setBlocks] = useState<AgentChatBlock[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<AgentModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("2bot-ai-code-pro");
  const [metrics, setMetrics] = useState<AgentSessionMetrics>({
    status: "idle",
    iterationCount: 0,
    toolCallCount: 0,
    creditsUsed: 0,
    elapsedMs: 0,
  });

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);



  // Session tracking for restore
  const sessionIdRef = useRef<string | null>(null);
  const [fileActions, setFileActions] = useState<FileActionData[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    restoredCount: number;
    conflictCount: number;
    details: Array<{ path: string; status: string; message?: string }>;
  } | null>(null);

  // Conversation history for multi-turn context
  const conversationRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  // ===========================================
  // Auto-scroll to bottom on new content
  // ===========================================
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      // Find the viewport inside the ScrollArea
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [blocks, scrollToBottom]);

  // ===========================================
  // Fetch agent-compatible models from catalog
  // ===========================================
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch(apiUrl("/2bot-ai/catalog"), {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const json = await res.json();
        const catalog = json.data?.models ?? json.models ?? [];

        // Filter to code-generation models only (agent uses dedicated code-gen capability)
        const agentModels: AgentModelOption[] = catalog
          .filter(
            (m: Record<string, unknown>) =>
              m.capability === "code-generation" &&
              m.isAvailable !== false
          )
          .map((m: Record<string, unknown>) => ({
            id: m.id as string,
            displayName: m.displayName as string || m.id as string,
            tier: m.tier as string || "pro",
          }));

        setModels(agentModels);

        // Default to pro tier if available
        const firstModel = agentModels[0];
        if (firstModel && !agentModels.find((m) => m.id === selectedModel)) {
          setSelectedModel(firstModel.id);
        }
      } catch {
        // Silently fail — models will use the hardcoded default
      }
    }

    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================
  // Elapsed time ticker
  // ===========================================
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        elapsedMs: Date.now() - startTimeRef.current,
      }));
    }, 250);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // ===========================================
  // Cancel running session
  // ===========================================
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    stopTimer();
    setMetrics((prev) => ({ ...prev, status: "cancelled" }));
  }, [stopTimer]);

  // ===========================================
  // Send prompt to the agent
  // ===========================================
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isRunning) return;

    setInput("");
    setError(null);

    // Add user message block
    const userBlock: AgentChatBlock = {
      id: nextBlockId(),
      type: "user",
      content: prompt,
      timestamp: new Date(),
    };
    setBlocks((prev) => [...prev, userBlock]);

    // Track conversation history
    conversationRef.current.push({ role: "user", content: prompt });

    // Reset metrics for new session
    setMetrics({
      status: "running",
      iterationCount: 0,
      toolCallCount: 0,
      creditsUsed: 0,
      elapsedMs: 0,
    });

    setIsRunning(true);
    startTimer();

    // We'll build assistant text + tool calls as separate blocks
    let currentTextBlockId: string | null = null;
    let currentToolBlockId: string | null = null;
    let fullAssistantText = "";

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch(apiUrl("/2bot-ai/agent"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          workspaceId,
          organizationId,
          conversationHistory:
            conversationRef.current.length > 2
              ? conversationRef.current.slice(0, -1) // Exclude current prompt (sent as prompt field)
              : undefined,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.error?.message || errJson?.error || `Agent error ${res.status}`
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      // Process a single SSE event
      const processEvent = (eventData: string) => {
        const trimmed = eventData.trim();
        if (!trimmed.startsWith("data: ")) return;
        const data = trimmed.slice(6);
        if (!data) return;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data);
        } catch {
          return; // Skip invalid JSON (partial chunks)
        }

        const type = parsed.type as string;

        switch (type) {
          case "iteration_start": {
            setMetrics((prev) => ({
              ...prev,
              iterationCount: parsed.iteration as number,
              creditsUsed: (parsed.creditsUsed as number) ?? prev.creditsUsed,
              toolCallCount: (parsed.toolCallsCount as number) ?? prev.toolCallCount,
            }));
            // New iteration — reset the current tool block so new tools get a fresh group
            currentToolBlockId = null;
            break;
          }

          case "text_delta": {
            const delta = parsed.delta as string;
            fullAssistantText += delta;

            if (!currentTextBlockId) {
              // Start a new text block
              const id = nextBlockId();
              currentTextBlockId = id;
              setBlocks((prev) => [
                ...prev,
                {
                  id,
                  type: "assistant-text",
                  content: delta,
                  timestamp: new Date(),
                },
              ]);
            } else {
              // Append to existing text block
              const textId = currentTextBlockId;
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === textId
                    ? { ...b, content: (b.content ?? "") + delta }
                    : b
                )
              );
            }
            break;
          }

          case "tool_use_start": {
            const tc = parsed.toolCall as { id: string; name: string; input: Record<string, unknown> };

            // If we were building text, close that block for now
            currentTextBlockId = null;

            const toolCallData: ToolCallData = {
              id: tc.id,
              name: tc.name,
              input: tc.input,
              status: "pending",
            };

            if (!currentToolBlockId) {
              // Start a new tool block
              const id = nextBlockId();
              currentToolBlockId = id;
              setBlocks((prev) => [
                ...prev,
                {
                  id,
                  type: "tool-calls",
                  toolCalls: [toolCallData],
                  timestamp: new Date(),
                },
              ]);
            } else {
              // Append tool to existing group
              const toolId = currentToolBlockId;
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === toolId
                    ? { ...b, toolCalls: [...(b.toolCalls ?? []), toolCallData] }
                    : b
                )
              );
            }
            break;
          }

          case "tool_use_result": {
            const resultId = parsed.toolCallId as string;
            const output = parsed.output as string;
            const isError = parsed.isError as boolean;
            const durationMs = parsed.durationMs as number;

            setMetrics((prev) => ({
              ...prev,
              toolCallCount: prev.toolCallCount + 1,
            }));

            // Update the matching tool call in any block
            setBlocks((prev) =>
              prev.map((b) =>
                b.type === "tool-calls" && b.toolCalls?.some((tc) => tc.id === resultId)
                  ? {
                      ...b,
                      toolCalls: b.toolCalls?.map((tc) =>
                        tc.id === resultId
                          ? { ...tc, output, isError, durationMs, status: "done" as const }
                          : tc
                      ),
                    }
                  : b
              )
            );
            break;
          }

          case "done": {
            const finalCredits = parsed.totalCreditsUsed as number;
            const finalIterations = parsed.iterationCount as number;
            const finalToolCalls = parsed.toolCallsCount as number;
            const finalDurationMs = parsed.durationMs as number;
            const tokenUsage = parsed.totalTokenUsage as { inputTokens: number; outputTokens: number } | undefined;

            // Capture session ID for restore functionality
            if (parsed.sessionId) {
              sessionIdRef.current = parsed.sessionId as string;
            }

            stopTimer();
            setMetrics({
              status: (parsed.status as AgentSessionMetrics["status"]) || "completed",
              iterationCount: finalIterations,
              toolCallCount: finalToolCalls,
              creditsUsed: finalCredits,
              elapsedMs: finalDurationMs,
              tokenUsage,
            });

            // Track assistant response in conversation history
            if (fullAssistantText) {
              conversationRef.current.push({ role: "assistant", content: fullAssistantText });
            }
            break;
          }

          case "file_action": {
            const action = parsed.action as {
              id: string;
              type: "created" | "modified" | "deleted" | "renamed";
              path: string;
              newPath?: string;
              originalPreview: string | null;
              newPreview: string | null;
              toolCallId: string;
            };

            const fileActionData: FileActionData = {
              actionId: action.id,
              type: action.type,
              path: action.path,
              newPath: action.newPath,
              originalPreview: action.originalPreview,
              newPreview: action.newPreview,
              toolCallId: action.toolCallId,
              showDiff: false,
            };

            // Track for session-level restore
            setFileActions((prev) => [...prev, fileActionData]);

            // Add file action block to chat
            setBlocks((prev) => [
              ...prev,
              {
                id: nextBlockId(),
                type: "file-action",
                fileAction: fileActionData,
                timestamp: new Date(),
              },
            ]);
            break;
          }

          case "approval_request": {
            const approvalData: ApprovalData = {
              sessionId: parsed.sessionId as string,
              toolCallId: parsed.toolCallId as string,
              toolName: parsed.toolName as string,
              input: parsed.input as Record<string, unknown>,
              status: "pending",
              timeoutAt: Date.now() + 30_000,
            };

            // Also capture session ID
            sessionIdRef.current = parsed.sessionId as string;

            setBlocks((prev) => [
              ...prev,
              {
                id: nextBlockId(),
                type: "approval",
                approval: approvalData,
                timestamp: new Date(),
              },
            ]);
            break;
          }

          case "ui_action": {
            // Cursor events are handled independently via the cursor brain.
            // Agent chat no longer controls the visual cursor.
            break;
          }

          case "error": {
            const errMsg = parsed.error as string;
            stopTimer();
            setError(errMsg);
            setMetrics((prev) => ({
              ...prev,
              status: "error",
              creditsUsed: (parsed.creditsUsed as number) ?? prev.creditsUsed,
            }));

            // Show error as a system block
            setBlocks((prev) => [
              ...prev,
              {
                id: nextBlockId(),
                type: "system",
                content: `Error: ${errMsg}`,
                timestamp: new Date(),
              },
            ]);
            break;
          }
        }
      };

      // Read the SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processEvent(line);
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        processEvent(buffer);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setBlocks((prev) => [
          ...prev,
          {
            id: nextBlockId(),
            type: "system",
            content: "Session cancelled by user.",
            timestamp: new Date(),
          },
        ]);
      } else {
        const errMsg = err instanceof Error ? err.message : "An error occurred";
        setError(errMsg);
        setBlocks((prev) => [
          ...prev,
          {
            id: nextBlockId(),
            type: "system",
            content: `Error: ${errMsg}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsRunning(false);
      stopTimer();
      abortRef.current = null;
    }
  }, [input, isRunning, selectedModel, workspaceId, organizationId, startTimer, stopTimer]);

  // ===========================================
  // Approve / reject a terminal command
  // ===========================================
  const handleApproval = useCallback(async (sessionId: string, toolCallId: string, approved: boolean) => {
    try {
      const res = await fetch(apiUrl("/2bot-ai/agent/approve"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ sessionId, toolCallId, approved }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        console.error("Approval failed:", json?.error?.message || res.statusText);
      }

      // Update the approval block status
      setBlocks((prev) =>
        prev.map((b) =>
          b.type === "approval" && b.approval?.toolCallId === toolCallId
            ? { ...b, approval: { ...b.approval!, status: approved ? "approved" : "rejected" } }
            : b
        )
      );
    } catch (err) {
      console.error("Approval request failed:", err);
    }
  }, []);

  // ===========================================
  // Toggle diff view for a file action
  // ===========================================
  const toggleDiff = useCallback((actionId: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.type === "file-action" && b.fileAction?.actionId === actionId
          ? { ...b, fileAction: { ...b.fileAction!, showDiff: !b.fileAction!.showDiff } }
          : b
      )
    );
  }, []);

  // ===========================================
  // Restore all AI changes from the session
  // ===========================================
  const handleRestore = useCallback(async (force = false) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || isRestoring) return;

    setIsRestoring(true);
    setRestoreResult(null);

    try {
      const res = await fetch(apiUrl("/2bot-ai/agent/restore"), {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ sessionId, force }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setRestoreResult(json.data);
        setBlocks((prev) => [
          ...prev,
          {
            id: nextBlockId(),
            type: "system",
            content: `Restored ${json.data.restoredCount} file(s)${json.data.conflictCount > 0 ? ` (${json.data.conflictCount} conflict(s))` : ""}.`,
            timestamp: new Date(),
          },
        ]);
      } else {
        setError(json.error?.message || "Restore failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring]);

  // ===========================================
  // Clear conversation
  // ===========================================
  const handleClear = useCallback(() => {
    if (isRunning) return;
    setBlocks([]);
    setError(null);
    conversationRef.current = [];
    sessionIdRef.current = null;
    setFileActions([]);
    setRestoreResult(null);
    setMetrics({
      status: "idle",
      iterationCount: 0,
      toolCallCount: 0,
      creditsUsed: 0,
      elapsedMs: 0,
    });
  }, [isRunning]);

  // ===========================================
  // Keyboard submit
  // ===========================================
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ===========================================
  // Render
  // ===========================================
  return (
    <div className="flex flex-col h-full">
      {/* Session metrics header */}
      {metrics.status !== "idle" && <AgentSessionHeader metrics={metrics} />}

      {/* Chat timeline */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-purple-600/10 border border-purple-600/20 mb-3">
                <Bot className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-sm font-medium mb-1">AI Agent</h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                Describe a task and the AI agent will autonomously read files,
                run commands, and make changes in your workspace.
              </p>
            </div>
          )}

          {blocks.map((block) => (
            <div key={block.id}>
              {/* User message */}
              {block.type === "user" && (
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                    <AvatarFallback className="bg-blue-600/20 text-blue-400 text-[10px]">
                      <User className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground mb-0.5">You</p>
                    <div className="text-sm text-foreground whitespace-pre-wrap">
                      {block.content}
                    </div>
                  </div>
                </div>
              )}

              {/* Assistant text */}
              {block.type === "assistant-text" && (
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                    <AvatarFallback className="bg-purple-600/20 text-purple-400 text-[10px]">
                      <Bot className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 prose prose-sm prose-invert max-w-none text-sm">
                    <ReactMarkdown>{block.content ?? ""}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Tool call group */}
              {block.type === "tool-calls" && block.toolCalls && (
                <div className="ml-8 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                    <Wrench className="h-3 w-3" />
                    <span>Tool Calls</span>
                    <Badge variant="outline" className="text-[10px] px-1 h-3.5 ml-1">
                      {block.toolCalls.length}
                    </Badge>
                  </div>
                  {block.toolCalls.map((tc) => (
                    <AgentToolCallCard key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}

              {/* System message (errors, cancellation) */}
              {block.type === "system" && (
                <div className="ml-8 text-xs text-muted-foreground italic py-1">
                  {block.content}
                </div>
              )}

              {/* File action (AI modified a file — tracked for restore) */}
              {block.type === "file-action" && block.fileAction && (
                <div className="ml-8">
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border/50 bg-card/50 cursor-pointer hover:bg-card/80 transition-colors"
                    onClick={() => toggleDiff(block.fileAction!.actionId)}
                  >
                    {block.fileAction.type === "created" && <FilePlus className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
                    {block.fileAction.type === "modified" && <FileEdit className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />}
                    {block.fileAction.type === "deleted" && <FileX className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                    {block.fileAction.type === "renamed" && <FileText className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />}
                    <span className="text-xs font-mono text-foreground truncate">
                      {block.fileAction.path}
                      {block.fileAction.type === "renamed" && block.fileAction.newPath && (
                        <span className="text-muted-foreground"> → {block.fileAction.newPath}</span>
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1 h-3.5 ml-auto flex-shrink-0",
                        block.fileAction.type === "created" && "border-green-500/50 text-green-400",
                        block.fileAction.type === "modified" && "border-yellow-500/50 text-yellow-400",
                        block.fileAction.type === "deleted" && "border-red-500/50 text-red-400",
                        block.fileAction.type === "renamed" && "border-blue-500/50 text-blue-400",
                      )}
                    >
                      {block.fileAction.type}
                    </Badge>
                  </div>

                  {/* Expandable before/after diff */}
                  {block.fileAction.showDiff && (
                    <div className="mt-1 border border-border/50 rounded overflow-hidden">
                      {/* Before */}
                      {block.fileAction.originalPreview !== null && (
                        <div>
                          <div className="px-2 py-0.5 bg-red-950/30 text-[10px] text-red-400 font-medium border-b border-border/30">
                            Before
                          </div>
                          <pre className="px-2 py-1 text-[11px] text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto bg-red-950/10">
                            {block.fileAction.originalPreview}
                          </pre>
                        </div>
                      )}
                      {block.fileAction.type === "created" && (
                        <div className="px-2 py-0.5 bg-muted/30 text-[10px] text-muted-foreground italic">
                          File did not exist
                        </div>
                      )}

                      {/* After */}
                      {block.fileAction.newPreview !== null && (
                        <div>
                          <div className="px-2 py-0.5 bg-green-950/30 text-[10px] text-green-400 font-medium border-b border-border/30">
                            After
                          </div>
                          <pre className="px-2 py-1 text-[11px] text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto bg-green-950/10">
                            {block.fileAction.newPreview}
                          </pre>
                        </div>
                      )}
                      {block.fileAction.type === "deleted" && (
                        <div className="px-2 py-0.5 bg-muted/30 text-[10px] text-muted-foreground italic">
                          File was deleted
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Approval request (terminal command waiting for user) */}
              {block.type === "approval" && block.approval && (
                <div className="ml-8">
                  <div className={cn(
                    "border rounded px-3 py-2 space-y-2",
                    block.approval.status === "pending" && "border-amber-500/50 bg-amber-950/20",
                    block.approval.status === "approved" && "border-green-500/30 bg-green-950/10",
                    block.approval.status === "rejected" && "border-red-500/30 bg-red-950/10",
                    block.approval.status === "timeout" && "border-muted bg-muted/10",
                  )}>
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-xs font-medium">
                        {block.approval.toolName === "run_command" && "Terminal Command"}
                        {block.approval.toolName === "install_package" && "Install Package"}
                        {block.approval.toolName === "git_clone" && "Git Clone"}
                      </span>
                      {block.approval.status !== "pending" && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1 h-3.5 ml-auto",
                            block.approval.status === "approved" && "border-green-500/50 text-green-400",
                            block.approval.status === "rejected" && "border-red-500/50 text-red-400",
                            block.approval.status === "timeout" && "border-muted text-muted-foreground",
                          )}
                        >
                          {block.approval.status}
                        </Badge>
                      )}
                    </div>

                    {/* Show the command/input */}
                    <pre className="text-[11px] text-foreground bg-black/30 rounded px-2 py-1 overflow-x-auto font-mono">
                      {block.approval.toolName === "run_command"
                        ? (block.approval.input.command as string)
                        : block.approval.toolName === "install_package"
                          ? `npm install ${((block.approval.input.packages as string[]) || []).join(" ")}${block.approval.input.dev ? " --save-dev" : ""}`
                          : block.approval.toolName === "git_clone"
                            ? `git clone ${block.approval.input.url as string}${block.approval.input.targetDir ? ` ${block.approval.input.targetDir}` : ""}`
                            : JSON.stringify(block.approval.input, null, 2)
                      }
                    </pre>

                    {/* Approve/Reject buttons (only when pending) */}
                    {block.approval.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2 border-green-500/50 text-green-400 hover:bg-green-950/30"
                          onClick={() => handleApproval(block.approval!.sessionId, block.approval!.toolCallId, true)}
                        >
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2 border-red-500/50 text-red-400 hover:bg-red-950/30"
                          onClick={() => handleApproval(block.approval!.sessionId, block.approval!.toolCallId, false)}
                        >
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          Auto-rejects in 30s
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* AI Actions Summary (shown after session ends with file changes) */}
          {!isRunning && fileActions.length > 0 && metrics.status !== "idle" && (
            <div className="ml-8 border border-border/50 rounded p-2.5 bg-card/50 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium">AI Actions Summary</span>
                <Badge variant="outline" className="text-[10px] px-1 h-3.5 ml-auto border-purple-500/50 text-purple-400">
                  {fileActions.length} file{fileActions.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              <div className="space-y-0.5 text-[11px]">
                {fileActions.filter((a) => a.type === "created").length > 0 && (
                  <div className="flex items-center gap-1 text-green-400">
                    <FilePlus className="h-3 w-3" /> Created {fileActions.filter((a) => a.type === "created").length} file(s)
                  </div>
                )}
                {fileActions.filter((a) => a.type === "modified").length > 0 && (
                  <div className="flex items-center gap-1 text-yellow-400">
                    <FileEdit className="h-3 w-3" /> Modified {fileActions.filter((a) => a.type === "modified").length} file(s)
                  </div>
                )}
                {fileActions.filter((a) => a.type === "deleted").length > 0 && (
                  <div className="flex items-center gap-1 text-red-400">
                    <FileX className="h-3 w-3" /> Deleted {fileActions.filter((a) => a.type === "deleted").length} file(s)
                  </div>
                )}
                {fileActions.filter((a) => a.type === "renamed").length > 0 && (
                  <div className="flex items-center gap-1 text-blue-400">
                    <FileText className="h-3 w-3" /> Renamed {fileActions.filter((a) => a.type === "renamed").length} file(s)
                  </div>
                )}
              </div>

              {/* Restore button */}
              {!restoreResult && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full border-red-500/30 text-red-400 hover:bg-red-950/20"
                  onClick={() => handleRestore(false)}
                  disabled={isRestoring}
                >
                  {isRestoring ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Restoring...</>
                  ) : (
                    <><RotateCcw className="h-3 w-3 mr-1" /> Undo All AI Changes</>
                  )}
                </Button>
              )}

              {/* Restore result */}
              {restoreResult && (
                <div className="text-[11px] space-y-1">
                  <div className="text-green-400">
                    ✓ {restoreResult.restoredCount} file(s) restored
                  </div>
                  {restoreResult.conflictCount > 0 && (
                    <div className="space-y-0.5">
                      <div className="text-amber-400">
                        ⚠ {restoreResult.conflictCount} conflict(s) — files were modified after AI changes
                      </div>
                      {restoreResult.details
                        .filter((d) => d.status === "conflict")
                        .map((d, i) => (
                          <div key={i} className="text-muted-foreground pl-2">
                            {d.path}: {d.message}
                          </div>
                        ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-950/20"
                        onClick={() => handleRestore(true)}
                        disabled={isRestoring}
                      >
                        Force Restore Conflicts
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Streaming indicator */}
          {isRunning && (
            <div className="flex items-center gap-2 ml-8 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Agent is working...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border p-3 space-y-2">
        {/* Model selector + clear */}
        <div className="flex items-center gap-2">
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isRunning}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[160px]">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {models.length > 0 ? (
                models.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    <span className="flex items-center gap-1.5">
                      {m.displayName}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1 h-3.5",
                          m.tier === "ultra"
                            ? "border-yellow-500/50 text-yellow-400"
                            : "border-purple-500/50 text-purple-400"
                        )}
                      >
                        {m.tier}
                      </Badge>
                    </span>
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="2bot-ai-text-pro" className="text-xs">
                  2Bot Pro
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleClear}
                  disabled={isRunning || blocks.length === 0}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Clear conversation
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Error display */}
        {error && (
          <div className="text-xs text-red-400 bg-red-950/20 border border-red-500/20 rounded px-2 py-1.5">
            {error}
          </div>
        )}

        {/* Text input + send */}
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a task for the AI agent..."
            className="min-h-[60px] max-h-[120px] text-sm resize-none"
            disabled={isRunning}
          />
          <div className="flex flex-col gap-1">
            {isRunning ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-[60px] w-9 p-0"
                      onClick={handleCancel}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Cancel session
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-[60px] w-9 p-0 bg-purple-600 hover:bg-purple-700"
                      onClick={handleSend}
                      disabled={!input.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Send (Enter)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
