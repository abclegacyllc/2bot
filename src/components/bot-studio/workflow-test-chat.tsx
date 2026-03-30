"use client";

/**
 * Workflow Test Chat
 *
 * Minimal inline chat panel for testing BOT_MESSAGE workflows.
 * User types a message → triggers workflow → shows last step output as reply.
 *
 * @module components/bot-studio/workflow-test-chat
 */

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkflowRunDetail, triggerWorkflow } from "@/lib/api-client";
import { Loader2, MessageSquare, Send } from "lucide-react";

// ===========================================
// Types
// ===========================================

interface WorkflowTestChatProps {
  workflowId: string;
  token: string | null;
  organizationId?: string;
  /** Called when a run starts, with the runId — parent can use for overlay updates */
  onRunStarted?: (runId: string) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  durationMs?: number;
}

// ===========================================
// Component
// ===========================================

export function WorkflowTestChat({
  workflowId,
  token,
  organizationId,
  onRunStarted,
}: WorkflowTestChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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
    setTimeout(scrollToBottom, 50);

    try {
      // Trigger workflow with a simulated BOT_MESSAGE payload
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

      // Poll for completion (max 30 attempts = 45s)
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
            // Use the last step's output as the bot reply
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
            setTimeout(scrollToBottom, 50);
            return;
          }

          if (normalizedStatus === "FAILED") {
            setMessages((prev) => [
              ...prev,
              { id: `err-${Date.now()}`, role: "bot", text: `Error: ${runData.error ?? "Workflow failed"}` },
            ]);
            setTimeout(scrollToBottom, 50);
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
          setTimeout(scrollToBottom, 50);
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
  }, [input, isSending, workflowId, organizationId, token, onRunStarted, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

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
            onClick={() => setMessages([])}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {/* Messages area */}
      <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto min-h-[60px]">
        {messages.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/50 text-center py-3 italic">
            Type a message to test your workflow
          </p>
        ) : null}
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
        <div ref={messagesEndRef} />
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
