/**
 * mcp-bridge-client.ts
 *
 * Platform-side helpers that wrap BridgeClient.send() for MCP operations.
 * All stdio operations are proxied through the workspace container bridge.
 * SSE operations connect directly from the platform (no bridge needed).
 */

import { logger } from "@/lib/logger";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";
import type { MCPTransportConfig } from "./mcp-config.service";

const mcpLog = logger.child({ module: "mcp", service: "bridge-client" });

// ---------------------------------------------------------------------------
// Types shared with bridge-agent mcp-manager.js
// ---------------------------------------------------------------------------

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// ---------------------------------------------------------------------------
// stdio transport — via workspace container bridge
// ---------------------------------------------------------------------------

/** Spawn a new MCP stdio server inside the workspace container. */
export async function spawnMCPServer(
  client: BridgeClient,
  serverSessionId: string,
  config: MCPTransportConfig,
): Promise<void> {
  if (config.transportType !== "stdio") {
    throw new Error("spawnMCPServer only supports stdio transport");
  }

  await client.send<{ ok: boolean }>("mcp.spawn", {
    serverSessionId,
    command: config.command,
    args: config.args,
    env: config.env ?? {},
  });

  mcpLog.debug({ serverSessionId }, "MCP stdio server spawned");
}

/** List tools from a running MCP stdio server. */
export async function listMCPTools(
  client: BridgeClient,
  serverSessionId: string,
): Promise<MCPToolDefinition[]> {
  const tools = await client.send<MCPToolDefinition[]>("mcp.listTools", {
    serverSessionId,
  });
  return tools ?? [];
}

/** Call a tool on a running MCP stdio server. Returns the text result. */
export async function callMCPTool(
  client: BridgeClient,
  serverSessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.send<string>("mcp.call", {
    serverSessionId,
    name: toolName,
    args,
  });
  return result ?? "";
}

/** Kill a running MCP stdio server process. */
export async function killMCPServer(
  client: BridgeClient,
  serverSessionId: string,
): Promise<void> {
  await client.send<{ ok: boolean }>("mcp.kill", { serverSessionId });
  mcpLog.debug({ serverSessionId }, "MCP stdio server killed");
}

// ---------------------------------------------------------------------------
// SSE transport — direct HTTP connection (no bridge)
// ---------------------------------------------------------------------------

/**
 * List tools from an MCP SSE server via a JSON-RPC HTTP POST.
 * SSE servers expose a standard JSON-RPC endpoint alongside the SSE stream.
 */
export async function listMCPToolsSSE(
  url: string,
  headers: Record<string, string> = {},
): Promise<MCPToolDefinition[]> {
  const rpcUrl = url.replace(/\/sse\/?$/, "/rpc");

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`MCP SSE listTools failed: HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { tools?: MCPToolDefinition[] } };
  return json.result?.tools ?? [];
}

/**
 * Call a tool on an MCP SSE server via a JSON-RPC HTTP POST.
 */
export async function callMCPToolSSE(
  url: string,
  toolName: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<string> {
  const rpcUrl = url.replace(/\/sse\/?$/, "/rpc");

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`MCP SSE callTool failed: HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    error?: { message?: string };
  };

  if (json.error) throw new Error(`MCP SSE error: ${json.error.message ?? "unknown"}`);

  const result = json.result;
  if (result?.isError) {
    const errText = (result.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
    throw new Error(`MCP tool error: ${errText || "unknown"}`);
  }

  return (result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}
