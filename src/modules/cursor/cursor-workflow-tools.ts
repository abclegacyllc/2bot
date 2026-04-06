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
import { executeWorkflow } from "@/modules/workflow/workflow.executor";
import { workflowService } from "@/modules/workflow/workflow.service";
import { getBridgeClient, withBridgeRetry } from "./cursor-bridge";
import type { WorkflowContext } from "./cursor-worker-runner";

const wfLog = logger.child({ module: "cursor", capability: "workflow-tools" });

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

        if (plugins.length === 0) {
          return { result: query ? `No installed plugins match "${query}".` : "No installed plugins found." };
        }

        const list = plugins
          .map((p) => `- ${p.name} (slug: ${p.slug}, id: ${p.id}) — ${p.description || p.category}`)
          .join("\n");

        return { result: `Available plugins (${plugins.length}):\n${list}` };
      } catch (err) {
        return { result: `Error listing plugins: ${(err as Error).message}` };
      }
    }

    case "test_workflow": {
      try {
        const params = (args.params as Record<string, unknown>) || {};
        const runId = await executeWorkflow(wfId, "manual", params);
        wfLog.info({ wfId, runId }, "Workflow test triggered via Cursor");
        return {
          result: `Workflow test triggered successfully. Run ID: ${runId}. Check the run history for results.`,
        };
      } catch (err) {
        return { result: `Error triggering test: ${(err as Error).message}` };
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
