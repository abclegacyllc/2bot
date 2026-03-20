/**
 * Workflow Trigger Handlers
 *
 * Matches incoming events against active workflows and fires the executor.
 * Uses unified BOT_MESSAGE trigger type for all gateway-originating events.
 *
 * @module modules/workflow/workflow.triggers
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { executeWorkflow } from "./workflow.executor";
import type {
  DiscordCommandTriggerConfig,
  DiscordMessageTriggerConfig,
  SlackCommandTriggerConfig,
  SlackMessageTriggerConfig,
  TelegramCallbackTriggerConfig,
  TelegramMessageTriggerConfig,
  WhatsAppMessageTriggerConfig,
} from "./workflow.types";

const triggerLogger = logger.child({ module: "workflow-triggers" });

// ===========================================
// Unified Bot Message Trigger
// ===========================================

/**
 * Unified trigger check for all gateway-originating events.
 * Queries workflows with BOT_MESSAGE trigger type bound to the given gateway.
 *
 * @param gatewayId - The gateway that received the message
 * @param userId - Owner of the gateway
 * @param organizationId - Org context (if any)
 * @param eventSource - Platform identifier (e.g. "telegram", "discord", "slack", "whatsapp")
 * @param messageData - The raw message/event data
 * @param matchFn - Optional platform-specific matching function
 */
export async function checkBotMessageTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  eventSource: string,
  messageData: Record<string, unknown>,
  matchFn?: (config: Record<string, unknown>, data: Record<string, unknown>) => boolean,
  rawUpdate?: unknown
): Promise<boolean> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: {
        userId,
        gatewayId,
        triggerType: "BOT_MESSAGE",
        status: "ACTIVE",
        isEnabled: true,
      },
      select: {
        id: true,
        triggerConfig: true,
      },
    });

    if (workflows.length === 0) return false;

    let matched = false;
    for (const workflow of workflows) {
      const config = (workflow.triggerConfig ?? {}) as Record<string, unknown>;

      // If a match function is provided, use it for filtering; otherwise match all
      if (matchFn && !matchFn(config, messageData)) {
        continue;
      }

      matched = true;
      triggerLogger.info(
        { workflowId: workflow.id, gatewayId, eventSource },
        "Bot message matched workflow trigger"
      );

      executeWorkflow(workflow.id, `bot_message_${eventSource}`, {
        message: messageData,
        gatewayId,
        source: eventSource,
        rawUpdate,
      }).catch((err) => {
        triggerLogger.error(
          { workflowId: workflow.id, error: err instanceof Error ? err.message : String(err) },
          "Workflow execution failed from bot message trigger"
        );
      });
    }
    return matched;
  } catch (error) {
    triggerLogger.error(
      { gatewayId, eventSource, error: error instanceof Error ? error.message : String(error) },
      "Failed to check bot message triggers"
    );
    return false;
  }
}

// ===========================================
// Telegram Message Trigger
// ===========================================

/**
 * Check if any active workflows should fire for this Telegram message event.
 * Delegates to unified BOT_MESSAGE trigger.
 */
export async function checkTelegramMessageTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  messageData: {
    text?: string;
    chatType?: string;
    chatId?: number;
    messageId?: number;
    from?: { id: number; firstName?: string; lastName?: string; username?: string };
  },
  rawUpdate?: unknown
): Promise<boolean> {
  return checkBotMessageTrigger(
    gatewayId,
    userId,
    organizationId,
    "telegram",
    messageData as unknown as Record<string, unknown>,
    (config, data) => matchesTelegramTrigger(
      config as TelegramMessageTriggerConfig,
      data as { text?: string; chatType?: string }
    ),
    rawUpdate
  );
}

/**
 * Check if a Telegram message matches a workflow's trigger config.
 */
function matchesTelegramTrigger(
  config: TelegramMessageTriggerConfig,
  message: { text?: string; chatType?: string }
): boolean {
  // Filter by chat type
  if (config.chatTypes && config.chatTypes.length > 0) {
    if (!message.chatType || !config.chatTypes.includes(message.chatType as "private" | "group" | "supergroup" | "channel")) {
      return false;
    }
  }

  // Filter by message type
  if (config.filterType && config.filterType !== "all") {
    if (config.filterType === "command") {
      if (!message.text || !message.text.startsWith("/")) return false;
    } else if (config.filterType === "text") {
      if (!message.text) return false;
    }
  }

  // Filter by command prefix
  if (config.commandPrefix) {
    if (!message.text || !message.text.startsWith(config.commandPrefix)) {
      return false;
    }
  }

  // Filter by text pattern (regex)
  if (config.textPattern) {
    if (!message.text) return false;
    try {
      const regex = new RegExp(config.textPattern);
      if (!regex.test(message.text)) return false;
    } catch {
      // Invalid regex in config — skip this filter
      triggerLogger.warn({ textPattern: config.textPattern }, "Invalid regex in trigger config");
    }
  }

  return true;
}

// ===========================================
// Telegram Callback Trigger
// ===========================================

/**
 * Check if any active workflows should fire for this Telegram callback query.
 * Delegates to unified BOT_MESSAGE trigger with callback-specific matching.
 */
export async function checkTelegramCallbackTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  callbackData: {
    data?: string;
    chatId?: number;
    messageId?: number;
    from?: { id: number; firstName?: string; lastName?: string; username?: string };
  },
  rawUpdate?: unknown
): Promise<boolean> {
  return checkBotMessageTrigger(
    gatewayId,
    userId,
    organizationId,
    "telegram_callback",
    callbackData as unknown as Record<string, unknown>,
    (config, data) => matchesTelegramCallbackTrigger(
      config as TelegramCallbackTriggerConfig,
      data as { data?: string }
    ),
    rawUpdate
  );
}

/**
 * Check if a Telegram callback query matches a workflow's trigger config.
 */
function matchesTelegramCallbackTrigger(
  config: TelegramCallbackTriggerConfig,
  callback: { data?: string }
): boolean {
  // Filter by exact data values
  if (config.dataValues && config.dataValues.length > 0) {
    if (!callback.data || !config.dataValues.includes(callback.data)) {
      return false;
    }
  }

  // Filter by data pattern (regex)
  if (config.dataPattern) {
    if (!callback.data) return false;
    try {
      const regex = new RegExp(config.dataPattern);
      if (!regex.test(callback.data)) return false;
    } catch {
      triggerLogger.warn({ dataPattern: config.dataPattern }, "Invalid regex in callback trigger config");
    }
  }

  return true;
}

// ===========================================
// Discord Message Trigger
// ===========================================

/**
 * Check if any active workflows should fire for this Discord message/interaction.
 * Delegates to unified BOT_MESSAGE trigger.
 */
export async function checkDiscordMessageTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  interactionData: {
    type?: number;
    data?: { name?: string; custom_id?: string };
    content?: string;
    channel_id?: string;
    guild_id?: string;
    author?: { id: string; username?: string };
    member?: { user?: { id: string; username?: string } };
    mentions?: Array<{ id: string }>;
  },
  rawUpdate?: unknown
): Promise<boolean> {
  const isCommand = interactionData.type === 2 || interactionData.type === 3;
  return checkBotMessageTrigger(
    gatewayId,
    userId,
    organizationId,
    "discord",
    interactionData as unknown as Record<string, unknown>,
    (config, data) => {
      if (isCommand) {
        return matchesDiscordCommandTrigger(
          config as DiscordCommandTriggerConfig,
          data as { type?: number; data?: { name?: string; custom_id?: string } }
        );
      }
      return matchesDiscordMessageTrigger(
        config as DiscordMessageTriggerConfig,
        data as { content?: string; channel_id?: string; mentions?: Array<{ id: string }> }
      );
    },
    rawUpdate
  );
}

function matchesDiscordMessageTrigger(
  config: DiscordMessageTriggerConfig,
  data: { content?: string; channel_id?: string; mentions?: Array<{ id: string }> }
): boolean {
  if (config.channelIds && config.channelIds.length > 0) {
    if (!data.channel_id || !config.channelIds.includes(data.channel_id)) return false;
  }
  if (config.mentionOnly && (!data.mentions || data.mentions.length === 0)) {
    return false;
  }
  if (config.textPattern && data.content) {
    try {
      if (!new RegExp(config.textPattern).test(data.content)) return false;
    } catch {
      triggerLogger.warn({ textPattern: config.textPattern }, "Invalid regex in Discord trigger config");
    }
  }
  return true;
}

function matchesDiscordCommandTrigger(
  config: DiscordCommandTriggerConfig,
  data: { type?: number; data?: { name?: string; custom_id?: string } }
): boolean {
  if (config.interactionTypes && config.interactionTypes.length > 0) {
    if (!data.type || !config.interactionTypes.includes(data.type)) return false;
  }
  if (config.commandName) {
    if (!data.data?.name || data.data.name !== config.commandName) return false;
  }
  return true;
}

// ===========================================
// Slack Message Trigger
// ===========================================

/**
 * Check if any active workflows should fire for this Slack event.
 * Delegates to unified BOT_MESSAGE trigger.
 */
export async function checkSlackMessageTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  payload: {
    type?: string;
    event?: {
      type?: string;
      text?: string;
      channel?: string;
      user?: string;
    };
    command?: string;
    text?: string;
    channel_id?: string;
    actions?: Array<{ action_id?: string }>;
  },
  rawUpdate?: unknown
): Promise<boolean> {
  const isCommand = payload.type === "slash_commands" ||
    payload.type === "block_actions" ||
    payload.type === "interactive_message";
  return checkBotMessageTrigger(
    gatewayId,
    userId,
    organizationId,
    "slack",
    payload as unknown as Record<string, unknown>,
    (config, data) => {
      if (isCommand) {
        return matchesSlackCommandTrigger(
          config as SlackCommandTriggerConfig,
          data as { command?: string; actions?: Array<{ action_id?: string }> }
        );
      }
      return matchesSlackMessageTrigger(
        config as SlackMessageTriggerConfig,
        data as { event?: { type?: string; text?: string; channel?: string } }
      );
    },
    rawUpdate
  );
}

function matchesSlackMessageTrigger(
  config: SlackMessageTriggerConfig,
  data: { event?: { type?: string; text?: string; channel?: string } }
): boolean {
  const event = data.event;
  if (!event) return false;

  if (config.eventTypes && config.eventTypes.length > 0) {
    if (!event.type || !config.eventTypes.includes(event.type)) return false;
  }
  if (config.mentionOnly && event.type !== "app_mention") {
    return false;
  }
  if (config.channelIds && config.channelIds.length > 0) {
    if (!event.channel || !config.channelIds.includes(event.channel)) return false;
  }
  if (config.textPattern && event.text) {
    try {
      if (!new RegExp(config.textPattern).test(event.text)) return false;
    } catch {
      triggerLogger.warn({ textPattern: config.textPattern }, "Invalid regex in Slack trigger config");
    }
  }
  return true;
}

function matchesSlackCommandTrigger(
  config: SlackCommandTriggerConfig,
  data: { command?: string; actions?: Array<{ action_id?: string }> }
): boolean {
  if (config.commandName && data.command) {
    if (data.command !== config.commandName) return false;
  }
  if (config.actionIds && config.actionIds.length > 0 && data.actions) {
    const receivedIds = data.actions.map((a) => a.action_id).filter(Boolean);
    if (!config.actionIds.some((id) => receivedIds.includes(id))) return false;
  }
  return true;
}

// ===========================================
// WhatsApp Message Trigger
// ===========================================

/**
 * Check if any active workflows should fire for this WhatsApp message.
 * Delegates to unified BOT_MESSAGE trigger.
 */
export async function checkWhatsAppMessageTrigger(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  messageData: {
    type?: string;
    text?: { body?: string };
    from?: string;
    id?: string;
    timestamp?: string;
  },
  rawUpdate?: unknown
): Promise<boolean> {
  return checkBotMessageTrigger(
    gatewayId,
    userId,
    organizationId,
    "whatsapp",
    messageData as unknown as Record<string, unknown>,
    (config, data) => matchesWhatsAppTrigger(
      config as WhatsAppMessageTriggerConfig,
      data as { type?: string; text?: { body?: string } }
    ),
    rawUpdate
  );
}

function matchesWhatsAppTrigger(
  config: WhatsAppMessageTriggerConfig,
  message: { type?: string; text?: { body?: string } }
): boolean {
  if (config.messageTypes && config.messageTypes.length > 0) {
    if (!message.type || !(config.messageTypes as string[]).includes(message.type)) {
      return false;
    }
  }
  if (config.textPattern) {
    const text = message.text?.body;
    if (!text) return false;
    try {
      if (!new RegExp(config.textPattern).test(text)) return false;
    } catch {
      triggerLogger.warn({ textPattern: config.textPattern }, "Invalid regex in WhatsApp trigger config");
    }
  }
  return true;
}

// ===========================================
// Webhook Trigger (external services)
// ===========================================

/**
 * Handle an incoming webhook trigger for a workflow.
 * Called from a dedicated route: POST /webhooks/workflow/:id
 *
 * @param workflowId - The workflow to trigger
 * @param requestData - The incoming HTTP request data
 */
export async function handleWebhookTrigger(
  workflowId: string,
  requestData: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
  }
): Promise<string> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    select: { id: true, triggerType: true, triggerConfig: true, status: true, isEnabled: true },
  });

  if (!workflow) {
    throw new Error("Workflow not found");
  }
  if (workflow.triggerType !== "WEBHOOK") {
    throw new Error("Workflow is not a webhook-triggered workflow");
  }
  if (!workflow.isEnabled || workflow.status !== "ACTIVE") {
    throw new Error("Workflow is not active");
  }

  triggerLogger.info({ workflowId }, "Webhook trigger received");

  return executeWorkflow(workflowId, "webhook", requestData);
}
