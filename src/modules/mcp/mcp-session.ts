/**
 * mcp-session.ts
 *
 * High-level helpers called from cursor-worker-runner.ts:
 *   initMCPServersForSession()  — called at session start
 *   teardownMCPServers()        — called at session end
 *   executeMCPTool()            — called in tool dispatch chain
 */

import { logger } from "@/lib/logger";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";
import {
    callMCPTool,
    callMCPToolSSE,
    killMCPServer,
    listMCPTools,
    listMCPToolsSSE,
    spawnMCPServer,
} from "./mcp-bridge-client";
import { getEnabledMCPServers, setMCPServerStatus } from "./mcp-config.service";
import {
    deregisterMCPHandles,
    findHandleForTool,
    getAllMCPTools,
    registerMCPHandles,
    type MCPHandle,
} from "./mcp-session-registry";

import type { MCPToolDefinition } from "./mcp-bridge-client";

const mcpLog = logger.child({ module: "mcp", service: "session" });

// ---------------------------------------------------------------------------
// Session init / teardown
// ---------------------------------------------------------------------------

/**
 * Load all enabled MCP server configs for the user, spawn/connect them,
 * and register the handles in the session registry.
 *
 * Returns the flat list of tool definitions discovered.
 */
export async function initMCPServersForSession(
  agentSessionId: string,
  userId: string,
  organizationId: string | null,
  client: BridgeClient | null,
): Promise<{ handles: MCPHandle[]; tools: MCPToolDefinition[] }> {
  const configs = await getEnabledMCPServers(userId, organizationId);
  if (configs.length === 0) {
    registerMCPHandles(agentSessionId, []);
    return { handles: [], tools: [] };
  }

  const handles: MCPHandle[] = [];

  for (const cfg of configs) {
    const serverSessionId = `${agentSessionId}__${cfg.id}`;
    try {
      if (cfg.transportType === "stdio") {
        if (!client) {
          mcpLog.warn({ mcpConfigId: cfg.id }, "No bridge client — skipping stdio MCP server");
          continue;
        }
        await spawnMCPServer(client, serverSessionId, cfg.config);
        const tools = await listMCPTools(client, serverSessionId);
        handles.push({
          mcpConfigId: cfg.id,
          serverSessionId,
          transportType: "stdio",
          tools,
        });
        await setMCPServerStatus(cfg.id, "connected");
        mcpLog.info(
          { mcpConfigId: cfg.id, toolCount: tools.length },
          "MCP stdio server ready",
        );
      } else {
        // SSE — no bridge needed
        const sseConfig = cfg.config as { transportType: "sse"; url: string; headers?: Record<string, string> };
        const tools = await listMCPToolsSSE(sseConfig.url, sseConfig.headers);
        handles.push({
          mcpConfigId: cfg.id,
          serverSessionId,
          transportType: "sse",
          tools,
          sseUrl: sseConfig.url,
          sseHeaders: sseConfig.headers,
        });
        await setMCPServerStatus(cfg.id, "connected");
        mcpLog.info(
          { mcpConfigId: cfg.id, toolCount: tools.length },
          "MCP SSE server ready",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      mcpLog.warn({ mcpConfigId: cfg.id, err: msg }, "Failed to init MCP server — skipping");
      await setMCPServerStatus(cfg.id, "error", msg);
    }
  }

  registerMCPHandles(agentSessionId, handles);
  const tools = getAllMCPTools(agentSessionId);
  return { handles, tools };
}

/**
 * Kill all stdio MCP servers for a session and clean up the registry.
 * Call this when the agent session ends or the SSE connection drops.
 */
export async function teardownMCPServers(
  agentSessionId: string,
  client: BridgeClient | null,
): Promise<void> {
  const { getMCPHandles } = await import("./mcp-session-registry");
  const activeHandles = getMCPHandles(agentSessionId);

  for (const handle of activeHandles) {
    if (handle.transportType === "stdio" && client) {
      try {
        await killMCPServer(client, handle.serverSessionId);
      } catch (err) {
        mcpLog.warn(
          { serverSessionId: handle.serverSessionId, err },
          "Error killing MCP server on teardown",
        );
      }
    }
    await setMCPServerStatus(handle.mcpConfigId, "disconnected").catch(() => {});
  }

  deregisterMCPHandles(agentSessionId);
  mcpLog.debug({ agentSessionId }, "MCP servers torn down");
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

/**
 * Execute an MCP tool call if the tool belongs to a registered MCP server.
 * Returns null if the tool is not an MCP tool (so the caller can fall through).
 */
export async function executeMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  agentSessionId: string,
  client: BridgeClient | null,
): Promise<string | null> {
  const handle = findHandleForTool(agentSessionId, toolName);
  if (!handle) return null;

  try {
    let result: string;
    if (handle.transportType === "stdio") {
      if (!client) throw new Error("No bridge client for stdio MCP tool");
      result = await callMCPTool(client, handle.serverSessionId, toolName, args);
    } else {
      result = await callMCPToolSSE(
        handle.sseUrl!,
        toolName,
        args,
        handle.sseHeaders,
      );
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mcpLog.warn({ toolName, err: msg }, "MCP tool call failed");
    return `[MCP Error] ${msg}`;
  }
}
