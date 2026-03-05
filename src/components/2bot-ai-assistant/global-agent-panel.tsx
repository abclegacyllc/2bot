"use client";

/**
 * Global AI Agent Panel
 *
 * Floating button + slide-over panel that provides access to the
 * 2Bot AI Agent from ANY dashboard page. The previous approach
 * embedded the agent only in the workspace page — this makes it
 * available globally with a single click.
 *
 * Architecture:
 *   - FAB (floating action button) in bottom-right corner
 *   - Slide-over panel with the full AgentChat component
 *   - Auto-fetches the workspace ID on mount so the agent
 *     can talk to the workspace container from any page
 *
 * @module components/2bot-ai-assistant/global-agent-panel
 */

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/shared/config/urls";
import {
    Bot,
    Loader2,
    Maximize2,
    Minimize2,
    Sparkles,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentChat } from "./agent-chat";

// ===========================================
// Helpers
// ===========================================

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWorkspaceId(
  organizationId?: string,
): Promise<string | null> {
  try {
    const orgParam = organizationId
      ? `?organizationId=${organizationId}`
      : "";
    const res = await fetch(apiUrl(`/workspace/status${orgParam}`), {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = "data" in json ? json.data : json;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// ===========================================
// Component
// ===========================================

export function GlobalAgentPanel() {
  const { context } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(false);
  const fetchedRef = useRef(false);

  const isOrgContext = context.type === "organization";
  const orgId = isOrgContext ? context.organizationId : undefined;

  // Fetch workspace ID when panel opens (lazy — only on first open per org)
  const ensureWorkspaceId = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoadingWs(true);
    const id = await fetchWorkspaceId(orgId);
    setWorkspaceId(id);
    setLoadingWs(false);
  }, [orgId]);

  // Reset fetch flag when org context changes so next open re-fetches
  useEffect(() => {
    fetchedRef.current = false;
  }, [orgId]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    ensureWorkspaceId();
  }, [ensureWorkspaceId]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setExpanded(false);
  }, []);

  // Panel width classes
  const panelWidth = expanded ? "w-[700px]" : "w-[420px]";

  return (
    <>
      {/* FAB — floating action button (bottom-right) */}
      {!open ? (
        <button
          onClick={handleOpen}
          data-ai-target="global-agent-fab"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50 hover:scale-105 transition-all duration-200 group"
          title="Open 2Bot AI Agent"
        >
          <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" />
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
        </button>
      ) : null}

      {/* Slide-over backdrop (mobile) */}
      {open ? (
        <div
          className="fixed inset-0 bg-black/30 z-[60] lg:bg-transparent lg:pointer-events-none"
          onClick={handleClose}
        />
      ) : null}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-full z-[61] flex flex-col bg-card border-l border-border shadow-2xl transition-all duration-300 ease-out ${panelWidth} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-br from-purple-600 to-blue-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                2Bot AI Agent
              </h2>
              <p className="text-[10px] text-muted-foreground leading-none">
                {workspaceId
                  ? "Connected to workspace"
                  : "No workspace running"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? "Shrink panel" : "Expand panel"}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleClose}
              title="Close AI Agent"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loadingWs ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Connecting to workspace...</p>
            </div>
          ) : !workspaceId ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  No Workspace Running
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Start your workspace first, then the AI agent can help you
                  write code, manage plugins, and configure gateways.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchedRef.current = false;
                  ensureWorkspaceId();
                }}
              >
                Retry Connection
              </Button>
            </div>
          ) : (
            <AgentChat
              workspaceId={workspaceId}
              organizationId={orgId}
            />
          )}
        </div>
      </div>
    </>
  );
}
