/**
 * Cursor Workflow Tools — Tool Execution Handlers for Workflow Mutations
 *
 * Implements the 8 workflow manipulation tools used by Cursor Assistant
 * when the user is in Studio mode (workflowContext is present).
 *
 * All tools call the workflowService directly (server-side Prisma),
 * avoiding HTTP round-trips. Access control is enforced by passing
 * the userId/orgId from the authenticated session.
 *
 * @module modules/cursor/cursor-workflow-tools
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { executeWorkflow } from "@/modules/workflow/workflow.executor";
import { workflowService } from "@/modules/workflow/workflow.service";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";
import type { WorkflowContext } from "./cursor-worker-runner";

const wfLog = logger.child({ module: "cursor", capability: "workflow-tools" });

/**
 * Redis TTL for cached `list_available_plugins` results, in seconds.
 * Short by design: catalog/install changes during a chat session should
 * become visible quickly, but the same call within a single agent loop
 * (which can re-invoke the tool 2-3 times) should hit cache.
 */
const LIST_PLUGINS_CACHE_TTL_SEC = parseInt(
  process.env.CURSOR_LIST_PLUGINS_CACHE_TTL_SEC ?? "60",
  10,
);

function listPluginsCacheKey(userId: string, query: string): string {
  // Bake a v1 prefix so we can roll the format without touching Redis.
  // Hash-tag the userId so the key shape stays cluster-safe (single slot
  // per user).
  return `cursor:list-plugins:v1:{${userId}}:${query.toLowerCase().trim()}`;
}

/**
 * Invalidate every cached `list_available_plugins` entry for a user.
 *
 * Called from plugin install/uninstall paths so a freshly-installed plugin
 * (or a removal) shows up in the next agent call instead of waiting for
 * the 60-second TTL. Cluster-safe: the key prefix has the userId
 * hash-tagged, so the SCAN runs on a single slot.
 *
 * Best-effort — never throws. Cache misses are cheap; re-populating from
 * the next DB query is the worst case.
 */
export async function invalidateListPluginsCacheForUser(userId: string): Promise<void> {
  const pattern = `cursor:list-plugins:v1:{${userId}}:*`;
  try {
    // ioredis exposes scanStream on both single-node and cluster clients.
    // Cast through a structural shim to avoid a hard dep on ioredis types.
    const client = redis as unknown as {
      scanStream?: (opts: { match: string; count: number }) => NodeJS.ReadableStream;
    };
    if (typeof client.scanStream !== "function") {
      // Fallback: best-effort DEL of the empty-query key (the most common
      // shape — Builder typically calls with no query). Other entries
      // self-evict on TTL.
      await redis.del(listPluginsCacheKey(userId, ""));
      return;
    }
    const stream = client.scanStream({ match: pattern, count: 100 });
    const matched: string[] = [];
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const k of keys) matched.push(k);
    }
    if (matched.length > 0) {
      // Chunk to bound the per-call payload size. All keys share the
      // same hash slot (per F-8 hash-tag design) so DEL is cluster-safe.
      const chunkSize = 100;
      for (let i = 0; i < matched.length; i += chunkSize) {
        const chunk = matched.slice(i, i + chunkSize);
        await redis.del(...chunk);
      }
    }
  } catch (err) {
    wfLog.warn(
      { err, userId },
      "invalidateListPluginsCacheForUser failed — relying on TTL expiry",
    );
  }
}

/**
 * Extract config field names from a plugin's configSchema for compact display.
 * Returns null if no schema or empty schema.
 */
function formatConfigFields(configSchema: unknown): string | null {
  if (!configSchema || typeof configSchema !== "object") return null;
  const schema = configSchema as Record<string, unknown>;
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props || Object.keys(props).length === 0) return null;
  const fields = Object.keys(props).slice(0, 8);
  const suffix = Object.keys(props).length > 8 ? ", ..." : "";
  return fields.join(", ") + suffix;
}

interface ToolExecResult {
  result: string;
}

interface WorkflowToolContext {
  userId: string;
  organizationId: string | null;
  workflowContext: WorkflowContext;
}

/**
 * Execute a workflow tool. Returns a result string or null if the tool
 * name is not a workflow tool.
 */
export async function executeWorkflowTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: WorkflowToolContext,
): Promise<ToolExecResult | null> {
  const owner = {
    userId: ctx.userId,
    organizationId: ctx.organizationId ?? undefined,
  };
  const wfId = ctx.workflowContext.workflowId;

  switch (toolName) {
    case "add_workflow_step": {
      const pluginId = args.pluginId as string | undefined;
      const order = args.order as number | undefined;
      if (!pluginId) return { result: "Error: pluginId is required" };
      if (order === undefined) return { result: "Error: order is required" };

      try {
        // Dedup check: if this plugin is already a step in the workflow, don't add a duplicate.
        const existing = await prisma.workflowStep.findFirst({
          where: { workflowId: wfId, pluginId },
          select: { id: true, name: true, order: true },
        });
        if (existing) {
          wfLog.info({ wfId, pluginId, stepId: existing.id }, "Plugin already a step in workflow — skipping duplicate insert");
          return {
            result: `Plugin is already in this workflow as step "${existing.name || "Untitled"}" (ID: ${existing.id}, Order: ${existing.order}). No duplicate step added.`,
          };
        }

        const step = await workflowService.addStep(owner, wfId, {
          pluginId,
          order,
          name: (args.name as string) || undefined,
          config: (args.config as Record<string, unknown>) || undefined,
        });
        wfLog.info({ wfId, stepId: step.id, pluginId, order }, "Workflow step added via Cursor");
        return {
          result: `Step added successfully. ID: ${step.id}, Name: "${step.name || "Untitled"}", Order: ${step.order}. The workflow canvas will refresh.`,
        };
      } catch (err) {
        return { result: `Error adding step: ${(err as Error).message}` };
      }
    }

    case "remove_workflow_step": {
      const stepId = args.stepId as string | undefined;
      if (!stepId) return { result: "Error: stepId is required" };

      try {
        await workflowService.deleteStep(owner, wfId, stepId);
        wfLog.info({ wfId, stepId }, "Workflow step removed via Cursor");
        return { result: `Step ${stepId} removed successfully. The workflow canvas will refresh.` };
      } catch (err) {
        return { result: `Error removing step: ${(err as Error).message}` };
      }
    }

    case "update_workflow_step": {
      const stepId = args.stepId as string | undefined;
      if (!stepId) return { result: "Error: stepId is required" };

      try {
        const updateData: Record<string, unknown> = {};
        if (args.name !== undefined) updateData.name = args.name;
        if (args.config !== undefined) updateData.config = args.config;
        if (args.isEnabled !== undefined) updateData.isEnabled = args.isEnabled;

        const step = await workflowService.updateStep(owner, wfId, stepId, updateData);
        wfLog.info({ wfId, stepId, updates: Object.keys(updateData) }, "Workflow step updated via Cursor");
        return {
          result: `Step "${step.name || stepId}" updated successfully (${Object.keys(updateData).join(", ")}). The workflow canvas will refresh.`,
        };
      } catch (err) {
        return { result: `Error updating step: ${(err as Error).message}` };
      }
    }

    case "reorder_workflow_step": {
      const stepId = args.stepId as string | undefined;
      const newOrder = args.newOrder as number | undefined;
      if (!stepId) return { result: "Error: stepId is required" };
      if (newOrder === undefined) return { result: "Error: newOrder is required" };

      try {
        const step = await workflowService.updateStep(owner, wfId, stepId, { order: newOrder });
        wfLog.info({ wfId, stepId, newOrder }, "Workflow step reordered via Cursor");
        return {
          result: `Step "${step.name || stepId}" moved to position ${newOrder}. The workflow canvas will refresh.`,
        };
      } catch (err) {
        return { result: `Error reordering step: ${(err as Error).message}` };
      }
    }

    case "toggle_workflow_step": {
      const stepId = args.stepId as string | undefined;
      const isEnabled = args.isEnabled as boolean | undefined;
      if (!stepId) return { result: "Error: stepId is required" };
      if (isEnabled === undefined) return { result: "Error: isEnabled is required" };

      try {
        await workflowService.updateStep(owner, wfId, stepId, { isEnabled });
        wfLog.info({ wfId, stepId, isEnabled }, "Workflow step toggled via Cursor");
        return {
          result: `Step ${stepId} ${isEnabled ? "enabled" : "disabled"} successfully. The workflow canvas will refresh.`,
        };
      } catch (err) {
        return { result: `Error toggling step: ${(err as Error).message}` };
      }
    }

    case "update_workflow_trigger": {
      const triggerType = args.triggerType as string | undefined;
      if (!triggerType) return { result: "Error: triggerType is required" };

      try {
        const wf = await workflowService.updateWorkflow(owner, wfId, {
          triggerType: triggerType as "BOT_MESSAGE" | "TELEGRAM_MESSAGE" | "DISCORD_MESSAGE" | "SLACK_MESSAGE" | "WHATSAPP_MESSAGE" | "WEBHOOK" | "SCHEDULE" | "MANUAL",
          triggerConfig: (args.triggerConfig as Record<string, unknown>) || undefined,
        });
        wfLog.info({ wfId, triggerType }, "Workflow trigger updated via Cursor");
        return {
          result: `Trigger changed to ${triggerType} for workflow "${wf.name}". The workflow canvas will refresh.`,
        };
      } catch (err) {
        return { result: `Error updating trigger: ${(err as Error).message}` };
      }
    }

    case "list_available_plugins": {
      const query = (args.query as string) || "";

      // Read-through Redis cache. Cache HIT == direct return of the formatted
      // string we built last time. Same caller, same query, within
      // CURSOR_LIST_PLUGINS_CACHE_TTL_SEC, so the result is identical and
      // we avoid both the DB hit AND the per-row formatting work.
      const cacheKey = listPluginsCacheKey(ctx.userId, query);
      try {
        const cached = await redis.get(cacheKey);
        if (typeof cached === "string" && cached.length > 0) {
          return { result: cached };
        }
      } catch (err) {
        // Redis outage — fall through to DB. Don't fail the tool call on
        // cache infrastructure problems.
        wfLog.warn(
          { err, cacheKey },
          "list_available_plugins cache GET failed — falling back to DB",
        );
      }

      try {
        // Get user's installed plugins that can be used as workflow steps
        const userPlugins = await prisma.userPlugin.findMany({
          where: {
            userId: ctx.userId,
            isEnabled: true,
          },
          include: {
            plugin: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                category: true,
                configSchema: true,
              },
            },
          },
          take: 30,
        });

        let plugins = userPlugins
          .filter((up) => up.plugin)
          .map((up) => ({
            id: up.plugin.id,
            name: up.plugin.name,
            slug: up.plugin.slug,
            description: up.plugin.description || "",
            category: up.plugin.category || "general",
            configFields: formatConfigFields(up.plugin.configSchema),
          }));

        // Filter by query if provided
        if (query) {
          const lower = query.toLowerCase();
          plugins = plugins.filter(
            (p) =>
              p.name.toLowerCase().includes(lower) ||
              p.slug.toLowerCase().includes(lower) ||
              p.description.toLowerCase().includes(lower),
          );
        }

        const result =
          plugins.length === 0
            ? query
              ? `No installed plugins match "${query}".`
              : "No installed plugins found."
            : `Available plugins (${plugins.length}):\n${plugins
                .map((p) => {
                  const cfg = p.configFields ? ` [config: ${p.configFields}]` : "";
                  return `- ${p.name} (slug: ${p.slug}, id: ${p.id}) — ${p.description || p.category}${cfg}`;
                })
                .join("\n")}`;

        // Best-effort write to cache. SET-EX so the entry self-evicts even
        // if our explicit invalidation paths miss.
        try {
          await redis.set(cacheKey, result, "EX", LIST_PLUGINS_CACHE_TTL_SEC);
        } catch (err) {
          wfLog.warn(
            { err, cacheKey },
            "list_available_plugins cache SET failed — cache will repopulate on next call",
          );
        }

        return { result };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }

    case "test_workflow": {
      try {
        const params = (args.params as Record<string, unknown>) || {};
        const dryRun = args.dryRun === true;
        const runId = await executeWorkflow(wfId, "manual", params, { dryRun });
        wfLog.info({ wfId, runId, dryRun }, "Workflow test triggered via Cursor");
        return {
          result: dryRun
            ? `Workflow dry-run completed. Run ID: ${runId}. No real messages were sent. Check the run history for simulated results.`
            : `Workflow test triggered successfully. Run ID: ${runId}. Check the run history for results.`,
        };
      } catch (err) {
        return { result: `Error triggering test: ${(err as Error).message}` };
      }
    }

    case "validate_workflow": {
      try {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Load workflow with steps from DB for fresh state
        const workflow = await prisma.workflow.findUnique({
          where: { id: wfId },
          include: {
            steps: { orderBy: { order: "asc" }, include: { plugin: { select: { id: true, slug: true, name: true } } } },
          },
        });

        if (!workflow) return { result: "Error: workflow not found in database" };

        // Check 1: Has at least 1 step
        if (workflow.steps.length === 0) {
          errors.push("Workflow has no steps — add at least one plugin step");
        }

        // Check 2: Trigger is configured
        const triggerConfig = workflow.triggerConfig as Record<string, unknown> | null;
        if (!triggerConfig || Object.keys(triggerConfig).length === 0) {
          errors.push("Trigger has no configuration — set trigger settings");
        }

        // Check 3: Gateway bound for triggers that require one
        const gatewayTriggers = ["TELEGRAM_MESSAGE", "TELEGRAM_CALLBACK", "DISCORD_MESSAGE", "DISCORD_COMMAND", "SLACK_MESSAGE", "SLACK_COMMAND", "WHATSAPP_MESSAGE", "BOT_MESSAGE"];
        if (gatewayTriggers.includes(workflow.triggerType) && !workflow.gatewayId) {
          errors.push(`Trigger type "${workflow.triggerType}" requires a gateway — bind a gateway to this workflow`);
        }

        // Check 4: All steps reference valid plugins
        const userPluginIds = new Set(
          (await prisma.userPlugin.findMany({
            where: { userId: ctx.userId, isEnabled: true },
            select: { pluginId: true },
          })).map((up) => up.pluginId),
        );

        for (const step of workflow.steps) {
          if (!step.plugin) {
            errors.push(`Step ${step.order}: plugin ID "${step.pluginId}" not found in database`);
          } else if (!userPluginIds.has(step.pluginId)) {
            warnings.push(`Step ${step.order} ("${step.plugin.name}"): plugin not in your installed plugins — may not execute`);
          }
        }

        // Check 5: Step ordering (no gaps)
        if (workflow.steps.length > 0) {
          const orders = workflow.steps.map((s) => s.order);
          for (let i = 0; i < orders.length; i++) {
            if (orders[i] !== i) {
              warnings.push(`Step ordering has gaps — expected order ${i} but found ${orders[i]}`);
              break;
            }
          }
        }

        // Check 6: Disabled steps between enabled ones
        if (workflow.steps.length > 1) {
          let foundDisabled = false;
          for (const step of workflow.steps) {
            if (!step.isEnabled) {
              foundDisabled = true;
            } else if (foundDisabled) {
              warnings.push("There are disabled steps between enabled ones — this may cause unexpected behavior");
              break;
            }
          }
        }

        // Build result
        if (errors.length === 0 && warnings.length === 0) {
          return { result: `✅ Workflow validation passed — ${workflow.steps.length} step(s), trigger: ${workflow.triggerType}, no issues found.` };
        }

        const parts: string[] = [];
        if (errors.length > 0) {
          parts.push(`❌ Errors (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`);
        }
        if (warnings.length > 0) {
          parts.push(`⚠️ Warnings (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
        }
        parts.push(`\nSummary: ${workflow.steps.length} step(s), trigger: ${workflow.triggerType}, gateway: ${workflow.gatewayId ? "bound" : "NOT bound"}`);

        return { result: parts.join("\n") };
      } catch (err) {
        return { result: `Error validating workflow: ${(err as Error).message}` };
      }
    }

    case "read_plugin_file": {
      const stepId = args.stepId as string | undefined;
      const filePath = args.path as string | undefined;
      if (!stepId) return { result: "Error: stepId is required" };
      if (!filePath) return { result: "Error: path is required" };

      const step = ctx.workflowContext.steps.find((s) => s.id === stepId);
      if (!step) return { result: `Error: step ${stepId} not found in workflow` };
      if (!step.entryFile) return { result: `Error: step "${step.name}" has no entry file` };

      // Derive plugin directory from entry file
      const pluginDir = step.entryFile.includes("/")
        ? step.entryFile.substring(0, step.entryFile.lastIndexOf("/"))
        : "";
      const fullPath = pluginDir ? `${pluginDir}/${filePath}` : filePath;

      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: workspace not running" };
        const result = await withBridgeRetry(
          () => bridge.client.fileRead(fullPath) as Promise<{ content?: string }>,
          `read_plugin_file:${fullPath}`,
        );
        wfLog.info({ wfId, stepId, path: fullPath }, "Plugin file read via Cursor");
        const content = result?.content ?? "(empty file)";
        // Truncate large files
        return { result: content.length > 15000 ? content.slice(0, 15000) + "\n\n... (truncated)" : content };
      } catch {
        return { result: `Error: could not read file "${fullPath}"` };
      }
    }

    case "write_plugin_file": {
      const stepId = args.stepId as string | undefined;
      const filePath = args.path as string | undefined;
      const content = args.content as string | undefined;
      if (!stepId) return { result: "Error: stepId is required" };
      if (!filePath) return { result: "Error: path is required" };
      if (content === undefined) return { result: "Error: content is required" };

      const step = ctx.workflowContext.steps.find((s) => s.id === stepId);
      if (!step) return { result: `Error: step ${stepId} not found in workflow` };
      if (!step.entryFile) return { result: `Error: step "${step.name}" has no entry file` };

      // Derive plugin directory from entry file
      const pluginDir = step.entryFile.includes("/")
        ? step.entryFile.substring(0, step.entryFile.lastIndexOf("/"))
        : "";
      const fullPath = pluginDir ? `${pluginDir}/${filePath}` : filePath;

      try {
        const bridge = await getBridgeClient(ctx.userId, ctx.organizationId);
        if (!bridge) return { result: "Error: workspace not running" };
        await withBridgeRetry(
          () => bridge.client.fileWrite(fullPath, content, true),
          `write_plugin_file:${fullPath}`,
        );
        wfLog.info({ wfId, stepId, path: fullPath }, "Plugin file written via Cursor");
        return { result: `File "${filePath}" written successfully (${content.length} bytes).` };
      } catch (err) {
        return { result: `Error writing file: ${(err as Error).message}` };
      }
    }

    default:
      return null;
  }
}
