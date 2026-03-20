/**
 * Workflow Executor
 *
 * Runs a workflow step-by-step:
 * 1. Creates a WorkflowRun record
 * 2. Iterates steps in order
 * 3. Resolves input mappings via template engine
 * 4. Evaluates step conditions
 * 5. Executes plugin via PluginExecutor
 * 6. Records WorkflowStepRun entries
 * 7. Handles errors (stop/continue/retry)
 * 8. Marks run completed/failed
 *
 * @module modules/workflow/workflow.executor
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { gatewayRegistry, gatewayService } from "@/modules/gateway";
import { getPluginEntryPath } from "@/modules/plugin/plugin-deploy.service";
import type {
  DiscordInteraction,
  DiscordMessageCreate,
  SlackEventCallback,
  SlackInteractionPayload,
  TelegramUpdate,
  WhatsAppIncomingMessage,
} from "@/modules/plugin/plugin.events";
import {
  transformDiscordInteraction,
  transformDiscordMessageCreate,
  transformSlackEventCallback,
  transformSlackInteraction,
  transformTelegramUpdate,
  transformWhatsAppMessage,
} from "@/modules/plugin/plugin.events";
import {
  createGatewayAccessor,
  createPluginStorage,
  getPluginExecutor,
} from "@/modules/plugin/plugin.executor";
import type {
  PluginContext,
  PluginEvent,
  WorkflowMetadata,
} from "@/modules/plugin/plugin.interface";

import {
  buildTemplateContext,
  evaluateCondition,
  resolveInputMapping,
} from "./template.engine";
import { workflowService } from "./workflow.service";
import type {
  InputMapping,
  StepCondition,
  WorkflowExecutionContext,
} from "./workflow.types";

const execLogger = logger.child({ module: "workflow-executor" });

/** Maximum concurrent workflow runs per workflow (safety limit) */
const MAX_CONCURRENT_RUNS = 5;

/** Maximum step execution time in ms */
const STEP_TIMEOUT_MS = 60_000;

// ===========================================
// Per-run in-memory cache
// ===========================================

/**
 * Caches per-run data to avoid redundant DB queries across steps.
 * - gateways: loaded once, same for every step
 * - userPlugins: progressively cached as steps are built
 */
interface WorkflowRunCache {
  gateways: Array<{ id: string; name: string; type: string }> | null;
  userPlugins: Map<string, { id: string; isEnabled: boolean; config: unknown; entryFile: string | null }>;
}

// ===========================================
// Public API
// ===========================================

/**
 * Execute a workflow from a trigger event.
 *
 * @param workflowId - The workflow to run
 * @param triggeredBy - What triggered this (e.g. "telegram_message", "manual", "schedule")
 * @param triggerData - The raw trigger payload
 * @returns The workflow run ID
 */
export async function executeWorkflow(
  workflowId: string,
  triggeredBy: string,
  triggerData: unknown
): Promise<string> {
  // Load workflow with steps
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { plugin: true },
      },
    },
  });

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  if (!workflow.isEnabled || workflow.status !== "ACTIVE") {
    throw new Error(`Workflow is not active: ${workflowId}`);
  }

  if (workflow.steps.length === 0) {
    throw new Error(`Workflow has no steps: ${workflowId}`);
  }

  // Check that the bound gateway (if any) is connected
  if (workflow.gatewayId) {
    const gw = await prisma.gateway.findUnique({
      where: { id: workflow.gatewayId },
      select: { status: true },
    });
    if (gw && gw.status !== "CONNECTED") {
      throw new Error(
        `Workflow gateway is ${gw.status} — cannot execute workflow "${workflow.name}"`
      );
    }
  }

  // Safety: limit concurrent runs (atomic check + create to prevent race condition)
  const runId = await prisma.$transaction(async (tx) => {
    const runningCount = await tx.workflowRun.count({
      where: { workflowId, status: "running" },
    });
    if (runningCount >= MAX_CONCURRENT_RUNS) {
      throw new Error(`Too many concurrent runs for workflow ${workflowId}`);
    }

    const run = await tx.workflowRun.create({
      data: {
        workflowId,
        triggeredBy,
        triggerData: triggerData !== undefined ? (triggerData as object) : undefined,
        status: "running",
        startedAt: new Date(),
      },
    });
    return run.id;
  });

  execLogger.info(
    { workflowId, runId, triggeredBy, stepCount: workflow.steps.length },
    "Starting workflow execution"
  );

  const startTime = Date.now();

  // Per-run cache: avoids redundant DB queries across steps
  const runCache: WorkflowRunCache = { gateways: null, userPlugins: new Map() };

  // Build execution context
  const executionCtx: WorkflowExecutionContext = {
    workflowId,
    runId,
    userId: workflow.userId,
    organizationId: workflow.organizationId ?? undefined,
    trigger: {
      type: workflow.triggerType,
      data: triggerData,
      timestamp: new Date(),
    },
    variables: {},
    steps: {},
  };

  // Execute steps sequentially
  let lastOutput: unknown = undefined;

  for (const step of workflow.steps) {
    const stepStart = Date.now();
    const stepRunId = await workflowService.createStepRun(runId, step.order);

    try {
      // Build template context for this step
      const templateCtx = buildTemplateContext(
        triggerData,
        executionCtx.steps,
        step.order,
        {
          userId: workflow.userId,
          organizationId: workflow.organizationId ?? undefined,
          workflowId,
          runId,
        }
      );

      // Evaluate condition (skip step if condition not met)
      if (step.condition) {
        const condition = step.condition as unknown as StepCondition;
        const shouldRun = evaluateCondition(condition.if, templateCtx);
        if (!shouldRun) {
          await workflowService.skipStepRun(stepRunId);
          executionCtx.steps[step.order] = {
            input: null,
            output: null,
            status: "skipped",
            durationMs: Date.now() - stepStart,
          };
          execLogger.debug(
            { workflowId, runId, stepOrder: step.order },
            "Step skipped (condition not met)"
          );
          continue;
        }
      }

      // Resolve input mapping
      const inputMapping = (step.inputMapping ?? {}) as InputMapping;
      const resolvedInput = resolveInputMapping(inputMapping, templateCtx);

      // Build plugin context
      const stepCfg = (step.config as Record<string, unknown>) ?? {};
      const pluginContext = await buildPluginContext(
        step.pluginId,
        step.plugin.slug,
        workflow.userId,
        workflow.organizationId,
        stepCfg,
        step.gatewayId ?? workflow.gatewayId,
        stepCfg.gatewayActionsEnabled === true,
        runCache
      );

      // Build plugin event — reconstruct platform event from raw trigger data
      // so container plugins receive their expected event type (telegram.message, etc.)
      const pluginEvent = buildStepEvent(
        triggerData,
        resolvedInput,
        lastOutput,
        step.order,
        runId,
        workflow.gatewayId ?? undefined
      );

      // Execute with timeout and retry
      const result = await executeStepWithRetry(
        step.plugin.slug,
        pluginEvent,
        pluginContext,
        step.onError as "stop" | "continue" | "retry",
        step.maxRetries,
        typeof stepCfg.timeoutMs === "number" ? stepCfg.timeoutMs : undefined
      );

      const stepDuration = Date.now() - stepStart;

      if (result.success) {
        await workflowService.completeStepRun(stepRunId, result.output, stepDuration);
        lastOutput = result.output;
        executionCtx.steps[step.order] = {
          input: resolvedInput,
          output: result.output,
          status: "completed",
          durationMs: stepDuration,
        };
        execLogger.debug(
          { workflowId, runId, stepOrder: step.order, durationMs: stepDuration },
          "Step completed"
        );
      } else {
        // Step failed
        const stepDuration2 = Date.now() - stepStart;
        await workflowService.failStepRun(
          stepRunId,
          result.error ?? "Unknown error",
          stepDuration2
        );
        executionCtx.steps[step.order] = {
          input: resolvedInput,
          output: null,
          error: result.error ?? "Unknown error",
          status: "failed",
          durationMs: stepDuration2,
        };

        if (step.onError === "continue") {
          execLogger.warn(
            { workflowId, runId, stepOrder: step.order, error: result.error },
            "Step failed, continuing to next step"
          );
          continue;
        }

        // onError === "stop" (default)
        const totalDuration = Date.now() - startTime;
        await workflowService.failRun(
          runId,
          result.error ?? "Step execution failed",
          step.order,
          totalDuration
        );
        execLogger.error(
          { workflowId, runId, stepOrder: step.order, error: result.error },
          "Workflow failed at step"
        );
        return runId;
      }
    } catch (error) {
      const stepDuration = Date.now() - stepStart;
      const errorMsg = error instanceof Error ? error.message : String(error);

      await workflowService.failStepRun(stepRunId, errorMsg, stepDuration);
      executionCtx.steps[step.order] = {
        input: null,
        output: null,
        error: errorMsg,
        status: "failed",
        durationMs: stepDuration,
      };

      if (step.onError === "continue") {
        execLogger.warn(
          { workflowId, runId, stepOrder: step.order, error: errorMsg },
          "Step threw error, continuing"
        );
        continue;
      }

      const totalDuration = Date.now() - startTime;
      await workflowService.failRun(runId, errorMsg, step.order, totalDuration);
      execLogger.error(
        { workflowId, runId, stepOrder: step.order, error: errorMsg },
        "Workflow failed at step (exception)"
      );
      return runId;
    }
  }

  // All steps completed successfully
  const totalDuration = Date.now() - startTime;
  await workflowService.completeRun(runId, lastOutput, totalDuration);
  execLogger.info(
    { workflowId, runId, durationMs: totalDuration, stepCount: workflow.steps.length },
    "Workflow execution completed"
  );

  return runId;
}

// ===========================================
// Internal helpers
// ===========================================

/**
 * Build the PluginEvent for a workflow step.
 *
 * If the trigger came from a platform webhook (Telegram, Discord, Slack, WhatsApp),
 * reconstructs the original platform event using the raw update data stored in
 * triggerData.rawUpdate. This allows container plugins to receive their expected
 * event type (e.g. "telegram.message") instead of the generic "workflow.step".
 *
 * For manual/schedule/webhook triggers (no rawUpdate), falls back to "workflow.step".
 * In all cases, attaches _workflow metadata with structured input/output.
 */
function buildStepEvent(
  triggerData: unknown,
  resolvedInput: unknown,
  previousOutput: unknown,
  stepOrder: number,
  runId: string,
  defaultGatewayId: string | undefined
): PluginEvent {
  const td = triggerData as {
    source?: string;
    rawUpdate?: unknown;
    gatewayId?: string;
    message?: unknown;
  } | null;

  const workflowMeta: WorkflowMetadata = {
    input: resolvedInput,
    previousOutput,
    stepOrder,
    runId,
  };

  const gatewayId = td?.gatewayId ?? defaultGatewayId ?? "";

  // Try to reconstruct the original platform event from raw update data
  if (td?.rawUpdate && td.source) {
    let platformEvent: PluginEvent | null = null;

    switch (td.source) {
      case "telegram":
      case "telegram_callback":
        platformEvent = transformTelegramUpdate(
          td.rawUpdate as TelegramUpdate,
          gatewayId
        );
        break;

      case "discord": {
        // Discord interactions (commands, buttons) vs message creates
        const raw = td.rawUpdate as Record<string, unknown>;
        if (raw.type && typeof raw.type === "number") {
          platformEvent = transformDiscordInteraction(
            td.rawUpdate as DiscordInteraction,
            gatewayId
          );
        } else if (raw.content !== undefined || raw.author) {
          platformEvent = transformDiscordMessageCreate(
            td.rawUpdate as DiscordMessageCreate,
            gatewayId
          );
        }
        break;
      }

      case "slack": {
        // Slack event_callback vs interaction payloads
        const raw = td.rawUpdate as Record<string, unknown>;
        if (raw.type === "event_callback") {
          platformEvent = transformSlackEventCallback(
            td.rawUpdate as SlackEventCallback,
            gatewayId
          );
        } else {
          platformEvent = transformSlackInteraction(
            td.rawUpdate as SlackInteractionPayload,
            gatewayId
          );
        }
        break;
      }

      case "whatsapp":
        platformEvent = transformWhatsAppMessage(
          td.rawUpdate as WhatsAppIncomingMessage,
          undefined,
          gatewayId
        );
        break;
    }

    if (platformEvent) {
      return { ...platformEvent, _workflow: workflowMeta };
    }
  }

  // Fallback: manual/schedule/webhook triggers or missing raw data
  return {
    type: "workflow.step",
    data: {
      input: resolvedInput,
      previousOutput,
      gatewayId: defaultGatewayId,
      trigger: {
        type: td?.source ?? "unknown",
        data: triggerData,
      },
    },
    _workflow: workflowMeta,
  };
}

/**
 * Execute a single step with optional retry logic.
 */
async function executeStepWithRetry(
  pluginSlug: string,
  event: PluginEvent,
  context: PluginContext,
  onError: "stop" | "continue" | "retry",
  maxRetries: number,
  stepTimeoutMs?: number
): Promise<{ success: boolean; output?: unknown; error?: string }> {
  const executor = getPluginExecutor();
  const attempts = onError === "retry" ? maxRetries + 1 : 1;
  const timeoutMs = stepTimeoutMs && stepTimeoutMs > 0 ? stepTimeoutMs : STEP_TIMEOUT_MS;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      execLogger.debug(
        { pluginSlug, attempt, maxRetries },
        "Retrying step execution"
      );
      // Exponential backoff: 1s, 2s, 4s...
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
    }

    try {
      const result = await Promise.race([
        executor.execute(pluginSlug, event, context),
        timeout(timeoutMs),
      ]);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      execLogger.warn(
        { pluginSlug, attempt, error: lastError },
        "Step execution attempt failed"
      );
    }
  }

  return { success: false, error: lastError ?? "All retry attempts exhausted" };
}

/**
 * Build a PluginContext for executing a workflow step.
 * Uses per-run cache to avoid redundant gateway/userPlugin queries.
 */
async function buildPluginContext(
  pluginId: string,
  pluginSlug: string,
  userId: string,
  organizationId: string | null,
  config: Record<string, unknown>,
  gatewayId: string | null | undefined,
  gatewayActionsEnabled = false,
  runCache?: WorkflowRunCache
): Promise<PluginContext> {
  // Cache key for userPlugin: scoped to plugin + gateway
  const cacheKey = `${pluginId}:${gatewayId ?? "null"}`;
  let userPlugin = runCache?.userPlugins.get(cacheKey) ?? null;

  if (!userPlugin) {
    // Find the user's plugin installation (scoped to org + gateway for multi-instance)
    const found = await prisma.userPlugin.findFirst({
      where: { pluginId, userId, organizationId: organizationId ?? null, gatewayId: gatewayId ?? null },
    });

    if (!found) {
      // Auto-create UserPlugin so IPC service can resolve context for workflow-mode plugins
      execLogger.info(
        { pluginId, pluginSlug, userId },
        "Plugin not installed for user — auto-creating installation for workflow execution"
      );
      const created = await prisma.userPlugin.create({
        data: {
          userId,
          pluginId,
          organizationId: organizationId ?? null,
          gatewayId: gatewayId ?? null,
          config: {},
          isEnabled: true,
          entryFile: getPluginEntryPath(gatewayId, pluginSlug),
        },
      });
      userPlugin = { id: created.id, isEnabled: true, config: created.config, entryFile: created.entryFile };
    } else if (!found.isEnabled) {
      // Plugin is disabled — do NOT auto-re-enable; let the step fail gracefully
      throw new Error(`Plugin "${pluginSlug}" is disabled — skipping workflow step`);
    } else {
      userPlugin = { id: found.id, isEnabled: found.isEnabled, config: found.config, entryFile: found.entryFile };
    }

    // Store in cache for later steps that might use the same plugin+gateway
    runCache?.userPlugins.set(cacheKey, userPlugin);
  }

  const userPluginId = userPlugin.id;

  // Merge static config from plugin installation with step-level overrides
  const mergedConfig = {
    ...((userPlugin.config as Record<string, unknown>) ?? {}),
    ...config,
  };

  // Load gateways for the user (cached per-run)
  let gateways: Array<{ id: string; name: string; type: string }>;
  if (runCache?.gateways) {
    gateways = runCache.gateways;
  } else {
    gateways = await prisma.gateway.findMany({
      where: { userId },
      select: { id: true, name: true, type: true },
    });
    if (runCache) runCache.gateways = gateways;
  }

  // Gateway actions: muted by default to treat plugins as services.
  // When gatewayActionsEnabled is true, the plugin can send messages to the platform.
  const executeGateway = gatewayActionsEnabled && gatewayId
    ? async (gId: string, action: string, params: unknown) => {
        const gw = await prisma.gateway.findUnique({ where: { id: gId } });
        if (!gw) throw new Error(`Gateway not found: ${gId}`);
        const provider = gatewayRegistry.get(gw.type);
        const credentials = gatewayService.getDecryptedCredentials(gw);
        try {
          return await provider.execute(gId, action, params);
        } catch (execErr) {
          const msg = execErr instanceof Error ? execErr.message : "";
          if (msg.includes("not connected") || msg.includes("Not connected")) {
            await provider.connect(gId, credentials, (gw.config as Record<string, unknown>) ?? {});
            return provider.execute(gId, action, params);
          }
          throw execErr;
        }
      }
    : async (_gId: string, action: string, params: unknown) => {
        // Muted: log and return mock success so plugins don't crash
        execLogger.debug(
          { pluginSlug, action, gatewayActionsEnabled },
          "Gateway action suppressed (workflow service mode)"
        );
        return { ok: true, muted: true, action, params };
      };

  // Create accessor
  const gatewayAccessor = createGatewayAccessor(
    userId,
    gateways.map((g) => ({ id: g.id, name: g.name, type: g.type })),
    executeGateway
  );

  // Entry file for the plugin (prefer DB value, fall back to computed bot-dir path)
  const entryFile = userPlugin.entryFile ?? getPluginEntryPath(gatewayId, pluginSlug);

  return {
    userId,
    organizationId: organizationId ?? undefined,
    config: mergedConfig,
    userPluginId,
    entryFile,
    gateways: gatewayAccessor,
    storage: createPluginStorage(userPluginId, userId),
    logger: logger.child({ plugin: pluginSlug, workflow: true }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Step execution timed out after ${ms}ms`)), ms);
  });
}
