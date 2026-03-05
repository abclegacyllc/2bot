/**
 * Plugin Event System
 *
 * Routes incoming events (Telegram webhooks, schedules, etc.) to
 * installed and enabled plugins. Handles event filtering based on
 * gateway requirements and plugin state.
 *
 * @module modules/plugin/plugin.events
 */

import type { GatewayType } from "@prisma/client";

import { decryptJson } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
    createGatewayAccessor,
    createPluginStorage,
    getPluginExecutor,
    registerPlugin,
} from "./plugin.executor";
import type {
    PluginContext,
    PluginEvent,
    PluginExecutionResult,
    TelegramCallbackEventData,
    TelegramChatMemberUpdatedEventData,
    TelegramChosenInlineResultEventData,
    TelegramInlineQueryEventData,
    TelegramMessageEventData,
    TelegramPollAnswerEventData,
    TelegramPollEventData,
} from "./plugin.interface";

const eventLogger = logger.child({ module: "plugin-events" });

// ===========================================
// Event Types
// ===========================================

/**
 * Telegram update event from webhook
 */
/**
 * Telegram user shape used in update payloads
 */
interface TelegramUpdateUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

/**
 * Telegram chat shape used in update payloads
 */
interface TelegramUpdateChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

/**
 * Telegram ChatMember shape (simplified)
 */
interface TelegramUpdateChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TelegramUpdateUser;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramUpdateChat;
    from?: TelegramUpdateUser;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
    };
    date: number;
    reply_to_message?: TelegramUpdate["message"];
  };
  callback_query?: {
    id: string;
    from: TelegramUpdateUser;
    message?: TelegramUpdate["message"];
    data?: string;
  };
  /** Fires when the bot's chat member status changes (bot added/removed from a chat) */
  my_chat_member?: {
    chat: TelegramUpdateChat;
    from: TelegramUpdateUser;
    date: number;
    old_chat_member: TelegramUpdateChatMember;
    new_chat_member: TelegramUpdateChatMember;
  };
  /** Fires when any chat member's status changes */
  chat_member?: {
    chat: TelegramUpdateChat;
    from: TelegramUpdateUser;
    date: number;
    old_chat_member: TelegramUpdateChatMember;
    new_chat_member: TelegramUpdateChatMember;
  };
  /** Fires when a user sends an inline query to the bot */
  inline_query?: {
    id: string;
    from: TelegramUpdateUser;
    query: string;
    offset: string;
    chat_type?: "sender" | "private" | "group" | "supergroup" | "channel";
  };
  /** Fires when a user picks an inline result */
  chosen_inline_result?: {
    result_id: string;
    from: TelegramUpdateUser;
    query: string;
    inline_message_id?: string;
  };
  /** Fires when a poll state changes (new votes, closed, etc.) */
  poll?: {
    id: string;
    question: string;
    options: Array<{ text: string; voter_count: number }>;
    total_voter_count: number;
    is_closed: boolean;
    is_anonymous: boolean;
    type: "regular" | "quiz";
    allows_multiple_answers: boolean;
    correct_option_id?: number;
    explanation?: string;
  };
  /** Fires when a user changes their answer in a non-anonymous poll */
  poll_answer?: {
    poll_id: string;
    user: TelegramUpdateUser;
    option_ids: number[];
  };
}

// ===========================================
// Event Transformation
// ===========================================

/**
 * Transform a Telegram update to a plugin event
 */
export function transformTelegramUpdate(
  update: TelegramUpdate,
  gatewayId: string
): PluginEvent | null {
  // Handle message events
  if (update.message) {
    const msg = update.message;
    const data: TelegramMessageEventData = {
      messageId: msg.message_id,
      chatId: msg.chat.id,
      chatType: msg.chat.type,
      from: msg.from
        ? {
            id: msg.from.id,
            isBot: msg.from.is_bot,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            username: msg.from.username,
          }
        : undefined,
      text: msg.text,
      photo: msg.photo?.map((p) => ({
        fileId: p.file_id,
        fileUniqueId: p.file_unique_id,
        width: p.width,
        height: p.height,
      })),
      document: msg.document
        ? {
            fileId: msg.document.file_id,
            fileUniqueId: msg.document.file_unique_id,
            fileName: msg.document.file_name,
            mimeType: msg.document.mime_type,
          }
        : undefined,
      date: msg.date,
      replyToMessage: msg.reply_to_message
        ? transformTelegramMessage(msg.reply_to_message)
        : undefined,
    };

    return {
      type: "telegram.message",
      data,
      gatewayId,
    };
  }

  // Handle callback query events
  if (update.callback_query) {
    const cb = update.callback_query;
    const data: TelegramCallbackEventData = {
      id: cb.id,
      chatId: cb.message?.chat.id ?? 0,
      from: {
        id: cb.from.id,
        isBot: cb.from.is_bot,
        firstName: cb.from.first_name,
        lastName: cb.from.last_name,
        username: cb.from.username,
      },
      message: cb.message ? transformTelegramMessage(cb.message) : undefined,
      data: cb.data,
    };

    return {
      type: "telegram.callback",
      data,
      gatewayId,
    };
  }

  // Handle bot's own chat member status changes (bot added/removed from chat)
  if (update.my_chat_member) {
    const member = update.my_chat_member;
    const data: TelegramChatMemberUpdatedEventData = {
      chatId: member.chat.id,
      chatType: member.chat.type,
      chatTitle: member.chat.title,
      from: transformUser(member.from),
      date: member.date,
      oldStatus: member.old_chat_member.status,
      newStatus: member.new_chat_member.status,
      oldMember: {
        userId: member.old_chat_member.user.id,
        isBot: member.old_chat_member.user.is_bot,
        firstName: member.old_chat_member.user.first_name,
        username: member.old_chat_member.user.username,
      },
      newMember: {
        userId: member.new_chat_member.user.id,
        isBot: member.new_chat_member.user.is_bot,
        firstName: member.new_chat_member.user.first_name,
        username: member.new_chat_member.user.username,
      },
    };

    return {
      type: "telegram.my_chat_member",
      data,
      gatewayId,
    };
  }

  // Handle any chat member status changes
  if (update.chat_member) {
    const member = update.chat_member;
    const data: TelegramChatMemberUpdatedEventData = {
      chatId: member.chat.id,
      chatType: member.chat.type,
      chatTitle: member.chat.title,
      from: transformUser(member.from),
      date: member.date,
      oldStatus: member.old_chat_member.status,
      newStatus: member.new_chat_member.status,
      oldMember: {
        userId: member.old_chat_member.user.id,
        isBot: member.old_chat_member.user.is_bot,
        firstName: member.old_chat_member.user.first_name,
        username: member.old_chat_member.user.username,
      },
      newMember: {
        userId: member.new_chat_member.user.id,
        isBot: member.new_chat_member.user.is_bot,
        firstName: member.new_chat_member.user.first_name,
        username: member.new_chat_member.user.username,
      },
    };

    return {
      type: "telegram.chat_member",
      data,
      gatewayId,
    };
  }

  // Handle inline queries
  if (update.inline_query) {
    const iq = update.inline_query;
    const data: TelegramInlineQueryEventData = {
      id: iq.id,
      from: transformUser(iq.from),
      query: iq.query,
      offset: iq.offset,
      chatType: iq.chat_type,
    };

    return {
      type: "telegram.inline_query",
      data,
      gatewayId,
    };
  }

  // Handle chosen inline results
  if (update.chosen_inline_result) {
    const cir = update.chosen_inline_result;
    const data: TelegramChosenInlineResultEventData = {
      resultId: cir.result_id,
      from: transformUser(cir.from),
      query: cir.query,
      inlineMessageId: cir.inline_message_id,
    };

    return {
      type: "telegram.chosen_inline_result",
      data,
      gatewayId,
    };
  }

  // Handle poll state updates
  if (update.poll) {
    const p = update.poll;
    const data: TelegramPollEventData = {
      pollId: p.id,
      question: p.question,
      options: p.options.map((o) => ({ text: o.text, voterCount: o.voter_count })),
      totalVoterCount: p.total_voter_count,
      isClosed: p.is_closed,
      isAnonymous: p.is_anonymous,
      type: p.type,
      allowsMultipleAnswers: p.allows_multiple_answers,
      correctOptionId: p.correct_option_id,
      explanation: p.explanation,
    };

    return {
      type: "telegram.poll",
      data,
      gatewayId,
    };
  }

  // Handle poll answers
  if (update.poll_answer) {
    const pa = update.poll_answer;
    const data: TelegramPollAnswerEventData = {
      pollId: pa.poll_id,
      user: transformUser(pa.user),
      optionIds: pa.option_ids,
    };

    return {
      type: "telegram.poll_answer",
      data,
      gatewayId,
    };
  }

  return null;
}

/**
 * Transform a Telegram message to event data
 */
function transformTelegramMessage(
  msg: NonNullable<TelegramUpdate["message"]>
): TelegramMessageEventData {
  return {
    messageId: msg.message_id,
    chatId: msg.chat.id,
    chatType: msg.chat.type,
    from: msg.from
      ? {
          id: msg.from.id,
          isBot: msg.from.is_bot,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          username: msg.from.username,
        }
      : undefined,
    text: msg.text,
    date: msg.date,
  };
}

/**
 * Transform a Telegram user to camelCase event data shape
 */
function transformUser(user: TelegramUpdateUser): {
  id: number;
  isBot: boolean;
  firstName: string;
  lastName?: string;
  username?: string;
} {
  return {
    id: user.id,
    isBot: user.is_bot,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
  };
}

// ===========================================
// Plugin Resolution
// ===========================================

/**
 * User plugin with plugin data
 */
interface UserPluginWithPlugin {
  id: string;
  userId: string;
  pluginId: string;
  organizationId: string | null;
  config: unknown;
  isEnabled: boolean;
  entryFile: string | null;
  plugin: {
    id: string;
    slug: string;
    name: string;
    requiredGateways: GatewayType[];
  };
}

/**
 * Find all plugins that should receive an event
 *
 * Scoped by organizationId to prevent mixing personal and org plugins:
 * - organizationId = null → personal plugins only
 * - organizationId = 'org-xxx' → that org's plugins only
 */
async function findTargetPlugins(
  userId: string,
  organizationId: string | null,
  event: PluginEvent
): Promise<UserPluginWithPlugin[]> {
  // Get required gateway type from event
  let requiredGateway: GatewayType | null = null;

  if (event.type.startsWith("telegram.")) {
    requiredGateway = "TELEGRAM_BOT";
  }

  // Custom gateway events: route ONLY to plugins linked to this specific gateway
  if (
    (event.type === "customGateway.incoming" || event.type === "webhook.trigger") &&
    "gatewayId" in event
  ) {
    const linkedPlugins = await prisma.userPlugin.findMany({
      where: {
        userId,
        isEnabled: true,
        organizationId: organizationId ?? null,
        gatewayId: event.gatewayId,
      },
      include: {
        plugin: {
          select: {
            id: true,
            slug: true,
            name: true,
            requiredGateways: true,
          },
        },
      },
    });
    return linkedPlugins as UserPluginWithPlugin[];
  }

  // Find all enabled user plugins scoped to the correct tenant
  const userPlugins = await prisma.userPlugin.findMany({
    where: {
      userId,
      isEnabled: true,
      organizationId: organizationId ?? null,
    },
    include: {
      plugin: {
        select: {
          id: true,
          slug: true,
          name: true,
          requiredGateways: true,
        },
      },
    },
  });

  // Filter plugins that can handle this event type
  return userPlugins.filter((up) => {
    // If event requires a specific gateway, check plugin supports it
    if (requiredGateway) {
      return up.plugin.requiredGateways.includes(requiredGateway);
    }

    // For other events, all enabled plugins can receive them
    return true;
  }) as UserPluginWithPlugin[];
}

/**
 * Get user gateways for a specific type
 *
 * Scoped by organizationId to prevent cross-tenant gateway access:
 * - organizationId = null → personal gateways only
 * - organizationId = 'org-xxx' → that org's gateways only
 */
async function getUserGateways(
  userId: string,
  organizationId: string | null,
  gatewayType?: GatewayType
): Promise<Array<{ id: string; name: string; type: string }>> {
  const gateways = await prisma.gateway.findMany({
    where: {
      status: "CONNECTED",
      ...(gatewayType ? { type: gatewayType } : {}),
      ...(organizationId
        ? { organizationId }
        : { userId, organizationId: null }),
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });

  return gateways;
}

// ===========================================
// Context Factory
// ===========================================

/**
 * Gateway action executor using gateway provider
 */
type GatewayActionExecutor = (
  gatewayId: string,
  action: string,
  params: unknown
) => Promise<unknown>;

/**
 * Create a plugin context for execution
 */
async function createPluginContext(
  userPlugin: UserPluginWithPlugin,
  gateways: Array<{ id: string; name: string; type: string }>,
  executeGateway: GatewayActionExecutor
): Promise<PluginContext> {
  // Decrypt config if needed
  let config = (userPlugin.config as Record<string, unknown>) ?? {};
  
  if (
    typeof config === "object" &&
    config !== null &&
    "_encrypted" in config &&
    typeof (config as Record<string, unknown>)._encrypted === "string"
  ) {
    try {
      config = decryptJson((config as Record<string, unknown>)._encrypted as string);
    } catch (error) {
      logger.error(
        { error, userPluginId: userPlugin.id, pluginSlug: userPlugin.plugin.slug, userId: userPlugin.userId },
        "Failed to decrypt plugin config — plugin will run with empty config"
      );
      config = { _decryptFailed: true };
    }
  }

  return {
    userId: userPlugin.userId,
    organizationId: userPlugin.organizationId ?? undefined,
    config,
    userPluginId: userPlugin.id,
    entryFile: userPlugin.entryFile ?? `plugins/${userPlugin.plugin.slug}.js`,
    gateways: createGatewayAccessor(userPlugin.userId, gateways, executeGateway),
    storage: createPluginStorage(userPlugin.id, userPlugin.userId),
    logger: logger.child({
      module: "plugin",
      plugin: userPlugin.plugin.slug,
      userId: userPlugin.userId,
    }),
  };
}

// ===========================================
// Event Router
// ===========================================

/**
 * Result of routing an event to plugins
 */
export interface EventRoutingResult {
  /** Number of plugins that received the event */
  pluginsExecuted: number;
  /** Number of successful executions */
  successCount: number;
  /** Number of failed executions */
  failureCount: number;
  /** Individual plugin results */
  results: Array<{
    pluginSlug: string;
    userPluginId: string;
    success: boolean;
    durationMs: number;
    error?: string;
  }>;
}

/**
 * Route an event to all applicable plugins for a user
 */
export async function routeEventToPlugins(
  userId: string,
  organizationId: string | null,
  event: PluginEvent,
  executeGateway: GatewayActionExecutor
): Promise<EventRoutingResult> {
  const startTime = Date.now();

  eventLogger.debug(
    { userId, organizationId, eventType: event.type },
    "Routing event to plugins"
  );

  // Find target plugins scoped to the correct tenant
  const targetPlugins = await findTargetPlugins(userId, organizationId, event);

  if (targetPlugins.length === 0) {
    eventLogger.debug({ userId, eventType: event.type }, "No plugins to receive event");
    return {
      pluginsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
  }

  // Get user gateways scoped to the correct tenant
  const gateways = await getUserGateways(userId, organizationId);

  // Get executor
  const executor = getPluginExecutor();

  // Execute each plugin in parallel (up to 5 concurrently)
  const results: EventRoutingResult["results"] = [];
  let successCount = 0;
  let failureCount = 0;

  const CONCURRENCY = 5;
  const executeOne = async (userPlugin: UserPluginWithPlugin) => {
    const pluginStartTime = Date.now();

    try {
      // Create context for this plugin
      const context = await createPluginContext(userPlugin, gateways, executeGateway);

      // Execute the plugin
      const result = await executor.execute(
        userPlugin.plugin.slug,
        event,
        context,
      );

      return {
        pluginSlug: userPlugin.plugin.slug,
        userPluginId: userPlugin.id,
        success: result.success,
        durationMs: result.metrics.durationMs,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      eventLogger.error(
        {
          pluginSlug: userPlugin.plugin.slug,
          userPluginId: userPlugin.id,
          error: errorMessage,
        },
        "Plugin execution failed"
      );

      return {
        pluginSlug: userPlugin.plugin.slug,
        userPluginId: userPlugin.id,
        success: false,
        durationMs: Date.now() - pluginStartTime,
        error: errorMessage,
      };
    }
  };

  // Process in batches of CONCURRENCY
  for (let i = 0; i < targetPlugins.length; i += CONCURRENCY) {
    const batch = targetPlugins.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(executeOne));

    for (const settled of batchResults) {
      const res = settled.status === 'fulfilled'
        ? settled.value
        : { pluginSlug: 'unknown', userPluginId: 'unknown', success: false, durationMs: 0, error: String(settled.reason) };

      results.push(res);
      if (res.success) successCount++;
      else failureCount++;
    }
  }

  const totalDuration = Date.now() - startTime;

  eventLogger.info(
    {
      userId,
      eventType: event.type,
      pluginsExecuted: targetPlugins.length,
      successCount,
      failureCount,
      totalDurationMs: totalDuration,
    },
    "Event routing complete"
  );

  return {
    pluginsExecuted: targetPlugins.length,
    successCount,
    failureCount,
    results,
  };
}

// ===========================================
// Telegram Webhook Handler
// ===========================================

/**
 * Handle a Telegram webhook for a specific gateway
 */
export async function handleTelegramWebhook(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  update: TelegramUpdate,
  executeGateway: GatewayActionExecutor
): Promise<EventRoutingResult> {
  eventLogger.debug(
    { gatewayId, userId, organizationId, updateId: update.update_id },
    "Handling Telegram webhook"
  );

  // Transform the update to a plugin event
  const event = transformTelegramUpdate(update, gatewayId);

  if (!event) {
    eventLogger.debug(
      { gatewayId, updateId: update.update_id },
      "Unsupported update type, skipping"
    );
    return {
      pluginsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
  }

  // Route to plugins scoped to the correct tenant
  return routeEventToPlugins(userId, organizationId, event, executeGateway);
}

// ===========================================
// Custom Gateway Webhook Handler
// ===========================================

/**
 * Inbound HTTP payload from a custom gateway webhook
 */
export interface CustomGatewayInboundPayload {
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
}

/**
 * Handle an incoming custom gateway webhook.
 *
 * This mirrors handleTelegramWebhook but for CUSTOM_GATEWAY type gateways.
 * Only plugins linked to this gateway (via UserPlugin.gatewayId) receive
 * the event — unlike Telegram where plugins opt-in by requiredGateways.
 *
 * No executeGateway callback is needed because custom gateways have no
 * outbound action API (they're inbound-only).
 */
export async function handleCustomGatewayWebhook(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  payload: CustomGatewayInboundPayload,
  credentials: Record<string, string>,
): Promise<EventRoutingResult> {
  eventLogger.debug(
    { gatewayId, userId, organizationId },
    "Handling custom gateway webhook",
  );

  const event: PluginEvent = {
    type: "customGateway.incoming",
    gatewayId,
    data: {
      method: payload.method,
      headers: payload.headers,
      body: payload.body,
      query: payload.query,
      credentials,
    },
  };

  // No-op executeGateway — custom gateways are inbound-only
  const noopExecuteGateway: GatewayActionExecutor = async () => {
    throw new Error("Custom gateways do not support outbound actions via executeGateway");
  };

  return routeEventToPlugins(userId, organizationId, event, noopExecuteGateway);
}

// ===========================================
// Manual Trigger
// ===========================================

/**
 * Manually trigger a plugin for a user
 */
export async function triggerPluginManually(
  userPluginId: string,
  userId: string,
  params: Record<string, unknown> | undefined,
  executeGateway: GatewayActionExecutor
): Promise<PluginExecutionResult> {
  eventLogger.debug({ userPluginId, userId }, "Manual plugin trigger");

  // Get the user plugin
  const userPlugin = await prisma.userPlugin.findFirst({
    where: {
      id: userPluginId,
      userId,
    },
    include: {
      plugin: {
        select: {
          id: true,
          slug: true,
          name: true,
          requiredGateways: true,
        },
      },
    },
  });

  if (!userPlugin) {
    throw new Error(`UserPlugin not found: ${userPluginId}`);
  }

  if (!userPlugin.isEnabled) {
    throw new Error(`Plugin is not enabled: ${userPlugin.plugin.slug}`);
  }

  // Get user gateways scoped to the plugin's tenant
  const gateways = await getUserGateways(userId, userPlugin.organizationId ?? null);

  // Create context
  const context = await createPluginContext(
    userPlugin as UserPluginWithPlugin,
    gateways,
    executeGateway
  );

  // Create manual trigger event
  const event: PluginEvent = {
    type: "manual.trigger",
    data: {
      triggeredBy: userId,
      triggeredAt: new Date(),
      params,
    },
  };

  // Execute
  const executor = getPluginExecutor();
  return executor.execute(
    userPlugin.plugin.slug,
    event,
    context,
  );
}

// ===========================================
// Plugin Registration Helper
// ===========================================

/**
 * Re-export registerPlugin for convenience
 */
export { registerPlugin };
