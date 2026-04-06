"use client";

/**
 * Workflow Test Chat
 *
 * Minimal chat for testing BOT_MESSAGE workflows.
 * User types a message → triggers workflow → shows last step output as reply.
 *
 * Supports two variants:
 * - `"panel"` (default): Full panel with header, messages, and input.
 * - `"inline"`: Compact input row that fits inside a tab bar.
 *    Messages appear in a dropdown above the input.
 *
 * @module components/bot-studio/workflow-test-chat
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkflowRunDetail, triggerWorkflow } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, Send, X } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowTestChatProps {
  workflowId: string;
  token: string | null;
  organizationId?: string;
  /** Called when a run starts, with the runId — parent can use for overlay updates */
  onRunStarted?: (runId: string) => void;
  /** "panel" = full card layout, "inline" = compact row for tab bar */
  variant?: "panel" | "inline";
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  durationMs?: number;
}

// ===========================================
// Shared hook — chat logic
// ===========================================

function useTestChat({
  workflowId,
  token,
  organizationId,
  onRunStarted,
}: Pick<WorkflowTestChatProps, "workflowId" | "token" | "organizationId" | "onRunStarted">) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    try {
      const result = await triggerWorkflow(
        workflowId,
        {
          params: {
            message: {
              text,
              from: "Test User",
              chat_id: "test-chat",
            },
          },
        },
        { organizationId },
        token ?? undefined
      );

      if (!result.success || !result.data?.runId) {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, role: "bot", text: result.error?.message ?? "Failed to trigger workflow" },
        ]);
        return;
      }

      const runId = result.data.runId;
      onRunStarted?.(runId);

      let attempts = 0;
      const poll = async () => {
        attempts++;
        const detail = await getWorkflowRunDetail(
          workflowId,
          runId,
          { organizationId },
          token ?? undefined
        );

        if (detail.success && detail.data) {
          const runData = detail.data;
          const normalizedStatus = runData.status?.toUpperCase();
          if (normalizedStatus === "COMPLETED") {
            const lastStepRun = runData.stepRuns
              .filter((sr) => sr.status?.toUpperCase() === "COMPLETED")
              .sort((a, b) => b.stepOrder - a.stepOrder)[0];

            const outputText = lastStepRun?.output
              ? typeof lastStepRun.output === "string"
                ? lastStepRun.output
                : JSON.stringify(lastStepRun.output, null, 2)
              : "(No output)";

            setMessages((prev) => [
              ...prev,
              {
                id: `bot-${Date.now()}`,
                role: "bot",
                text: outputText,
                durationMs: runData.durationMs ?? undefined,
              },
            ]);
            return;
          }

          if (normalizedStatus === "FAILED") {
            setMessages((prev) => [
              ...prev,
              { id: `err-${Date.now()}`, role: "bot", text: `Error: ${runData.error ?? "Workflow failed"}` },
            ]);
            return;
          }
        }

        if (attempts < 30) {
          setTimeout(poll, 1500);
        } else {
          setMessages((prev) => [
            ...prev,
            { id: `timeout-${Date.now()}`, role: "bot", text: "Timeout — check run history for results" },
          ]);
        }
      };

      setTimeout(poll, 1000);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "bot", text: "Failed to send message" },
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, workflowId, organizationId, token, onRunStarted]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    input,
    setInput,
    isSending,
    inputRef,
    handleSend,
    handleKeyDown,
    clearMessages,
  };
}

// ===========================================
// Messages list (shared between both variants)
// ===========================================

function MessageList({
  messages,
  className,
}: {
  messages: ChatMessage[];
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className={cn("space-y-2 overflow-y-auto", className)}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${
              msg.role === "user"
                ? "bg-emerald-500/20 text-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
            {msg.durationMs !== undefined ? (
              <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                {msg.durationMs < 1000 ? `${msg.durationMs}ms` : `${(msg.durationMs / 1000).toFixed(1)}s`}
              </p>
            ) : null}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ===========================================
// Panel variant (original full layout)
// ===========================================

function PanelVariant(props: WorkflowTestChatProps) {
  const { messages, input, setInput, isSending, inputRef, handleSend, handleKeyDown, clearMessages } = useTestChat(props);

  return (
    <div className="rounded-lg border border-border bg-background/50">
      {/* Chat header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-medium text-foreground">Test Chat</span>
        {messages.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] ml-auto"
            onClick={clearMessages}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {/* Messages area */}
      <div className="px-3 py-2 max-h-48 min-h-[60px]">
        {messages.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 text-center py-3 italic">
            Type a message to test your workflow
          </p>
        ) : (
          <MessageList
            messages={messages}
            className="max-h-44"
          />
        )}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="h-8 text-xs"
          disabled={isSending}
        />
        <Button
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={handleSend}
          disabled={isSending || !input.trim()}
        >
          {isSending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ===========================================
// Inline variant (compact, for tab bar)
// ===========================================

function InlineVariant(props: WorkflowTestChatProps) {
  const { messages, input, setInput, isSending, inputRef, handleSend, handleKeyDown: _handleKeyDown, clearMessages } = useTestChat(props);
  const [showMessages, setShowMessages] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSendAndShow = useCallback(() => {
    if (input.trim()) setShowMessages(true);
    handleSend();
  }, [input, handleSend]);

  const handleKeyDownAndShow = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendAndShow();
      }
    },
    [handleSendAndShow]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMessages) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMessages(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMessages]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* Message count badge — click toggles dropdown */}
      {messages.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 relative"
          onClick={() => setShowMessages((v) => !v)}
          title="Toggle chat history"
        >
          <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white">
            {messages.length}
          </span>
        </Button>
      ) : (
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}

      {/* Compact input */}
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDownAndShow}
        onFocus={() => { if (messages.length > 0) setShowMessages(true); }}
        placeholder="Type a message..."
        className="h-7 w-52 text-xs bg-background/60"
        disabled={isSending}
      />
      <Button
        size="sm"
        className="h-7 w-7 p-0 shrink-0 bg-emerald-600 hover:bg-emerald-700"
        onClick={handleSendAndShow}
        disabled={isSending || !input.trim()}
      >
        {isSending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Send className="h-3 w-3" />
        )}
      </Button>

      {/* Messages dropdown */}
      {showMessages && messages.length > 0 ? (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
            <span className="text-[10px] font-medium text-muted-foreground">
              Test Chat ({messages.length})
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px]"
                onClick={clearMessages}
              >
                Clear
              </Button>
              <button
                onClick={() => setShowMessages(false)}
                className="rounded p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
          <MessageList
            messages={messages}
            className="max-h-60 px-3 py-2"
          />
        </div>
      ) : null}
    </div>
  );
}

// ===========================================
// Exported component
// ===========================================

export function WorkflowTestChat(props: WorkflowTestChatProps) {
  const { variant = "panel" } = props;
  return variant === "inline" ? <InlineVariant {...props} /> : <PanelVariant {...props} />;
}
