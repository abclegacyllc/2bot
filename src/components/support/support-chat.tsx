/**
 * Support Chat Component
 * 
 * AI-powered support chat with KB article context.
 * Supports multiple conversation sessions saved in browser localStorage.
 * This is SEPARATE from the 2Bot AI Chat widget.
 * 
 * @module components/support/support-chat
 */

"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/shared/config/urls";
import {
    BookOpen,
    ChevronLeft,
    Clock,
    Loader2,
    Mail,
    MessageSquarePlus,
    Send,
    TicketPlus,
    Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ===========================================
// Types
// ===========================================

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RelatedArticle {
  slug: string;
  title: string;
  excerpt: string | null;
}

interface SupportSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface SupportChatProps {
  authToken: string | null;
  userPlan: string;
  orgPlan?: string;
  canCreateTickets: boolean;
  onViewArticle?: (slug: string) => void;
  onCreateTicket?: () => void;
}

// ===========================================
// localStorage Helpers
// ===========================================

const STORAGE_KEY = "2bot-support-sessions";
const MAX_SESSIONS = 30;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadSessions(): SupportSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions: SupportSession[] = JSON.parse(raw);
    // Auto-cleanup old sessions
    const cutoff = Date.now() - MAX_AGE_MS;
    return sessions
      .filter((s) => s.updatedAt > cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

function saveSessions(sessions: SupportSession[]): void {
  try {
    const trimmed = sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function getSessionTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "New Conversation";
  const text = firstUserMsg.content.trim();
  return text.length > 50 ? text.slice(0, 47) + "..." : text;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ===========================================
// Component
// ===========================================

export function SupportChat({
  authToken,
  userPlan: _userPlan,
  orgPlan,
  canCreateTickets,
  onViewArticle,
  onCreateTicket,
}: SupportChatProps) {
  // Session state
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<RelatedArticle[]>([]);
  const [suggestTicket, setSuggestTicket] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    // Resume last active session if available
    if (loaded.length > 0 && loaded[0]) {
      setActiveSessionId(loaded[0].id);
      setMessages(loaded[0].messages);
    }
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Save current session to localStorage
  const saveCurrentSession = useCallback(
    (updatedMessages: ChatMessage[]) => {
      if (updatedMessages.length === 0) return;

      setSessions((prev) => {
        let updated: SupportSession[];

        if (activeSessionId) {
          // Update existing session
          const exists = prev.find((s) => s.id === activeSessionId);
          if (exists) {
            updated = prev.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    messages: updatedMessages,
                    title: getSessionTitle(updatedMessages),
                    updatedAt: Date.now(),
                  }
                : s
            );
          } else {
            // Session was deleted from another tab or doesn't exist, create new one
            updated = [
              {
                id: activeSessionId,
                title: getSessionTitle(updatedMessages),
                messages: updatedMessages,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              ...prev,
            ];
          }
        } else {
          // Create new session
          const newId = generateId();
          setActiveSessionId(newId);
          updated = [
            {
              id: newId,
              title: getSessionTitle(updatedMessages),
              messages: updatedMessages,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            ...prev,
          ];
        }

        saveSessions(updated);
        return updated;
      });
    },
    [activeSessionId]
  );

  // Start a new conversation
  const startNewSession = useCallback(() => {
    const newId = generateId();
    setActiveSessionId(newId);
    setMessages([]);
    setRelatedArticles([]);
    setSuggestTicket(false);
    setInput("");
    setShowHistory(false);
  }, []);

  // Load a session
  const loadSession = useCallback((session: SupportSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setRelatedArticles([]);
    setSuggestTicket(false);
    setShowHistory(false);
  }, []);

  // Delete a session
  const deleteSession = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSessions((prev) => {
        const updated = prev.filter((s) => s.id !== sessionId);
        saveSessions(updated);
        return updated;
      });
      // If we deleted the active session, start fresh
      if (sessionId === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
        setRelatedArticles([]);
        setSuggestTicket(false);
      }
    },
    [activeSessionId]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !authToken) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setRelatedArticles([]);
    setSuggestTicket(false);

    // Auto-create session on first message if needed
    if (!activeSessionId) {
      const newId = generateId();
      setActiveSessionId(newId);
    }

    try {
      const res = await fetch(apiUrl("/support/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
          conversationHistory: updatedMessages.slice(-20), // Last 20 messages for context
          orgPlan,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get support response");
      }

      const data = await res.json();
      if (data.success) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.data.reply,
        };
        const withReply = [...updatedMessages, assistantMessage];
        setMessages(withReply);
        setRelatedArticles(data.data.relatedArticles || []);
        setSuggestTicket(data.data.suggestTicket || false);
        saveCurrentSession(withReply);
      } else {
        throw new Error(data.error?.message || "Support error");
      }
    } catch {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content:
          "I'm sorry, I'm having trouble responding right now. Please try again or email support@2bot.org for immediate help.",
      };
      const withError = [...updatedMessages, errorMessage];
      setMessages(withError);
      saveCurrentSession(withError);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, authToken, messages, orgPlan, activeSessionId, saveCurrentSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Filter sessions that have at least 1 message (exclude empty)
  const historySessions = sessions.filter((s) => s.messages.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Session header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30">
        {showHistory ? (
          <button
            onClick={() => setShowHistory(false)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to chat
          </button>
        ) : (
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-3.5 w-3.5" />
            History{historySessions.length > 0 && ` (${historySessions.length})`}
          </button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={startNewSession}
          title="New conversation"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New Chat
        </Button>
      </div>

      {/* Session History List */}
      {showHistory ? (
        <ScrollArea className="flex-1 px-3 py-2">
          {historySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No conversation history yet.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {historySessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => loadSession(session)}
                  className={`w-full text-left rounded-md px-3 py-2.5 transition-colors group ${
                    session.id === activeSessionId
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-foreground">
                        {session.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {session.messages.length} messages · {formatTimeAgo(session.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      ) : (
        <>
          {/* Chat Messages */}
          <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                  <Mail className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  How can we help?
                </h3>
                <p className="text-xs text-muted-foreground max-w-[260px]">
                  Ask a question about 2Bot — gateways, plugins, billing, or
                  anything else.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading ? <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div> : null}

                {/* Related Articles */}
                {relatedArticles.length > 0 && !isLoading && (
                  <div className="border border-border rounded-lg p-3 bg-card">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      Related Articles
                    </p>
                    <div className="space-y-1.5">
                      {relatedArticles.map((article) => (
                        <button
                          key={article.slug}
                          onClick={() => onViewArticle?.(article.slug)}
                          className="w-full text-left text-xs text-blue-500 hover:text-blue-400 hover:underline block truncate"
                        >
                          {article.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggest Ticket or Email */}
                {suggestTicket && !isLoading ? <div className="border border-border rounded-lg p-3 bg-card">
                    {canCreateTickets ? (
                      <div className="flex items-center gap-2">
                        <TicketPlus className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">
                            Need more help?
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-blue-500"
                            onClick={onCreateTicket}
                          >
                            Create a support ticket →
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">
                            Need more help?
                          </p>
                          <a
                            href="mailto:support@2bot.org"
                            className="text-xs text-blue-500 hover:text-blue-400 hover:underline"
                          >
                            Email us at support@2bot.org →
                          </a>
                        </div>
                      </div>
                    )}
                  </div> : null}
              </div>
            )}
          </ScrollArea>

          {/* Input area */}
          <div className="border-t border-border p-3 shrink-0">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="min-h-[40px] max-h-[100px] resize-none text-sm"
                rows={1}
                disabled={isLoading}
              />
              <Button
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
