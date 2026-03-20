/**
 * 2Bot AI Agent Executor
 *
 * Maps AI tool calls to workspace bridge operations.
 * Each tool call is dispatched to the correct bridge action through
 * the workspace service, with safety validation, timeout enforcement,
 * and output formatting.
 *
 * Architecture:
 *   AgentToolCall → safety check → workspace.sendBridgeAction() → format result
 *
 * @module modules/2bot-ai-agent/agent-executor
 */

import { logger } from "@/lib/logger";
import { creditService } from "@/modules/credits/credit.service";
import { gatewayService } from "@/modules/gateway";
import type { CreateGatewayRequest, GatewayCredentials, UpdateGatewayRequest } from "@/modules/gateway/gateway.types";
import { pluginService } from "@/modules/plugin";
import { workspaceService } from "@/modules/workspace/workspace.service";
import type { ServiceContext } from "@/shared/types/context";
import type { BridgeAction } from "@/shared/types/workspace";

import { truncateToolOutput, validateToolCallArgs } from "./agent-safety";
import { COMPOSITE_TOOLS, getAgentTool, PLATFORM_TOOLS, TOOL_TO_BRIDGE_ACTION } from "./agent-tools";
import type { AgentToolCall, AgentToolResult } from "./agent.types";

const log = logger.child({ module: "2bot-ai-agent:executor" });

// ===========================================
// Tool Execution
// ===========================================

/**
 * Execute a single AI tool call against the workspace container.
 *
 * Routes the call through the workspace service → bridge client → bridge agent.
 * Returns a structured result that gets fed back to the AI.
 */
export async function executeToolCall(
  toolCall: AgentToolCall,
  workspaceId: string,
  ctx: ServiceContext,
  timeoutMs: number,
): Promise<AgentToolResult> {
  const startTime = Date.now();

  // 1. Validate tool exists
  const toolDef = getAgentTool(toolCall.name);
  if (!toolDef) {
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      output: `Unknown tool: "${toolCall.name}"`,
      isError: true,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Safety validation
  const safetyError = validateToolCallArgs(toolCall.name, toolCall.arguments);
  if (safetyError) {
    log.warn(
      { tool: toolCall.name, reason: safetyError },
      "Tool call blocked by safety check",
    );
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      output: `Blocked: ${safetyError}`,
      isError: true,
      durationMs: Date.now() - startTime,
    };
  }

  // 3. Execute with timeout
  try {
    const output = await Promise.race([
      dispatchToolCall(toolCall, workspaceId, ctx),
      createTimeout(timeoutMs, toolCall.name),
    ]);

    const duration = Date.now() - startTime;

    log.info(
      { tool: toolCall.name, durationMs: duration, outputLength: output.length },
      "Tool call executed successfully",
    );

    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      output: truncateToolOutput(output),
      isError: false,
      durationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    log.error(
      { tool: toolCall.name, error: message, durationMs: duration },
      "Tool call failed",
    );

    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      output: `Error: ${message}`,
      isError: true,
      durationMs: duration,
    };
  }
}

/**
 * Execute multiple tool calls in parallel.
 * AI models like GPT-4 can request multiple tool calls in a single response.
 */
export async function executeToolCallsBatch(
  toolCalls: AgentToolCall[],
  workspaceId: string,
  ctx: ServiceContext,
  timeoutMs: number,
): Promise<AgentToolResult[]> {
  return Promise.all(
    toolCalls.map((tc) => executeToolCall(tc, workspaceId, ctx, timeoutMs)),
  );
}

// ===========================================
// Dispatch Logic
// ===========================================

/**
 * Dispatch a tool call to the appropriate bridge action(s).
 * Returns the formatted output string.
 */
async function dispatchToolCall(
  toolCall: AgentToolCall,
  workspaceId: string,
  ctx: ServiceContext,
): Promise<string> {
  const { name, arguments: args } = toolCall;

  // Platform tools: call 2bot services directly (not bridge agent)
  if (PLATFORM_TOOLS.has(name)) {
    return dispatchPlatformToolCall(name, args, workspaceId, ctx);
  }

  // Composite tools need special handling
  if (COMPOSITE_TOOLS.has(name)) {
    return dispatchCompositeToolCall(name, args, workspaceId, ctx);
  }

  // Standard tools: direct bridge action mapping
  const bridgeAction = TOOL_TO_BRIDGE_ACTION[name] as BridgeAction | undefined;
  if (!bridgeAction) {
    throw new Error(`No bridge action mapping for tool "${name}"`);
  }

  // Build payload from tool arguments
  const payload = buildBridgePayload(name, args);

  // Send via workspace service (handles auth, bridge client lookup)
  const result = await workspaceService.sendBridgeAction(
    ctx,
    workspaceId,
    bridgeAction,
    payload,
  );

  return formatBridgeResult(name, result, args);
}

/**
 * Handle composite tools that need multiple bridge operations
 * or special execution logic.
 */
async function dispatchCompositeToolCall(
  name: string,
  args: Record<string, unknown>,
  workspaceId: string,
  ctx: ServiceContext,
): Promise<string> {
  switch (name) {
    case "run_command":
      return executeRunCommand(args, workspaceId, ctx);

    case "search_files":
      return executeSearchFiles(args, workspaceId, ctx);

    default:
      throw new Error(`Unknown composite tool: "${name}"`);
  }
}

// ===========================================
// Platform Tool Implementations
// ===========================================

/**
 * Dispatch a platform tool call to the appropriate 2bot service.
 * These tools call platform services directly, not the workspace bridge.
 */
async function dispatchPlatformToolCall(
  name: string,
  args: Record<string, unknown>,
  _workspaceId: string,
  ctx: ServiceContext,
): Promise<string> {
  switch (name) {
    case "create_custom_plugin": {
      const pluginName = args.name as string;
      const description = args.description as string;
      const code = args.code as string;
      const category = (args.category as string) || "general";

      // Generate a slug from the name
      const slug = pluginName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const plugin = await pluginService.createCustomPlugin(ctx, {
        slug,
        name: pluginName,
        description,
        code,
        category: category as "general" | "analytics" | "messaging" | "automation" | "moderation" | "utilities",
      });

      return JSON.stringify({
        success: true,
        message: `Custom plugin "${plugin.pluginName}" created successfully.`,
        plugin: {
          id: plugin.id,
          slug: plugin.pluginSlug,
          name: plugin.pluginName,
          description: plugin.pluginDescription,
          category: plugin.pluginCategory,
          authorType: plugin.authorType,
        },
      });
    }

    case "list_user_plugins": {
      const plugins = await pluginService.getUserPlugins(ctx);
      const summary = plugins.map((p) => ({
        id: p.id,
        slug: p.pluginSlug,
        name: p.pluginName,
        description: p.pluginDescription,
        enabled: p.isEnabled,
        authorType: p.authorType,
        gatewayName: p.gatewayName,
        gatewayType: p.gatewayType,
        executionCount: p.executionCount,
        lastError: p.lastError,
      }));
      return JSON.stringify({
        count: plugins.length,
        plugins: summary,
      });
    }

    case "install_plugin": {
      const slug = args.slug as string;
      const gatewayId = args.gatewayId as string | undefined;

      const installed = await pluginService.installPlugin(ctx, {
        slug,
        gatewayId,
      });

      return JSON.stringify({
        success: true,
        message: `Plugin "${installed.pluginName}" installed successfully.`,
        plugin: {
          id: installed.id,
          slug: installed.pluginSlug,
          name: installed.pluginName,
          category: installed.pluginCategory,
          gatewayName: installed.gatewayName,
        },
      });
    }

    case "list_available_plugins": {
      const available = await pluginService.getAvailablePlugins();
      const userPlugins = await pluginService.getUserPlugins(ctx);
      const installedSlugs = new Set(userPlugins.map((p) => p.pluginSlug));

      const summary = available.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        category: p.category,
        isBuiltin: p.isBuiltin,
        isInstalled: installedSlugs.has(p.slug),
        requiredGateways: p.requiredGateways,
      }));

      return JSON.stringify({
        count: available.length,
        plugins: summary,
      });
    }

    case "list_gateways": {
      const gateways = await gatewayService.findByUser(ctx);
      const summary = gateways.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        status: g.status,
        lastConnectedAt: g.lastConnectedAt,
        lastError: g.lastError,
      }));
      return JSON.stringify({
        count: gateways.length,
        gateways: summary,
      });
    }

    case "get_workspace_status": {
      const orgId = ctx.isOrgContext() ? ctx.organizationId : undefined;
      const status = await workspaceService.getStatus(ctx, orgId);
      if (!status) {
        return JSON.stringify({
          running: false,
          message: "No workspace found. The user needs to create and start a workspace first.",
        });
      }
      return JSON.stringify({
        running: status.status === "RUNNING",
        id: status.id,
        status: status.status,
        runningPlugins: status.runningPlugins.length,
        resources: status.resources,
        startedAt: status.startedAt,
        uptime: status.startedAt
          ? `${Math.round((Date.now() - new Date(status.startedAt).getTime()) / 60000)} minutes`
          : null,
      });
    }

    case "check_credits": {
      const balance = await creditService.getPersonalBalance(ctx.userId);
      return JSON.stringify({
        balance: balance.balance,
        monthlyUsed: balance.monthlyUsed,
        monthlyAllocation: balance.monthlyAllocation,
        lifetime: balance.lifetime,
        walletType: balance.walletType,
      });
    }

    // ---- Write / mutate tools ----

    case "create_gateway": {
      const gwName = args.name as string;
      const gwType = args.type as "TELEGRAM_BOT" | "DISCORD_BOT" | "SLACK_BOT" | "WHATSAPP_BOT";

      // Build credentials based on type
      let credentials: GatewayCredentials;
      if (gwType === "TELEGRAM_BOT") {
        const botToken = args.botToken as string | undefined;
        if (!botToken) {
          return JSON.stringify({
            success: false,
            error: "botToken is required for TELEGRAM_BOT gateways. Ask the user for their Telegram bot token from @BotFather.",
          });
        }
        credentials = { botToken };
      } else {
        return JSON.stringify({
          success: false,
          error: `Unknown gateway type: "${gwType}". Must be TELEGRAM_BOT, DISCORD_BOT, SLACK_BOT, or WHATSAPP_BOT.`,
        });
      }

      const request: CreateGatewayRequest = {
        name: gwName,
        type: gwType,
        credentials,
      };

      const created = await gatewayService.create(ctx, request);
      return JSON.stringify({
        success: true,
        message: `Gateway "${created.name}" (${created.type}) created successfully.`,
        gateway: {
          id: created.id,
          name: created.name,
          type: created.type,
          status: created.status,
        },
      });
    }

    case "delete_gateway": {
      const gatewayId = args.gatewayId as string;
      await gatewayService.delete(ctx, gatewayId);
      return JSON.stringify({
        success: true,
        message: `Gateway "${gatewayId}" deleted successfully.`,
      });
    }

    case "update_gateway": {
      const gwId = args.gatewayId as string;
      const updateData: UpdateGatewayRequest = {};

      if (args.name) updateData.name = args.name as string;

      // Build credentials if any credential field provided
      if (args.botToken) {
        updateData.credentials = { botToken: args.botToken as string };
      }

      const updated = await gatewayService.update(ctx, gwId, updateData);
      return JSON.stringify({
        success: true,
        message: `Gateway "${updated.name}" updated successfully.`,
        gateway: {
          id: updated.id,
          name: updated.name,
          type: updated.type,
          status: updated.status,
        },
      });
    }

    case "update_custom_plugin": {
      const pluginId = args.pluginId as string;
      const updateFields: Record<string, unknown> = {};
      if (args.name) updateFields.name = args.name;
      if (args.description) updateFields.description = args.description;
      if (args.code) updateFields.code = args.code;
      if (args.category) updateFields.category = args.category;

      const updated = await pluginService.updateCustomPlugin(ctx, pluginId, updateFields);
      return JSON.stringify({
        success: true,
        message: `Plugin "${updated.name}" updated successfully.`,
        plugin: {
          id: updated.id,
          slug: updated.slug,
          name: updated.name,
        },
      });
    }

    case "delete_custom_plugin": {
      const pluginId = args.pluginId as string;
      await pluginService.deleteCustomPlugin(ctx, pluginId);
      return JSON.stringify({
        success: true,
        message: `Custom plugin "${pluginId}" deleted successfully.`,
      });
    }

    case "uninstall_plugin": {
      const userPluginId = args.userPluginId as string;
      await pluginService.uninstallPlugin(ctx, userPluginId);
      return JSON.stringify({
        success: true,
        message: `Plugin "${userPluginId}" uninstalled successfully.`,
      });
    }

    default:
      throw new Error(`Unknown platform tool: "${name}"`);
  }
}

// ===========================================
// Composite Tool Implementations
// ===========================================

/**
 * Execute a shell command in the workspace container.
 *
 * Uses terminal.create to start a PTY session, sends the command,
 * collects output via bridge events, then closes the session.
 *
 * For simpler commands, wraps them to capture stdout/stderr cleanly.
 */
async function executeRunCommand(
  args: Record<string, unknown>,
  workspaceId: string,
  ctx: ServiceContext,
): Promise<string> {
  const command = args.command as string;
  const cwd = (args.cwd as string) || undefined;

  // Use a wrapper approach: write a temp script that captures output
  // This is simpler than managing PTY sessions for blocking commands.
  // We leverage the existing file.write + terminal approach:
  //
  // Strategy: Use package.install's underlying exec pattern by
  // writing the command to a shell script, executing it, and reading output.
  //
  // Simpler approach: use the bridge's `send` with a temporary shell execution.
  // Since the bridge agent's terminal is PTY-based (async), we use a
  // wrapper that captures output synchronously via file operations.

  const scriptId = `__agent_cmd_${Date.now()}`;
  // Paths are RELATIVE to workspace root (bridge agent prepends /workspace/).
  // Inside container bash commands use the absolute form: /workspace/.tmp/...
  const scriptRelPath = `.tmp/${scriptId}.sh`;
  const outputRelPath = `.tmp/${scriptId}.out`;
  const exitRelPath   = `.tmp/${scriptId}.exit`;
  // Absolute paths as seen inside the container (for use in shell commands)
  const scriptAbsPath = `/workspace/.tmp/${scriptId}.sh`;
  const outputAbsPath = `/workspace/.tmp/${scriptId}.out`;
  const exitAbsPath   = `/workspace/.tmp/${scriptId}.exit`;

  // Build the wrapper script
  const cdPrefix = cwd ? `cd "${cwd}" 2>/dev/null || { echo "Directory not found: ${cwd}" > "${outputAbsPath}"; echo "1" > "${exitAbsPath}"; exit 1; }; ` : "";
  const scriptContent = `#!/bin/bash
${cdPrefix}(${command}) > "${outputAbsPath}" 2>&1
echo $? > "${exitAbsPath}"
`;

  try {
    // 1. Write the wrapper script (createDirs:true ensures .tmp/ is created)
    await workspaceService.sendBridgeAction(ctx, workspaceId, "file.write", {
      path: scriptRelPath,
      content: scriptContent,
      createDirs: true,
    });

    // 2. Execute it via a terminal session
    //    Create terminal, send bash command, wait for it to complete
    const termResult = await workspaceService.sendBridgeAction(
      ctx,
      workspaceId,
      "terminal.create",
      { cols: 200, rows: 50 },
    ) as { sessionId: string };

    const sessionId = termResult.sessionId;

    // Send the command to execute the script
    await workspaceService.sendBridgeAction(ctx, workspaceId, "terminal.input" as BridgeAction, {
      sessionId,
      data: `bash "${scriptAbsPath}" && echo "__AGENT_DONE__"\n`,
    });

    // 3. Poll for completion by checking if output file exists
    let output = "";
    let exitCode = "0";
    const maxWaitMs = 25_000; // 25 second max for command execution
    const pollIntervalMs = 500;
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
      await sleep(pollIntervalMs);

      try {
        // Check if exit code file exists (indicates command completed)
        const exitResult = await workspaceService.sendBridgeAction(
          ctx,
          workspaceId,
          "file.read",
          { path: exitRelPath },
        ) as { content?: string } | string;

        // If we got here, the file exists — command is done
        exitCode = (typeof exitResult === "string" ? exitResult : exitResult?.content ?? "0").trim();
        break;
      } catch {
        // File doesn't exist yet — command still running
        continue;
      }
    }

    // 4. Read the output
    try {
      const outResult = await workspaceService.sendBridgeAction(
        ctx,
        workspaceId,
        "file.read",
        { path: outputRelPath },
      ) as { content?: string } | string;

      output = typeof outResult === "string" ? outResult : outResult?.content ?? "";
    } catch {
      output = "(no output captured)";
    }

    // 5. Cleanup temp files (best-effort)
    try {
      await workspaceService.sendBridgeAction(ctx, workspaceId, "terminal.input" as BridgeAction, {
        sessionId,
        data: `rm -f "${scriptAbsPath}" "${outputAbsPath}" "${exitAbsPath}"\n`,
      });
      await sleep(200);
      await workspaceService.sendBridgeAction(ctx, workspaceId, "terminal.close", {
        sessionId,
      });
    } catch {
      // Cleanup failures are non-critical
    }

    // 6. Format output
    const exitCodeNum = parseInt(exitCode, 10);
    if (exitCodeNum !== 0) {
      return `Command exited with code ${exitCode}:\n${output}`;
    }
    return output || "(command completed with no output)";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute command: ${message}`);
  }
}

/**
 * Search for text across files in the workspace.
 * Implements grep via the run_command composite tool.
 */
async function executeSearchFiles(
  args: Record<string, unknown>,
  workspaceId: string,
  ctx: ServiceContext,
): Promise<string> {
  const pattern = args.pattern as string;
  const searchPath = (args.path as string) || ".";
  const filePattern = args.filePattern as string | undefined;
  const maxResults = Math.min((args.maxResults as number) || 50, 200);

  // Sanitize pattern — escape shell-special chars to prevent injection
  // Only allow safe grep patterns (letters, digits, common regex chars)
  const sanitizedPattern = pattern.replace(/[`$\\!;|&><]/g, "\\$&");

  // Build grep command
  let grepCmd = `grep -rn --color=never`;

  if (filePattern) {
    // Sanitize file pattern too
    const sanitizedFilePattern = filePattern.replace(/[`$\\!;|&><]/g, "\\$&");
    grepCmd += ` --include="${sanitizedFilePattern}"`;
  }

  // Exclude common non-source directories
  grepCmd += ` --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build`;

  grepCmd += ` "${sanitizedPattern}" "${searchPath}"`;
  grepCmd += ` | head -n ${maxResults}`;

  return executeRunCommand(
    { command: grepCmd },
    workspaceId,
    ctx,
  );
}

// ===========================================
// Payload Building
// ===========================================

/**
 * Convert tool arguments to the bridge action payload format.
 * Handles minor naming differences between tool params and bridge params.
 */
function buildBridgePayload(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (toolName) {
    case "read_file":
      return { path: args.path };

    case "write_file":
      return {
        path: args.path,
        content: args.content,
        createDirs: args.createDirs ?? true,
      };

    case "list_directory":
      return {
        path: args.path || ".",
        recursive: args.recursive ?? false,
      };

    case "delete_file":
      return { path: args.path };

    case "create_directory":
      return { path: args.path };

    case "file_stat":
      return { path: args.path };

    case "rename_file":
      return { oldPath: args.oldPath, newPath: args.newPath };

    case "git_status":
      return { dir: args.dir };

    case "git_clone":
      return {
        url: args.url,
        targetDir: args.targetDir,
        branch: args.branch,
        depth: args.depth,
      };

    case "install_package":
      return {
        packages: args.packages || [],
        dev: args.dev ?? false,
        cwd: args.cwd,
      };

    case "list_packages":
      return { cwd: args.cwd };

    case "system_stats":
      return {};

    default:
      // Pass through as-is
      return args;
  }
}

// ===========================================
// Result Formatting
// ===========================================

/**
 * Format bridge response data into a human-readable string for the AI.
 * The AI reads this to understand what happened and decide next steps.
 */
function formatBridgeResult(toolName: string, result: unknown, args: Record<string, unknown> = {}): string {
  if (result === null || result === undefined) {
    return "(no result)";
  }

  // If already a string, return directly
  if (typeof result === "string") {
    return result;
  }

  switch (toolName) {
    case "read_file": {
      const data = result as { content?: string };
      return data.content ?? JSON.stringify(result, null, 2);
    }

    case "write_file":
      return "File written successfully.";

    case "list_directory": {
      const entries = result as Array<{ name: string; type: string; size?: number }>;
      if (!Array.isArray(entries)) return JSON.stringify(result, null, 2);
      // Build the base dir prefix so the agent sees full relative paths like
      // "plugins/custom-xxx.js" rather than just "custom-xxx.js".
      // That prevents the agent from accidentally stripping the directory.
      const baseDir = typeof args.path === "string" && args.path !== "." && args.path !== "/" && args.path !== ""
        ? args.path.replace(/\/+$/, "") + "/"
        : "";
      if (entries.length === 0) return "(empty directory)";
      return entries
        .map((e) => {
          const typeIcon = e.type === "directory" ? "📁" : "📄";
          const sizeStr = e.size !== undefined ? ` (${formatBytes(e.size)})` : "";
          return `${typeIcon} ${baseDir}${e.name}${sizeStr}`;
        })
        .join("\n");
    }

    case "delete_file":
      return "Deleted successfully.";

    case "create_directory":
      return "Directory created successfully.";

    case "file_stat": {
      const stat = result as Record<string, unknown>;
      return Object.entries(stat)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    }

    case "rename_file":
      return "Renamed successfully.";

    case "git_status": {
      return JSON.stringify(result, null, 2);
    }

    case "git_clone":
      return "Repository cloned successfully.";

    case "install_package":
      return typeof result === "object" ? JSON.stringify(result, null, 2) : "Packages installed successfully.";

    case "list_packages":
      return JSON.stringify(result, null, 2);

    case "system_stats":
      return JSON.stringify(result, null, 2);

    default:
      return JSON.stringify(result, null, 2);
  }
}

// ===========================================
// Helpers
// ===========================================

function createTimeout(ms: number, toolName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Tool "${toolName}" timed out after ${ms}ms`)),
      ms,
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
