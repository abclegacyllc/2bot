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
import { withRetry } from "@/modules/2bot-ai-provider/retry.util";
import type { TextGenerationMessage, ToolDefinition } from "@/modules/2bot-ai-provider/types";
import type { BridgeClient } from "@/modules/workspace/bridge-client.service";

import type { UIAction } from "@/components/cursor/cursor.types";
import type {
    CursorAgentEvent,
    ToolStartMeta,
} from "./cursor-agent.types";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";
import { getWorkerTools } from "./cursor-worker-tools";
import type { CursorWorkerType, WorkerPromptContext } from "./cursor-workers";
import {
    WORKER_META,
    buildAssistantSystemPrompt,
    buildCoderSystemPrompt,
    routeToWorker,
} from "./cursor-workers";
import type { RepoAnalysis } from "./repo-analyzer.service";

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
  mode?: "create" | "edit" | "analyze-repo";
  /** Optional: AI model ID (defaults to "auto") */
  modelId?: string;
  /** Optional: GitHub repo URL to analyze and generate a plugin from */
  repoUrl?: string;
  /** Optional: branch to clone (defaults to default branch) */
  repoBranch?: string;
  /** Optional: user description of what they want from the repo */
  description?: string;
}

// ===========================================
// Ask-User Answer Mechanism
// ===========================================

interface PendingAnswer {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
  /** The userId that owns this session (defense-in-depth) */
  userId: string;
}

/** In-memory map of sessionId → pending answer resolver */
const pendingAnswers = new Map<string, PendingAnswer>();

/** Wait for the user to answer a question. Rejects after timeout. */
function waitForUserAnswer(sessionId: string, userId: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAnswers.delete(sessionId);
      reject(new Error("User did not respond within the time limit"));
    }, timeoutMs);
    pendingAnswers.set(sessionId, { resolve, reject, timeout, userId });
  });
}

/**
 * Resolve a pending ask_user question with the user's answer.
 * Called from the POST /api/cursor/worker-answer route.
 */
export function resolveUserAnswer(sessionId: string, answer: string, userId?: string): boolean {
  const pending = pendingAnswers.get(sessionId);
  if (!pending) return false;

  // Defense-in-depth: verify the answering user owns this session
  if (userId && pending.userId !== userId) {
    workerLog.warn(
      { sessionId, expected: pending.userId, actual: userId },
      "Session ownership mismatch on worker-answer",
    );
    return false;
  }

  clearTimeout(pending.timeout);
  pending.resolve(answer);
  pendingAnswers.delete(sessionId);
  return true;
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
// Backend-Driven UI Actions Builder
// ===========================================

/** Shorten a file path for display */
function shortenPath(filePath: string): string {
  return filePath.replace(/^plugins\/[^/]+\//, "");
}

/**
 * Build UIActions for a tool call. These are sent directly in the SSE event
 * so the frontend doesn't need a mapper. Falls back to empty array for tools
 * that only need a default toast (the mapper handles those).
 */
function buildToolUIActions(toolName: string, args: Record<string, unknown>): UIAction[] {
  switch (toolName) {
    // ── Workspace / Coder tools ─────────────────────
    case "read_file":
      return [
        { action: "navigate", path: "/workspace", label: `Reading ${shortenPath((args.path as string) || "")}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Reading ${shortenPath((args.path as string) || "")}`, gated: true, durationMs: 30_000 },
      ];
    case "write_file":
      return [
        { action: "navigate", path: "/workspace", label: `Writing ${shortenPath((args.path as string) || "")}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Writing ${shortenPath((args.path as string) || "")} (${((args.content as string) || "").length} bytes)`, gated: true, durationMs: 30_000 },
      ];
    case "list_files":
      return [
        { action: "navigate", path: "/workspace", label: "Scanning plugin files" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Listing ${(args.path as string) || "/"}`, gated: true, durationMs: 30_000 },
      ];
    case "create_directory":
      return [
        { action: "toast", message: `Creating directory ${shortenPath((args.path as string) || "")}`, variant: "info", durationMs: 1000 },
      ];
    case "delete_file":
      return [
        { action: "toast", message: `Deleting ${shortenPath((args.path as string) || "")}`, variant: "warning", durationMs: 1000 },
      ];
    case "run_command":
      return [
        { action: "navigate", path: "/workspace", label: "Running command" },
        { action: "pulse", target: "workspace-plugins-panel", label: `$ ${((args.command as string) || "").slice(0, 60)}`, gated: true, durationMs: 30_000 },
      ];
    case "search_files":
      return [
        { action: "navigate", path: "/workspace", label: "Searching code" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Searching for "${(args.pattern as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];

    // ── Gateway tools ───────────────────────────────
    case "list_gateways":
      return [
        { action: "navigate", path: "/gateways", label: "Checking your gateways" },
        { action: "pulse", label: "Looking for a gateway to bind to", gated: true, durationMs: 30_000 },
      ];
    case "create_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Creating gateway: ${(args.name as string) || ""}` },
        { action: "pulse", label: `Creating "${(args.name as string) || ""}"`, gated: true, durationMs: 30_000 },
      ];
    case "delete_gateway":
      return [
        { action: "navigate", path: "/gateways", label: `Deleting gateway` },
        { action: "toast", message: `Deleting gateway "${(args.name as string) || (args.gatewayId as string) || ""}"`, variant: "warning", durationMs: 1500 },
      ];

    // ── Plugin tools ────────────────────────────────
    case "list_user_plugins":
      return [
        { action: "navigate", path: "/plugins", label: "Reviewing existing plugins" },
        { action: "pulse", label: "Checking installed plugins", gated: true, durationMs: 30_000 },
      ];
    case "create_plugin_record":
      return [
        { action: "toast", message: `Registering plugin: ${(args.name as string) || ""}`, variant: "info", durationMs: 2000 },
      ];
    case "update_plugin_record":
      return [
        { action: "toast", message: `Updating plugin metadata: ${(args.name as string) || "plugin"}`, variant: "info", durationMs: 2000 },
      ];
    case "restart_plugin":
      return [
        { action: "navigate", path: "/workspace", label: `Restarting ${(args.slug as string) || ""}` },
        { action: "pulse", target: "workspace-plugins-panel", label: `Restarting plugin: ${(args.slug as string) || ""}`, gated: true, durationMs: 30_000 },
      ];
    case "install_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Installing ${(args.slug as string) || ""}` },
        { action: "pulse", label: `Installing ${(args.slug as string) || ""}`, gated: true, durationMs: 30_000 },
      ];
    case "uninstall_plugin":
      return [
        { action: "navigate", path: "/plugins", label: `Uninstalling ${(args.name as string) || ""}` },
        { action: "toast", message: `Uninstalling "${(args.name as string) || ""}"`, variant: "warning", durationMs: 1500 },
      ];
    case "toggle_plugin": {
      const enable = !!args.enable;
      const name = (args.name as string) || "";
      return [
        { action: "navigate", path: "/plugins", label: `${enable ? "Starting" : "Stopping"} ${name}` },
        { action: "pulse", label: `${enable ? "Starting" : "Stopping"} ${name}`, gated: true, durationMs: 30_000 },
      ];
    }

    // ── Account / billing tools ─────────────────────
    case "check_credits":
      return [
        { action: "navigate", path: "/credits", label: "Checking your credits" },
        { action: "pulse", target: "credits-balance-card", label: "Your credit balance", gated: true, durationMs: 30_000 },
      ];
    case "check_billing":
      return [
        { action: "navigate", path: "/billing", label: "Checking billing info" },
        { action: "pulse", label: "Your billing overview", gated: true, durationMs: 30_000 },
      ];
    case "check_usage":
      return [
        { action: "navigate", path: "/usage", label: "Checking usage stats" },
        { action: "pulse", label: "Your usage statistics", gated: true, durationMs: 30_000 },
      ];

    // ── Workspace ───────────────────────────────────
    case "start_workspace":
      return [
        { action: "navigate", path: "/workspace", label: "Starting workspace" },
        { action: "pulse", target: "workspace-start-btn", label: "Starting your workspace", gated: true, durationMs: 30_000 },
      ];
    case "navigate_page":
      return [
        { action: "navigate", path: (args.path as string) || "/", label: `Opening ${(args.path as string) || "/"}` },
      ];

    // ── Interaction tools ───────────────────────────
    case "ask_user":
    case "hand_off_to_coder":
    case "hand_off_to_assistant":
    case "finish":
      return []; // Handled by dedicated event types or mapper fallback

    // ── New platform tools ──────────────────────────
    case "check_gateway_status":
      return [
        { action: "navigate", path: "/gateways", label: "Checking gateway status" },
        { action: "pulse", label: "Checking gateway health", gated: true, durationMs: 30_000 },
      ];
    case "view_plugin_logs":
      return [
        { action: "navigate", path: "/workspace", label: "Viewing plugin logs" },
        { action: "pulse", target: "workspace-plugins-panel", label: `Viewing logs for ${(args.pluginSlug as string) || "plugin"}`, gated: true, durationMs: 30_000 },
      ];
    case "list_templates":
      return [
        { action: "toast", message: "Browsing plugin templates…", variant: "info", durationMs: 1500 },
      ];
    case "explain_error":
      return [
        { action: "toast", message: "Analyzing error…", variant: "info", durationMs: 1500 },
      ];

    default:
      // No backend-driven actions — frontend mapper can handle as fallback
      return [];
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

    case "view_plugin_logs": {
      const pluginSlug = args.pluginSlug as string;
      if (!pluginSlug) return { result: "Error: pluginSlug is required." };
      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: No running workspace. Start your workspace first." };
        const logs = await bridge.client.pluginLogs(`plugins/${pluginSlug}/index.js`);
        const logText = typeof logs === "string" ? logs : JSON.stringify(logs, null, 2);
        return { result: truncateToolOutput(logText || "(no logs available)") };
      } catch (err) {
        return { result: `Error fetching plugin logs: ${(err as Error).message}` };
      }
    }

    case "explain_error": {
      const errorText = args.error as string;
      if (!errorText) return { result: "Error: provide the error text to explain." };

      // Common error pattern map — deterministic, no AI call needed
      const explanations: Array<{ pattern: RegExp; explanation: string }> = [
        { pattern: /insufficient credits|credit balance/i, explanation: "You don't have enough credits for this operation. Go to Settings → Billing to add credits or upgrade your plan." },
        { pattern: /gateway.*not found|no gateway/i, explanation: "The gateway (bot connection) doesn't exist or hasn't been configured yet. Use the Gateways page to create one." },
        { pattern: /bot token.*invalid|401.*telegram/i, explanation: "Your Telegram bot token is invalid or expired. Create a new bot via @BotFather on Telegram and update the gateway." },
        { pattern: /workspace.*not running|no.*workspace/i, explanation: "Your development workspace isn't running. Go to the Dashboard and click 'Start Workspace'." },
        { pattern: /ECONNREFUSED|ECONNRESET|timeout/i, explanation: "A network connection failed. This is usually temporary — try again in a moment. If it persists, your workspace may need restarting." },
        { pattern: /plugin.*not found|no plugin/i, explanation: "The plugin doesn't exist or isn't installed. Check the Bots page for available plugins." },
        { pattern: /rate limit|429|too many requests/i, explanation: "You've hit an API rate limit. Wait a moment and try again. This is temporary." },
        { pattern: /permission denied|forbidden|403/i, explanation: "You don't have permission for this action. Check that you own this resource or have the right role in the organization." },
      ];

      for (const { pattern, explanation } of explanations) {
        if (pattern.test(errorText)) {
          return { result: `Explanation: ${explanation}\n\nOriginal error: ${errorText}` };
        }
      }

      return { result: `This error doesn't match a known pattern. The full error: "${errorText}". Try checking the workspace logs or asking for more details about what you were doing when it occurred.` };
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
        const gwType = ((args.type as string) || "TELEGRAM_BOT") as "TELEGRAM_BOT" | "DISCORD_BOT" | "SLACK_BOT" | "WHATSAPP_BOT";

        type CredentialTypes = import("@/modules/gateway/gateway.types").GatewayCredentials; // eslint-disable-line @typescript-eslint/consistent-type-imports
        let credentials: CredentialTypes;

        if (gwType === "TELEGRAM_BOT") {
          const botToken = args.botToken as string;
          if (!botToken) return { result: "Error: botToken is required. Use ask_user to collect it first." };
          credentials = { botToken };
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

    case "check_gateway_status": {
      const gatewayId = args.gatewayId as string;
      if (!gatewayId) return { result: "Error: gatewayId is required. Use list_gateways first." };
      try {
        const { gatewayMonitor } = await import("@/modules/gateway");
        const result = await gatewayMonitor.testNewGateway(gatewayId);
        if (result.healthy) {
          return { result: `Gateway ${gatewayId} is healthy! Latency: ${result.latency ?? "N/A"}ms.` };
        } else {
          return { result: `Gateway ${gatewayId} is NOT healthy. Error: ${result.error ?? "Unknown error"}` };
        }
      } catch (err) {
        return { result: `Error checking gateway status: ${(err as Error).message}` };
      }
    }

    case "list_templates": {
      try {
        const { getTemplateList } = await import("@/modules/plugin/plugin-templates");
        let templates = getTemplateList();
        const category = args.category as string | undefined;
        if (category) {
          templates = templates.filter((t) =>
            t.category.toLowerCase().includes(category.toLowerCase())
          );
        }
        const summary = templates.map((t) =>
          `- ${t.name} [${t.id}] (${t.category}, ${t.difficulty ?? "beginner"}) — ${t.description}${t.requiredGateways?.length ? ` (requires: ${t.requiredGateways.join(", ")})` : ""}`,
        ).join("\n");
        return { result: summary || "(no templates found)" };
      } catch (err) {
        return { result: `Error listing templates: ${(err as Error).message}` };
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
        const result = await withBridgeRetry(
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
        await withBridgeRetry(() => client.fileWrite(path, content, true), `write_file:${path}`);
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
        const result = await withBridgeRetry(() => client.fileList(path, recursive), `list_files:${path}`);
        return { result: truncateToolOutput(JSON.stringify(result, null, 2)) };
      } catch {
        return { result: `Error listing ${path}: directory not found` };
      }
    }

    case "create_directory": {
      const path = args.path as string;
      try {
        await withBridgeRetry(() => client.fileMkdir(path), `create_directory:${path}`);
        return { result: `Created directory: ${path}` };
      } catch {
        return { result: `Error creating directory: ${path}` };
      }
    }

    case "delete_file": {
      const path = args.path as string;
      try {
        await withBridgeRetry(() => client.fileDelete(path), `delete_file:${path}`);
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
        const result = await withBridgeRetry(
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
        const result = await withBridgeRetry(
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

function getModelForWorker(_workerType: CursorWorkerType, requestModelId?: string): string {
  return requestModelId || "auto";
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
    model: getModelForWorker(initialWorker, request.modelId),
    prompt: `[worker:${initialWorker}] ${message.slice(0, 500)}`,
  });

  // Mutable state that persists across worker hand-offs
  const writtenFiles: Record<string, string> = {};

  // Repo analysis state (populated when repoUrl is provided)
  let repoAnalysis: RepoAnalysis | undefined;
  let repoCloneDir: string | undefined;

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

  // ── Repo Analysis: Clone & Analyze (if repoUrl provided) ──
  if (request.repoUrl && client) {
    // Force coder mode for repo analysis
    if (!pluginMode) pluginMode = "create";

    // Derive repo name from URL
    const repoName = request.repoUrl
      .replace(/\.git$/, "")
      .split("/")
      .pop()
      ?.replace(/[^a-zA-Z0-9_-]/g, "-") || "cloned-repo";

    repoCloneDir = `imports/${repoName}`;
    if (!pluginSlug) pluginSlug = repoName;
    if (!pluginName) pluginName = repoName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    pluginDir = `plugins/${pluginSlug}`;

    yield { type: "status" as const, message: `Cloning repository...` };

    try {
      const cloneResult = await client.gitClone(request.repoUrl, {
        targetDir: repoCloneDir,
        branch: request.repoBranch,
        depth: 1,
      }) as { success: boolean; error?: string };

      if (!cloneResult?.success) {
        yield {
          type: "error" as const,
          message: `Failed to clone repository: ${cloneResult?.error || "Unknown error"}`,
          sessionId,
          creditsUsed: totalCreditsUsed,
        };
        return;
      }

      yield { type: "status" as const, message: "Repository cloned. Analyzing source code..." };

      // Lazy import to avoid circular deps
      const { analyzeRepo } = await import("./repo-analyzer.service");
      const result = await analyzeRepo(client, repoCloneDir, userId);
      repoAnalysis = result.analysis;
      totalCreditsUsed += result.creditsUsed;

      const featureSummary = repoAnalysis.features.length > 0
        ? repoAnalysis.features.slice(0, 5).join(", ")
        : "no specific features detected";

      yield {
        type: "status" as const,
        message: `Analyzed: ${repoAnalysis.purpose} (${repoAnalysis.language}, ${repoAnalysis.complexity}). Features: ${featureSummary}`,
      };

      workerLog.info(
        {
          sessionId,
          language: repoAnalysis.language,
          complexity: repoAnalysis.complexity,
          featureCount: repoAnalysis.features.length,
          creditsUsed: result.creditsUsed,
        },
        "Repo analysis complete",
      );
    } catch (err) {
      yield {
        type: "error" as const,
        message: `Failed to analyze repository: ${(err as Error).message}`,
        sessionId,
        creditsUsed: totalCreditsUsed,
      };
      return;
    }
  }

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

      // ── Fetch lightweight user state for prompt context ──
      let userState: WorkerPromptContext["userState"];
      try {
        const [user, gatewayCount, pluginCount] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true },
          }),
          prisma.gateway.count({
            where: { userId, ...(organizationId ? { organizationId } : {}) },
          }),
          prisma.userPlugin.count({
            where: { userId },
          }),
        ]);
        userState = {
          plan: user?.plan ?? "FREE",
          gatewayCount,
          pluginCount,
          workspaceRunning: !!client,
        };
      } catch {
        // Non-critical — proceed without user state
      }

      // ── Build system prompt ────────────────────────────
      const promptCtx: WorkerPromptContext = {
        task: request.description
          ? `${message}\n\nUser description: ${request.description}`
          : message,
        pluginSlug,
        pluginName,
        mode: pluginMode,
        handOffContext,
        userState,
        repoAnalysis,
        repoCloneDir,
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
          const response = await withRetry(
            () => twoBotAIProvider.textGeneration({
              messages,
              model: getModelForWorker(currentWorker, request.modelId),
              temperature: currentWorker === "coder" ? 0.2 : 0.4,
              maxTokens: 4096,
              stream: false,
              userId,
              tools: toolDefs,
              toolChoice: "auto",
              feature: "cursor",
              capability: currentWorker === "coder" ? "code-generation" : undefined,
            }),
            {
              maxRetries: 2,
              operationName: `cursor-${currentWorker}-ai-call`,
            },
          );

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

          // Execute tool calls — parallel for read-only batches, sequential otherwise
          const READ_ONLY_TOOLS = new Set([
            "read_file", "list_files", "search_files",
            "list_gateways", "list_user_plugins",
            "check_credits", "check_billing", "check_usage",
            "check_gateway_status", "list_templates",
            "view_plugin_logs", "explain_error",
          ]);
          const CONTROL_FLOW_TOOLS = new Set([
            "ask_user", "finish", "hand_off_to_coder", "hand_off_to_assistant",
          ]);

          const allReadOnly = toolCalls.every((tc) =>
            READ_ONLY_TOOLS.has(tc.name) && !CONTROL_FLOW_TOOLS.has(tc.name)
          );

          if (allReadOnly && toolCalls.length > 1) {
            // ── Parallel execution for read-only batch ───
            workerLog.debug(
              { sessionId, toolCount: toolCalls.length },
              "Executing read-only tools in parallel",
            );

            // Emit all tool_start events
            for (const tc of toolCalls) {
              const toolArgs = tc.arguments as Record<string, unknown>;
              const uiActions = buildToolUIActions(tc.name, toolArgs);
              yield {
                type: "tool_start" as const,
                tool: tc.name,
                meta: buildToolStartMeta(tc.name, toolArgs),
                ...(uiActions.length > 0 ? { uiActions } : {}),
              };
            }

            // Execute all in parallel
            const results = await Promise.all(
              toolCalls.map((tc) =>
                executeTool(
                  currentWorker,
                  tc.name,
                  tc.arguments as Record<string, unknown>,
                  { userId, organizationId, client, pluginDir, writtenFiles },
                )
              ),
            );

            // Process results and emit events
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i]!;
              const toolResult = results[i]!;
              const toolArgs = tc.arguments as Record<string, unknown>;

              totalToolCalls++;
              const isError = toolResult.result.startsWith("Blocked:") || toolResult.result.startsWith("Error");

              yield {
                type: "tool_result" as const,
                tool: tc.name,
                success: !isError,
                summary: toolResult.result.slice(0, 200),
              };

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

              const statusPrefix = isError ? "❌ TOOL ERROR" : "✅ TOOL RESULT";
              messages.push({
                role: "user",
                content: `[${statusPrefix}: ${tc.name}]\n${toolResult.result}`,
              });
            }
          } else {
          // ── Sequential execution (writes, control flow, or single tool) ───
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
                answer = await waitForUserAnswer(sessionId, userId);
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

            // ── Destructive action approval ──────────────
            const DESTRUCTIVE_TOOLS = new Set(["delete_file", "delete_gateway", "uninstall_plugin"]);
            if (DESTRUCTIVE_TOOLS.has(tc.name)) {
              const target = (toolArgs.path as string) || (toolArgs.gatewayId as string) || (toolArgs.name as string) || (toolArgs.pluginId as string) || "this resource";
              yield {
                type: "ask_user" as const,
                question: `⚠️ Confirm destructive action: **${tc.name}** on "${target}". This cannot be undone. Proceed? (yes/no)`,
                sensitive: false,
                sessionId,
              };

              let approval: string;
              try {
                approval = await waitForUserAnswer(sessionId, userId);
              } catch {
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ${tc.name}]\nUser did not confirm. Action cancelled.`,
                });
                continue;
              }

              const approved = /^(y|yes|ok|confirm|proceed|sure|do it)/i.test(approval.trim());
              if (!approved) {
                messages.push({
                  role: "user",
                  content: `[TOOL RESULT: ${tc.name}]\nUser rejected the action. Do NOT retry — try a different approach or ask what they want instead.`,
                });
                workerLog.info({ sessionId, tool: tc.name, target }, "Destructive action rejected by user");
                continue;
              }
              workerLog.info({ sessionId, tool: tc.name, target }, "Destructive action approved by user");
            }

            // ── Regular tool execution ───────────────────
            {
              const uiActions = buildToolUIActions(tc.name, toolArgs);
              yield {
                type: "tool_start" as const,
                tool: tc.name,
                meta: buildToolStartMeta(tc.name, toolArgs),
                ...(uiActions.length > 0 ? { uiActions } : {}),
              };
            }

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

            // Audit log for sensitive/destructive tool calls (fire-and-forget)
            const AUDITED_TOOLS = new Set([
              "delete_file", "delete_gateway", "uninstall_plugin",
              "create_gateway", "install_plugin", "create_plugin_record",
              "write_file", "run_command",
            ]);
            if (AUDITED_TOOLS.has(tc.name)) {
              import("@/lib/audit").then(({ auditActions }) => {
                auditActions.cursorToolExecuted(
                  { userId, organizationId: organizationId ?? undefined },
                  sessionId,
                  tc.name,
                  toolArgs,
                  { success: !isError, summary: toolResult.result.slice(0, 200) },
                );
              }).catch(() => {}); // Fire-and-forget
            }

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
          } // end else (sequential execution)

          if (workerFinished || handOff) break;
          consecutiveErrors = 0;

        } catch (err) {
          consecutiveErrors++;
          const errorMsg = (err as Error).message || String(err);
          workerLog.error(
            { sessionId, worker: currentWorker, turn, error: errorMsg, consecutiveErrors },
            "Worker loop error",
          );

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            yield {
              type: "status" as const,
              message: `Too many consecutive errors (${consecutiveErrors}). Stopping.`,
            };
            break;
          }

          // Provide actionable context to the LLM based on error type
          const errLower = errorMsg.toLowerCase();
          let recovery: string;
          if (errLower.includes("rate limit") || errLower.includes("429")) {
            recovery = "The AI provider is rate-limited. Waiting before retrying.";
          } else if (errLower.includes("timeout") || errLower.includes("econnreset")) {
            recovery = "Network timeout occurred. The request will be retried automatically.";
          } else if (errLower.includes("credit") || errLower.includes("insufficient")) {
            recovery = "Insufficient credits to continue. Please check your balance.";
            yield { type: "status" as const, message: recovery };
            break; // Credits won't magically appear — stop immediately
          } else {
            recovery = `An error occurred: ${errorMsg}. Try a different approach or simpler tool call.`;
          }

          messages.push({
            role: "user",
            content: `[⚠️ SYSTEM ERROR] ${recovery}`,
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

    // Cleanup cloned repo directory if it was created
    if (repoCloneDir && client) {
      try {
        await client.fileDelete(repoCloneDir);
        workerLog.debug({ sessionId, repoCloneDir }, "Cleaned up cloned repo directory");
      } catch {
        workerLog.warn({ sessionId, repoCloneDir }, "Failed to cleanup cloned repo directory");
      }
    }

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
