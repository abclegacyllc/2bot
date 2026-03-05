/**
 * Cursor Worker Runner — Multi-Worker Agentic Loop
 *
 * Generic streaming agent loop that supports both Cursor Assistant and
 * Cursor Coder workers. Each worker has focused tools, system prompts,
 * and iteration limits. Workers can hand off to each other and ask
 * the user questions mid-stream.
 *
 * Architecture:
 *   POST /api/cursor/worker-stream
 *     → routeToWorker(message) picks initial worker
 *     → runWorkerStream() yields CursorAgentEvent
 *     → SSE → cursor-panel.tsx → mapAgentEventToActions() → cursor-provider
 *
 *   POST /api/cursor/worker-answer
 *     → resolveUserAnswer(sessionId, answer)
 *     → unblocks the paused generator
 *
 * @module modules/cursor/cursor-worker-runner
 */

import crypto from "crypto";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  checkSessionLimits,
  truncateToolOutput,
  validateToolCallArgs,
} from "@/modules/2bot-ai-agent/agent-safety";
import * as agentSessionService from "@/modules/2bot-ai-agent/agent-session.service";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";
import type { TextGenerationMessage, ToolDefinition } from "@/modules/2bot-ai-provider/types";
import { bridgeClientManager } from "@/modules/workspace";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

import type {
  CursorAgentEvent,
  ToolStartMeta,
} from "./cursor-agent.types";
import { getWorkerTools } from "./cursor-worker-tools";
import type { CursorWorkerType, WorkerPromptContext } from "./cursor-workers";
import {
  WORKER_META,
  buildAssistantSystemPrompt,
  buildCoderSystemPrompt,
  routeToWorker,
} from "./cursor-workers";

const workerLog = logger.child({ module: "cursor", capability: "worker" });

// ===========================================
// Public Types
// ===========================================

/** Request to start a worker stream */
export interface WorkerStreamRequest {
  /** The user's message */
  message: string;
  /** User ID for billing + workspace access */
  userId: string;
  /** Org scope (null for personal) */
  organizationId: string | null;
  /** Optional: override worker type (skip heuristic) */
  workerType?: CursorWorkerType;
  /** Optional: plugin context for coding tasks */
  pluginSlug?: string;
  pluginName?: string;
  mode?: "create" | "edit";
}

// ===========================================
// Ask-User Answer Mechanism
// ===========================================

interface PendingAnswer {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

/** In-memory map of sessionId → pending answer resolver */
const pendingAnswers = new Map<string, PendingAnswer>();

/** Wait for the user to answer a question. Rejects after timeout. */
function waitForUserAnswer(sessionId: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAnswers.delete(sessionId);
      reject(new Error("User did not respond within the time limit"));
    }, timeoutMs);
    pendingAnswers.set(sessionId, { resolve, reject, timeout });
  });
}

/**
 * Resolve a pending ask_user question with the user's answer.
 * Called from the POST /api/cursor/worker-answer route.
 */
export function resolveUserAnswer(sessionId: string, answer: string): boolean {
  const pending = pendingAnswers.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve(answer);
    pendingAnswers.delete(sessionId);
    return true;
  }
  return false;
}

/** Cancel any pending answer (e.g., when the SSE connection closes) */
function cancelPendingAnswer(sessionId: string): void {
  const pending = pendingAnswers.get(sessionId);
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error("Session cancelled"));
    pendingAnswers.delete(sessionId);
  }
}

// ===========================================
// Plugin Context Extraction (from natural language)
// ===========================================

/**
 * Extract plugin slug, name, and mode from the user's message.
 *
 * When the frontend routes directly to Coder (e.g., "edit my echo-bot"),
 * the request won't have pluginSlug/mode. This heuristic extracts them
 * so the Coder gets the right system prompt (edit vs create workflow)
 * and knows which plugin directory to target.
 */
function extractPluginContext(message: string): {
  slug?: string;
  name?: string;
  mode?: "create" | "edit";
} {
  const lower = message.toLowerCase();

  // Detect mode from keywords
  let mode: "create" | "edit" | undefined;
  if (/\b(edit|change|modify|fix|improve|update|refactor|tweak|adjust|check|audit|review|analy[zs]e)\b/i.test(lower)) {
    mode = "edit";
  } else if (/\b(create|build|make|write|develop|new)\b.*\bplugin\b/i.test(lower)) {
    mode = "create";
  }

  // Try to extract a plugin name/slug
  // Patterns: "edit my echo-bot", "fix the weather-plugin", "improve quiz bot code",
  //           "edit echo-bot plugin", "my echo-bot plugin"
  let slug: string | undefined;
  let name: string | undefined;

  // "edit/fix/improve <name> plugin" or "edit plugin <name>"
  const namedMatch = message.match(
    /\b(?:edit|change|modify|fix|improve|update|check|audit|review|analy[zs]e|refactor)\b[\s]+(?:the\s+|my\s+)?([a-z0-9][\w-]*(?:\s+[a-z0-9][\w-]*){0,3})(?:\s+plugin)?/i
  );
  if (namedMatch?.[1]) {
    const raw = namedMatch[1].trim();
    // Don't match very generic words
    const generic = /^(a|the|my|this|that|some|all|code|plugin|plugins|it|bot)$/i;
    if (!generic.test(raw)) {
      name = raw;
      slug = raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }
  }

  return { slug, name, mode };
}

// ===========================================
// Bridge Client Helper
// ===========================================

async function getBridgeClient(
  userId: string,
  organizationId: string | null,
): Promise<{ client: BridgeClient; workspaceId: string } | null> {
  const container = await prisma.workspaceContainer.findFirst({
    where: {
      userId,
      organizationId: organizationId ?? null,
      status: "RUNNING",
    },
    select: { id: true, bridgePort: true, bridgeAuthToken: true },
  });
  if (!container) return null;

  const existing = bridgeClientManager.getExistingClient(container.id);
  if (existing) return { client: existing, workspaceId: container.id };

  if (!container.bridgePort || !container.bridgeAuthToken) return null;

  try {
    const { decrypt } = await import("@/lib/encryption");
    const authToken = container.bridgeAuthToken.startsWith("v1:")
      ? decrypt(container.bridgeAuthToken)
      : container.bridgeAuthToken;
    const client = await bridgeClientManager.getClient(
      container.id,
      container.bridgePort,
      authToken,
    );
    return { client, workspaceId: container.id };
  } catch {
    return null;
  }
}

// ===========================================
// Retry Helper
// ===========================================

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message?.toLowerCase() || "";
      const isTransient = msg.includes("timeout") || msg.includes("econnreset") ||
        msg.includes("socket") || msg.includes("disconnected") || msg.includes("econnrefused");
      if (!isTransient || attempt >= MAX_RETRIES) break;
      workerLog.warn({ attempt: attempt + 1, label, error: msg }, "Retrying transient error");
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

// ===========================================
// Tool Start Meta Builder
// ===========================================

function buildToolStartMeta(toolName: string, args: Record<string, unknown>): ToolStartMeta {
  switch (toolName) {
    case "read_file":
      return { kind: "read_file", path: (args.path as string) || "" };
    case "write_file":
      return { kind: "write_file", path: (args.path as string) || "", bytes: ((args.content as string) || "").length };
    case "list_files":
      return { kind: "list_files", path: (args.path as string) || "/" };
    case "create_directory":
      return { kind: "create_directory", path: (args.path as string) || "" };
    case "delete_file":
      return { kind: "delete_file", path: (args.path as string) || "" };
    case "run_command":
      return { kind: "run_command", command: (args.command as string) || "" };
    case "search_files":
      return { kind: "search_files", pattern: (args.pattern as string) || "" };
    case "list_gateways":
      return { kind: "list_gateways" };
    case "list_user_plugins":
      return { kind: "list_user_plugins" };
    case "create_plugin_record":
      return { kind: "create_plugin_record", name: (args.name as string) || "" };
    case "update_plugin_record":
      return { kind: "update_plugin_record", name: (args.name as string) || "" };
    case "restart_plugin":
      return { kind: "restart_plugin", slug: (args.slug as string) || "" };
    case "finish":
      return { kind: "finish", summary: (args.summary as string) || "" };
    case "check_credits":
      return { kind: "check_credits" };
    case "check_billing":
      return { kind: "check_billing" };
    case "check_usage":
      return { kind: "check_usage" };
    case "create_gateway":
      return { kind: "create_gateway", name: (args.name as string) || "" };
    case "delete_gateway":
      return { kind: "delete_gateway", name: (args.name as string) || (args.gatewayId as string) || "" };
    case "install_plugin":
      return { kind: "install_plugin", slug: (args.slug as string) || "" };
    case "uninstall_plugin":
      return { kind: "uninstall_plugin", name: (args.name as string) || "" };
    case "toggle_plugin":
      return { kind: "toggle_plugin", name: (args.name as string) || "", enable: !!args.enable };
    case "start_workspace":
      return { kind: "start_workspace" };
    case "navigate_page":
      return { kind: "navigate_page", path: (args.path as string) || "" };
    case "ask_user":
      return { kind: "ask_user", question: (args.question as string) || "" };
    case "hand_off_to_coder":
    case "hand_off_to_assistant":
      return {
        kind: "hand_off",
        targetWorker: toolName === "hand_off_to_coder" ? "coder" : "assistant",
        context: (args.task as string) || (args.context as string) || "",
      };
    default:
      return { kind: "unknown", tool: toolName };
  }
}

// ===========================================
// Tool Execution — Shared Platform Tools
// ===========================================

interface ToolExecResult {
  result: string;
  finished?: boolean;
  finishData?: { entry?: string; configSchema?: Record<string, unknown>; configDefaults?: Record<string, unknown>; summary?: string; pluginId?: string };
  handOff?: { workerType: CursorWorkerType; context: string; pluginSlug?: string; pluginName?: string; mode?: "create" | "edit" };
}

/** Execute platform tools shared by both workers */
async function executeSharedTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string; organizationId: string | null },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "list_gateways": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const gateways = await gatewayService.findByUser(svcCtx);
        const summary = gateways.map((g) =>
          `- ${g.name} (${g.type}, ${g.status}) [ID: ${g.id}]`,
        ).join("\n");
        return { result: summary || "(no gateways configured)" };
      } catch (err) {
        return { result: `Error listing gateways: ${(err as Error).message}` };
      }
    }
    case "list_user_plugins": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        const plugins = await pluginService.getUserPlugins(svcCtx);
        const summary = plugins.map((p) =>
          `- ${p.pluginName} (slug: ${p.pluginSlug}, enabled: ${p.isEnabled}) [pluginId: ${p.pluginId}, userPluginId: ${p.id}]`,
        ).join("\n");
        return { result: summary || "(no plugins installed)" };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }
    default:
      return null; // Not a shared tool
  }
}

// ===========================================
// Tool Execution — Assistant-Only Tools
// ===========================================

async function executeAssistantTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId: string; organizationId: string | null },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "check_credits": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        return {
          result: `Credit balance: ${balance.balance} credits remaining (Monthly used: ${balance.monthlyUsed}, Plan limit: ${balance.planLimit})`,
        };
      } catch (err) {
        return { result: `Error checking credits: ${(err as Error).message}` };
      }
    }

    case "check_billing": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        // Get user plan info from DB
        const user = await prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { plan: true, email: true },
        });
        return {
          result: `Plan: ${user?.plan ?? "FREE"}, Credits: ${balance.balance} remaining, Monthly used: ${balance.monthlyUsed}, Plan limit: ${balance.planLimit}`,
        };
      } catch (err) {
        return { result: `Error checking billing: ${(err as Error).message}` };
      }
    }

    case "check_usage": {
      try {
        const { twoBotAICreditService } = await import("@/modules/credits/2bot-ai-credit.service");
        const balance = await twoBotAICreditService.getBalance(ctx.userId);
        return {
          result: `Usage: ${balance.monthlyUsed} credits used this period out of ${balance.planLimit} limit. Remaining: ${balance.balance}. Lifetime total: ${balance.lifetime}`,
        };
      } catch (err) {
        return { result: `Error checking usage: ${(err as Error).message}` };
      }
    }

    case "create_gateway": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const gwName = (args.name as string) || "My Bot";
        const gwType = ((args.type as string) || "TELEGRAM_BOT") as "TELEGRAM_BOT" | "AI" | "CUSTOM_GATEWAY";

        type CredentialTypes = import("@/modules/gateway/gateway.types").GatewayCredentials; // eslint-disable-line @typescript-eslint/consistent-type-imports
        let credentials: CredentialTypes;

        if (gwType === "TELEGRAM_BOT") {
          const botToken = args.botToken as string;
          if (!botToken) return { result: "Error: botToken is required. Use ask_user to collect it first." };
          credentials = { botToken };
        } else if (gwType === "AI") {
          const apiKey = args.apiKey as string;
          if (!apiKey) return { result: "Error: apiKey is required. Use ask_user to collect it first." };
          const provider = (args.provider || "openai") as import("@/modules/gateway/gateway.types").AIProvider; // eslint-disable-line @typescript-eslint/consistent-type-imports
          credentials = { provider, apiKey };
        } else {
          credentials = {} as CredentialTypes;
        }

        const gateway = await gatewayService.create(svcCtx, {
          name: gwName,
          type: gwType,
          credentials,
        });

        return {
          result: `Gateway "${gateway.name}" (${gateway.type}) created successfully! [ID: ${gateway.id}, Status: ${gateway.status}]`,
        };
      } catch (err) {
        return { result: `Error creating gateway: ${(err as Error).message}` };
      }
    }

    case "delete_gateway": {
      try {
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const gatewayId = args.gatewayId as string | undefined;
        const gwName = args.name as string | undefined;

        if (gatewayId) {
          await gatewayService.delete(svcCtx, gatewayId);
          return { result: `Gateway ${gatewayId} deleted.` };
        } else if (gwName) {
          const gateways = await gatewayService.findByUser(svcCtx);
          const match = gateways.find((g) => g.name.toLowerCase().includes(gwName.toLowerCase()));
          if (!match) return { result: `No gateway found matching "${gwName}"` };
          await gatewayService.delete(svcCtx, match.id);
          return { result: `Gateway "${match.name}" deleted.` };
        }
        return { result: "Error: provide gatewayId or name to delete." };
      } catch (err) {
        return { result: `Error deleting gateway: ${(err as Error).message}` };
      }
    }

    case "install_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { gatewayService } = await import("@/modules/gateway");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const slug = args.slug as string;
        let gatewayId = args.gatewayId as string | undefined;

        // Auto-select gateway if not provided
        if (!gatewayId) {
          const userGateways = await gatewayService.findByUser(svcCtx);
          if (userGateways.length > 0) {
            const telegram = userGateways.find((g) => g.type === "TELEGRAM_BOT" && g.status === "CONNECTED")
              || userGateways.find((g) => g.type === "TELEGRAM_BOT")
              || userGateways[0];
            gatewayId = telegram?.id;
          }
        }

        // Fuzzy-match slug
        const searchResults = await pluginService.getAvailablePlugins({ search: slug, userId: ctx.userId });
        let resolvedSlug = slug;
        if (searchResults.length > 0) {
          const exact = searchResults.find((p) => p.slug === slug);
          if (!exact && searchResults[0]) {
            resolvedSlug = searchResults[0].slug;
          }
        }

        const installed = await pluginService.installPlugin(svcCtx, {
          slug: resolvedSlug,
          gatewayId,
        });

        return {
          result: `Plugin "${installed.pluginName}" installed! [ID: ${installed.id}, slug: ${installed.pluginSlug}]`,
        };
      } catch (err) {
        return { result: `Error installing plugin: ${(err as Error).message}` };
      }
    }

    case "uninstall_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const pluginId = args.pluginId as string | undefined;
        const pluginName = args.name as string | undefined;

        if (pluginId) {
          await pluginService.deleteCustomPlugin(svcCtx, pluginId);
          return { result: `Plugin ${pluginId} deleted.` };
        } else if (pluginName) {
          const userPlugins = await pluginService.getUserPlugins(svcCtx);
          const match = userPlugins.find(
            (p) => p.pluginName.toLowerCase().includes(pluginName.toLowerCase())
              || p.pluginSlug === pluginName.toLowerCase().replace(/\s+/g, "-"),
          );
          if (!match) return { result: `No plugin found matching "${pluginName}"` };
          await pluginService.uninstallPlugin(svcCtx, match.id);
          return { result: `Plugin "${match.pluginName}" uninstalled.` };
        }
        return { result: "Error: provide pluginId or name to uninstall." };
      } catch (err) {
        return { result: `Error uninstalling plugin: ${(err as Error).message}` };
      }
    }

    case "toggle_plugin": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const name = args.name as string;
        const enable = args.enable as boolean;
        const userPlugins = await pluginService.getUserPlugins(svcCtx);
        const match = userPlugins.find(
          (p) => p.pluginName.toLowerCase().includes(name.toLowerCase())
            || p.pluginSlug === name.toLowerCase().replace(/\s+/g, "-"),
        );
        if (!match) return { result: `No plugin found matching "${name}"` };

        await pluginService.togglePlugin(svcCtx, match.id, enable);
        return { result: `Plugin "${match.pluginName}" ${enable ? "started" : "stopped"}.` };
      } catch (err) {
        return { result: `Error toggling plugin: ${(err as Error).message}` };
      }
    }

    case "start_workspace": {
      try {
        const { workspaceService } = await import("@/modules/workspace");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const wsStatus = await workspaceService.getStatus(svcCtx);
        if (!wsStatus) {
          const result = await workspaceService.createWorkspace(svcCtx);
          return {
            result: result.success
              ? `Workspace created and starting! [Container: ${result.containerId}]`
              : `Workspace creation issue: ${result.message}`,
          };
        } else if (wsStatus.status === "RUNNING") {
          return { result: "Workspace is already running." };
        } else {
          const result = await workspaceService.startWorkspace(svcCtx, wsStatus.id);
          return {
            result: result.success
              ? "Workspace started!"
              : `Error starting workspace: ${result.message}`,
          };
        }
      } catch (err) {
        return { result: `Error with workspace: ${(err as Error).message}` };
      }
    }

    case "navigate_page": {
      // Navigation is handled on the frontend via the event.
      // We just return success so the LLM knows it worked.
      const path = (args.path as string) || "/";
      return { result: `Navigated to ${path}` };
    }

    case "hand_off_to_coder": {
      return {
        result: "Handing off to Cursor Coder...",
        handOff: {
          workerType: "coder",
          context: (args.task as string) || "",
          pluginSlug: args.pluginSlug as string | undefined,
          pluginName: args.pluginName as string | undefined,
          mode: args.mode as "create" | "edit" | undefined,
        },
      };
    }

    default:
      return null; // Not an assistant tool
  }
}

// ===========================================
// Tool Execution — Coder-Only Tools
// ===========================================

const TOOL_TIMEOUT_MS = 30_000;

async function executeCoderTool(
  toolName: string,
  args: Record<string, unknown>,
  client: BridgeClient,
  pluginDir: string,
  writtenFiles: Record<string, string>,
  ctx: { userId: string; organizationId: string | null },
): Promise<ToolExecResult | null> {
  switch (toolName) {
    case "read_file": {
      const path = args.path as string;
      try {
        const result = await withRetry(
          () => client.fileRead(path) as Promise<{ content?: string }>,
          `read_file:${path}`,
        );
        return { result: truncateToolOutput(result?.content ?? "(empty file)") };
      } catch {
        return { result: `Error: file not found or not readable: ${path}` };
      }
    }

    case "write_file": {
      const path = args.path as string;
      const content = args.content as string;
      try {
        await withRetry(() => client.fileWrite(path, content, true), `write_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        writtenFiles[relativePath] = content;
        return { result: `Written: ${path} (${content.length} bytes)` };
      } catch (err) {
        return { result: `Error writing ${path}: ${(err as Error).message}` };
      }
    }

    case "list_files": {
      const path = (args.path as string) || "/";
      const recursive = (args.recursive as boolean) || false;
      try {
        const result = await withRetry(() => client.fileList(path, recursive), `list_files:${path}`);
        return { result: truncateToolOutput(JSON.stringify(result, null, 2)) };
      } catch {
        return { result: `Error listing ${path}: directory not found` };
      }
    }

    case "create_directory": {
      const path = args.path as string;
      try {
        await withRetry(() => client.fileMkdir(path), `create_directory:${path}`);
        return { result: `Created directory: ${path}` };
      } catch {
        return { result: `Error creating directory: ${path}` };
      }
    }

    case "delete_file": {
      const path = args.path as string;
      try {
        await withRetry(() => client.fileDelete(path), `delete_file:${path}`);
        const relativePath = path.startsWith(pluginDir + "/")
          ? path.slice(pluginDir.length + 1)
          : path;
        delete writtenFiles[relativePath];
        return { result: `Deleted: ${path}` };
      } catch {
        return { result: `Error deleting ${path}: file not found` };
      }
    }

    case "run_command": {
      const command = args.command as string;
      const cwd = (args.cwd as string) || undefined;
      try {
        const result = await withRetry(
          () => client.send("terminal.create", {
            command,
            cwd,
            timeout: TOOL_TIMEOUT_MS,
          }),
          `run_command:${command.slice(0, 50)}`,
        ) as { output?: string; exitCode?: number; error?: string };
        const output = result?.output ?? result?.error ?? "(no output)";
        const exitCode = result?.exitCode ?? -1;
        const prefix = exitCode === 0 ? "✅" : "❌";
        return { result: truncateToolOutput(`${prefix} Exit code: ${exitCode}\n${output}`) };
      } catch (err) {
        return { result: `Error running command: ${(err as Error).message}` };
      }
    }

    case "search_files": {
      const pattern = args.pattern as string;
      const searchPath = (args.path as string) || ".";
      const maxResults = Math.min(Math.max(Math.floor((args.maxResults as number) || 50), 1), 200);
      const filePattern = args.filePattern as string | undefined;

      // Sanitize pattern — escape shell-special chars to prevent injection
      const sanitizedPattern = pattern.replace(/[`$\\!;|&><]/g, "\\$&");

      let grepCmd = `grep -rn --color=never`;

      if (filePattern) {
        // Sanitize file pattern too
        const sanitizedFilePattern = filePattern.replace(/[`$\\!;|&><]/g, "\\$&");
        grepCmd += ` --include="${sanitizedFilePattern}"`;
      }

      grepCmd += ` --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build`;
      grepCmd += ` "${sanitizedPattern}" "${searchPath}"`;
      grepCmd += ` | head -n ${maxResults}`;

      try {
        const result = await withRetry(
          () => client.send("terminal.create", { command: grepCmd, timeout: 15_000 }),
          `search_files:${pattern.slice(0, 30)}`,
        ) as { output?: string; exitCode?: number };
        return { result: truncateToolOutput(result?.output ?? "(no matches)") };
      } catch {
        return { result: `Search error: could not execute grep for "${pattern}"` };
      }
    }

    case "create_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });
        if (ctx.organizationId) {
          (svcCtx as { organizationId?: string }).organizationId = ctx.organizationId;
        }

        const pluginName = args.name as string;
        const pluginSlug = args.slug as string;
        const description = (args.description as string) || "Created by Cursor Coder";
        const entry = (args.entry as string) || "index.js";
        const configSchema = (args.configSchema as Record<string, unknown>) || {};
        const configDefaults = (args.configDefaults as Record<string, unknown>) || {};
        const gatewayId = args.gatewayId as string | undefined;
        const category = (args.category as string) || "general";

        const plugin = await pluginService.createCustomPlugin(svcCtx, {
          slug: pluginSlug,
          name: pluginName,
          description,
          files: writtenFiles,
          entry,
          category: category as "general" | "analytics" | "messaging" | "automation" | "moderation" | "utilities",
          requiredGateways: ["TELEGRAM_BOT"],
          gatewayId,
          configSchema: Object.keys(configSchema).length > 0 ? configSchema : undefined,
          config: Object.keys(configDefaults).length > 0 ? configDefaults : undefined,
        });

        return {
          result: `Plugin "${plugin.pluginName}" created! [ID: ${plugin.id}, slug: ${plugin.pluginSlug}]`,
          finishData: { pluginId: plugin.id },
        };
      } catch (err) {
        return { result: `Error creating plugin record: ${(err as Error).message}` };
      }
    }

    case "update_plugin_record": {
      try {
        const { pluginService } = await import("@/modules/plugin");
        const { createServiceContext } = await import("@/shared/types/context");
        const svcCtx = createServiceContext({ userId: ctx.userId, role: "MEMBER", plan: "FREE" });

        const pluginId = args.pluginId as string;
        const updateData: Record<string, unknown> = {};
        if (args.name) updateData.name = args.name;
        if (args.description) updateData.description = args.description;
        if (args.code) updateData.code = args.code;
        if (args.configSchema) updateData.configSchema = args.configSchema;

        await pluginService.updateCustomPlugin(svcCtx, pluginId, updateData as {
          code?: string; name?: string; description?: string;
          configSchema?: Record<string, unknown>;
        });
        return { result: `Plugin ${pluginId} updated.` };
      } catch (err) {
        return { result: `Error updating plugin: ${(err as Error).message}` };
      }
    }

    case "restart_plugin": {
      const slug = args.slug as string;
      const entry = (args.entry as string) || "index.js";
      const entryFile = `plugins/${slug}/${entry}`;
      try {
        try { await client.send("plugin.stop", { file: entryFile }); } catch { /* may not be running */ }
        await client.send("plugin.start", { file: entryFile });
        return { result: `Plugin "${slug}" restarted (entry: ${entryFile})` };
      } catch (err) {
        return { result: `Error restarting plugin: ${(err as Error).message}` };
      }
    }

    case "finish": {
      return {
        result: "Agent finished.",
        finished: true,
        finishData: {
          entry: (args.entry as string) || "index.js",
          configSchema: (args.configSchema as Record<string, unknown>) || {},
          configDefaults: (args.configDefaults as Record<string, unknown>) || {},
          summary: (args.summary as string) || "Work complete",
        },
      };
    }

    case "hand_off_to_assistant": {
      return {
        result: "Handing off to Cursor Assistant...",
        handOff: {
          workerType: "assistant",
          context: (args.context as string) || "",
        },
      };
    }

    default:
      return null; // Not a coder tool
  }
}

// ===========================================
// Unified Tool Executor
// ===========================================

async function executeTool(
  workerType: CursorWorkerType,
  toolName: string,
  args: Record<string, unknown>,
  ctx: {
    userId: string;
    organizationId: string | null;
    client: BridgeClient | null;
    pluginDir: string;
    writtenFiles: Record<string, string>;
  },
): Promise<ToolExecResult> {
  // Safety validation (skip hand_off, ask_user, finish, navigate)
  const skipSafety = ["hand_off_to_coder", "hand_off_to_assistant", "ask_user", "finish", "navigate_page"];
  if (!skipSafety.includes(toolName)) {
    const safetyToolName = toolName === "list_files" ? "list_directory" : toolName;
    const safetyError = validateToolCallArgs(safetyToolName, args);
    if (safetyError) {
      workerLog.warn({ tool: toolName, reason: safetyError }, "Worker tool call blocked by safety");
      return { result: `Blocked: ${safetyError}` };
    }
  }

  // Try shared tools first (list_gateways, list_user_plugins)
  const sharedResult = await executeSharedTool(toolName, args, ctx);
  if (sharedResult) return sharedResult;

  // Then try worker-specific tools
  if (workerType === "assistant") {
    const assistantResult = await executeAssistantTool(toolName, args, ctx);
    if (assistantResult) return assistantResult;
  }

  if (workerType === "coder") {
    if (!ctx.client) {
      return { result: "Error: No workspace connection. The workspace must be running for code operations." };
    }
    const coderResult = await executeCoderTool(toolName, args, ctx.client, ctx.pluginDir, ctx.writtenFiles, ctx);
    if (coderResult) return coderResult;
  }

  return { result: `Unknown tool: ${toolName}` };
}

// ===========================================
// Model Selection per Worker
// ===========================================

function getModelForWorker(workerType: CursorWorkerType): string {
  return workerType === "coder" ? "2bot-ai-code-pro" : "2bot-ai-text-pro";
}

// ===========================================
// Streaming Worker Loop (async generator)
// ===========================================

/**
 * Run the multi-worker streaming loop.
 *
 * Yields CursorAgentEvent objects as workers complete tasks.
 * Supports hand-off between workers and ask_user pauses.
 *
 * @param request - WorkerStreamRequest with message, userId, etc.
 * @yields CursorAgentEvent — worker_start, tool_start, tool_result,
 *         code_preview, worker_switch, ask_user, thinking, status, done, error
 */
export async function* runWorkerStream(
  request: WorkerStreamRequest,
): AsyncGenerator<CursorAgentEvent> {
  const {
    message,
    userId,
    organizationId,
  } = request;

  // ── Session setup ────────────────────────────────────
  const sessionId = crypto.randomUUID();
  const startedAt = new Date();
  let totalCreditsUsed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalIterations = 0;
  let totalToolCalls = 0;
  let toolCallSequence = 0;

  // Route to initial worker
  const initialWorker = request.workerType || routeToWorker(message);

  workerLog.info(
    { sessionId, userId, initialWorker, message: message.slice(0, 100) },
    "🤖 Worker stream started",
  );

  // Get bridge connection (may be null for assistant-only tasks)
  const bridge = await getBridgeClient(userId, organizationId);
  const client = bridge?.client ?? null;
  const workspaceId = bridge?.workspaceId;

  // Persist session to database
  agentSessionService.createSession({
    id: sessionId,
    userId,
    organizationId: organizationId ?? undefined,
    workspaceId: workspaceId ?? "none",
    model: getModelForWorker(initialWorker),
    prompt: `[worker:${initialWorker}] ${message.slice(0, 500)}`,
  });

  // Mutable state that persists across worker hand-offs
  const writtenFiles: Record<string, string> = {};

  // If pluginSlug/mode weren't provided by the frontend, try to extract from message.
  // This enables direct-to-coder routing ("edit my echo-bot") to get edit-mode prompts.
  let pluginSlug = request.pluginSlug;
  let pluginName = request.pluginName;
  let pluginMode = request.mode;
  if (!pluginSlug || !pluginMode) {
    const extracted = extractPluginContext(message);
    if (!pluginSlug && extracted.slug) pluginSlug = extracted.slug;
    if (!pluginName && extracted.name) pluginName = extracted.name;
    if (!pluginMode && extracted.mode) pluginMode = extracted.mode;
  }

  let pluginDir = pluginSlug ? `plugins/${pluginSlug}` : "plugins";
  let pluginId: string | undefined;
  let finishSummary: string | undefined;

  // Worker hand-off loop
  let currentWorker = initialWorker;
  let handOffContext: string | undefined;
  let handOffCount = 0;
  const MAX_HAND_OFFS = 4; // Safety limit

  try {
    while (handOffCount <= MAX_HAND_OFFS) {
      const workerMeta = WORKER_META[currentWorker];

      // ── Emit worker_start ──────────────────────────────
      yield {
        type: "worker_start" as const,
        worker: currentWorker,
        displayName: workerMeta.displayName,
        sessionId,
      };

      workerLog.info(
        { sessionId, worker: currentWorker, handOffCount },
        `🔧 Worker started: ${workerMeta.displayName}`,
      );

      // ── Build system prompt ────────────────────────────
      const promptCtx: WorkerPromptContext = {
        task: message,
        pluginSlug,
        pluginName,
        mode: pluginMode,
        handOffContext,
      };

      const systemPrompt = currentWorker === "assistant"
        ? buildAssistantSystemPrompt(promptCtx)
        : buildCoderSystemPrompt(promptCtx);

      // ── Build tool definitions ─────────────────────────
      const workerTools = getWorkerTools(currentWorker);
      const toolDefs: ToolDefinition[] = workerTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as ToolDefinition["parameters"],
      }));

      // ── Initialize messages ────────────────────────────
      const messages: TextGenerationMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: handOffContext ? `${handOffContext}\n\nOriginal user message: ${message}` : message },
      ];

      // If coder + no bridge, warn early
      if (currentWorker === "coder" && !client) {
        yield {
          type: "error" as const,
          message: "No running workspace found. Please start your workspace first.",
          sessionId,
          creditsUsed: totalCreditsUsed,
        };
        return;
      }

      // ── File snapshot for rollback (coder edit mode) ───
      const originalFiles: Record<string, string> = {};
      if (currentWorker === "coder" && pluginMode === "edit" && client && pluginSlug) {
        try {
          const existing = await client.fileList(pluginDir, true) as Array<{ name: string; type: string }>;
          const files = (existing || []).filter((f) => f.type === "file");
          for (const f of files) {
            try {
              const content = await client.fileRead(`${pluginDir}/${f.name}`) as { content?: string };
              if (content?.content) originalFiles[f.name] = content.content;
            } catch { /* skip */ }
          }
        } catch { /* no snapshot available */ }
      }

      // ── Agentic loop for this worker ───────────────────
      let workerFinished = false;
      let handOff: ToolExecResult["handOff"] | undefined;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;

      for (let turn = 0; turn < workerMeta.maxIterations; turn++) {
        // Safety: session limits
        const limitError = checkSessionLimits(
          totalIterations,
          totalCreditsUsed,
          startedAt,
          {
            maxIterations: workerMeta.maxIterations,
            maxCreditsPerSession: workerMeta.maxCreditsPerSession,
            sessionTimeoutMs: workerMeta.sessionTimeoutMs,
          },
        );
        if (limitError) {
          workerLog.warn({ sessionId, worker: currentWorker, reason: limitError }, "Worker limit reached");
          yield { type: "status" as const, message: `Limit reached: ${limitError}` };
          break;
        }

        totalIterations++;

        yield {
          type: "iteration_start" as const,
          iteration: totalIterations,
          totalCreditsUsed,
        };

        try {
          const response = await twoBotAIProvider.textGeneration({
            messages,
            model: getModelForWorker(currentWorker),
            temperature: currentWorker === "coder" ? 0.2 : 0.4,
            maxTokens: 4096,
            stream: false,
            userId,
            tools: toolDefs,
            toolChoice: "auto",
            feature: "cursor",
            capability: currentWorker === "coder" ? "code-generation" : undefined,
          });

          totalCreditsUsed += response.creditsUsed ?? 0;
          totalInputTokens += response.usage.inputTokens;
          totalOutputTokens += response.usage.outputTokens;

          const assistantContent = response.content || "";
          const toolCalls = response.toolCalls;

          if (assistantContent) {
            yield { type: "thinking" as const, text: assistantContent };
          }

          // Text-only response (no tool calls) = worker is done talking
          if (!toolCalls || toolCalls.length === 0) {
            workerLog.info({ sessionId, worker: currentWorker }, "Worker responded with text only — done");
            // For assistant: text response IS the answer
            if (currentWorker === "assistant") {
              workerFinished = true;
              finishSummary = assistantContent;
            }
            break;
          }

          if (assistantContent) {
            messages.push({ role: "assistant", content: assistantContent });
          }

          // Execute tool calls
          for (const tc of toolCalls) {
            const toolArgs = tc.arguments as Record<string, unknown>;

            // ── ask_user: pause stream, wait for answer ──
            if (tc.name === "ask_user") {
              const question = (toolArgs.question as string) || "Could you clarify?";
              const sensitive = !!(toolArgs.sensitive as boolean);

              yield {
                type: "ask_user" as const,
                question,
                sensitive,
                sessionId,
              };

              // Pause and wait for user answer
              let answer: string;
              try {
                answer = await waitForUserAnswer(sessionId);
              } catch {
                // Timeout or cancelled
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ask_user]\nUser did not respond. Please proceed with a reasonable default or ask a different way.`,
                });
                continue;
              }

              messages.push({
                role: "user",
                content: `[✅ TOOL RESULT: ask_user]\nUser answered: ${answer}`,
              });

              agentSessionService.recordToolCall(
                sessionId,
                { toolCallId: tc.id ?? `tc-${toolCallSequence}`, toolName: "ask_user", output: answer, isError: false, durationMs: 0 },
                toolArgs,
                toolCallSequence,
              );
              toolCallSequence++;
              totalToolCalls++;
              continue;
            }

            // ── Regular tool execution ───────────────────
            yield {
              type: "tool_start" as const,
              tool: tc.name,
              meta: buildToolStartMeta(tc.name, toolArgs),
            };

            const toolResult = await executeTool(
              currentWorker,
              tc.name,
              toolArgs,
              { userId, organizationId, client, pluginDir, writtenFiles },
            );

            totalToolCalls++;
            const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error");

            yield {
              type: "tool_result" as const,
              tool: tc.name,
              success: !isError,
              summary: toolResult.result.slice(0, 200),
            };

            // Emit code_preview on write_file
            if (tc.name === "write_file" && !isError) {
              const filePath = (toolArgs.path as string) || "";
              const relativePath = filePath.startsWith(pluginDir + "/")
                ? filePath.slice(pluginDir.length + 1)
                : filePath;
              const content = (toolArgs.content as string) || "";
              yield {
                type: "code_preview" as const,
                file: relativePath,
                preview: content.slice(0, 500),
                totalBytes: content.length,
              };
            }

            // Track plugin creation
            if (tc.name === "create_plugin_record" && toolResult.finishData?.pluginId) {
              pluginId = toolResult.finishData.pluginId;
            }

            // Persist tool call
            agentSessionService.recordToolCall(
              sessionId,
              {
                toolCallId: tc.id ?? `tc-${toolCallSequence}`,
                toolName: tc.name,
                output: toolResult.result,
                isError,
                durationMs: 0,
              },
              toolArgs,
              toolCallSequence,
            );
            toolCallSequence++;

            // Feed result back to LLM
            const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
            messages.push({
              role: "user",
              content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
            });

            // Handle finish
            if (toolResult.finished) {
              workerFinished = true;
              finishSummary = toolResult.finishData?.summary;
              break;
            }

            // Handle hand-off
            if (toolResult.handOff) {
              handOff = toolResult.handOff;
              break;
            }
          }

          if (workerFinished || handOff) break;
          consecutiveErrors = 0;

        } catch (err) {
          consecutiveErrors++;
          workerLog.error(
            { sessionId, worker: currentWorker, turn, error: (err as Error).message },
            "Worker loop error",
          );
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
          messages.push({
            role: "user",
            content: `[⚠️ SYSTEM ERROR] ${(err as Error).message}. Try a different approach.`,
          });
        }
      }

      // ── After worker loop ──────────────────────────────

      // Hand-off to another worker
      if (handOff) {
        yield {
          type: "worker_switch" as const,
          fromWorker: currentWorker,
          toWorker: handOff.workerType,
          toDisplayName: WORKER_META[handOff.workerType].displayName,
          context: handOff.context,
        };

        // Update mutable state from hand-off
        if (handOff.pluginSlug) {
          pluginSlug = handOff.pluginSlug;
          pluginDir = `plugins/${pluginSlug}`;
        }
        if (handOff.pluginName) pluginName = handOff.pluginName;
        if (handOff.mode) pluginMode = handOff.mode;

        currentWorker = handOff.workerType;
        handOffContext = handOff.context;
        handOffCount++;
        handOff = undefined;
        continue; // Start next worker
      }

      // Worker finished (or ran out of iterations)
      break;
    }
  } finally {
    // Cancel any pending ask_user
    cancelPendingAnswer(sessionId);

    // Persist session completion
    const durationMs = Date.now() - startedAt.getTime();
    const status = finishSummary ? "completed" : (Object.keys(writtenFiles).length > 0 ? "completed" : "cancelled");

    agentSessionService.completeSession({
      id: sessionId,
      status,
      iterationCount: totalIterations,
      toolCallCount: totalToolCalls,
      totalCreditsUsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      finalResponse: finishSummary,
      durationMs,
    });

    workerLog.info(
      {
        sessionId,
        iterations: totalIterations,
        toolCalls: totalToolCalls,
        creditsUsed: totalCreditsUsed,
        handOffs: handOffCount,
        durationMs,
        filesWritten: Object.keys(writtenFiles).length,
      },
      "✅ Worker stream completed",
    );
  }

  // ── Emit final event ─────────────────────────────────
  const durationMs = Date.now() - startedAt.getTime();
  const hasFiles = Object.keys(writtenFiles).length > 0;

  yield {
    type: "done" as const,
    success: true,
    sessionId,
    pluginName: pluginName || "",
    pluginSlug: pluginSlug || "",
    pluginId,
    summary: finishSummary || (hasFiles ? "Files created/updated" : "Done"),
    fileCount: Object.keys(writtenFiles).length,
    filesWritten: Object.keys(writtenFiles),
    creditsUsed: totalCreditsUsed,
    durationMs,
    entry: "index.js",
  };
}
