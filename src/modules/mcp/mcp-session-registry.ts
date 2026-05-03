/**
 * mcp-session-registry.ts
 *
 * In-memory registry of active MCP server handles per agent session.
 * Created at session start, torn down when the session ends.
 *
 * Key: agentSessionId (the cursor session id)
 * Value: array of MCPHandle — one per enabled MCPServerConfig
 */

import type { MCPToolDefinition } from "./mcp-bridge-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPHandle {
  /** DB id of the MCPServerConfig row */
  mcpConfigId: string;
  /** Unique id passed to bridge agent (scoped to agent session + config) */
  serverSessionId: string;
  /** Transport type determines how tool calls are routed */
  transportType: "stdio" | "sse";
  /** Tools discovered at spawn time via tools/list */
  tools: MCPToolDefinition[];
  /** For SSE: the server URL (no bridge needed). Undefined for stdio. */
  sseUrl?: string;
  /** For SSE: optional headers. Undefined for stdio. */
  sseHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Registry (module-level singleton — lives for the lifetime of the process)
// ---------------------------------------------------------------------------

const registry = new Map<string, MCPHandle[]>();

/** Store handles for an agent session. Replaces any existing entry. */
export function registerMCPHandles(agentSessionId: string, handles: MCPHandle[]): void {
  registry.set(agentSessionId, handles);
}

/** Get all handles for an agent session. Returns empty array if not found. */
export function getMCPHandles(agentSessionId: string): MCPHandle[] {
  return registry.get(agentSessionId) ?? [];
}

/** Get a specific handle by serverSessionId within an agent session. */
export function getMCPHandle(
  agentSessionId: string,
  serverSessionId: string,
): MCPHandle | undefined {
  return registry.get(agentSessionId)?.find((h) => h.serverSessionId === serverSessionId);
}

/** Remove all handles for an agent session (call on session end). */
export function deregisterMCPHandles(agentSessionId: string): void {
  registry.delete(agentSessionId);
}

/** Collect all tools from all handles for an agent session (flat list). */
export function getAllMCPTools(agentSessionId: string): MCPToolDefinition[] {
  return getMCPHandles(agentSessionId).flatMap((h) => h.tools);
}

/** Find which handle owns a given tool name. */
export function findHandleForTool(
  agentSessionId: string,
  toolName: string,
): MCPHandle | undefined {
  return getMCPHandles(agentSessionId).find((h) =>
    h.tools.some((t) => t.name === toolName),
  );
}
