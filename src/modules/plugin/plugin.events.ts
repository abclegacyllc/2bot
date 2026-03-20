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

import { getPluginEntryPath } from "./plugin-deploy.service";

import {
    createGatewayAccessor,
    createPluginStorage,
    getPluginExecutor,
    registerPlugin,
} from "./plugin.executor";
import type {
    DiscordGuildMemberEventData,
    DiscordInteractionEventData,
    DiscordMessageEventData,
    PluginContext,
    PluginEvent,
    PluginExecutionResult,
    SlackAppMentionEventData,
    SlackInteractionEventData,
    SlackMessageEventData,
    SlackReactionEventData,
    TelegramCallbackEventData,
    TelegramChatMemberUpdatedEventData,
    TelegramChosenInlineResultEventData,
    TelegramInlineQueryEventData,
    TelegramMessageEventData,
    TelegramPollAnswerEventData,
    TelegramPollEventData,
    WhatsAppMessageEventData,
    WhatsAppStatusEventData,
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
  gatewayId: string | null;
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
  } else if (event.type.startsWith("discord.")) {
    requiredGateway = "DISCORD_BOT";
  }

  // Extract gatewayId from event (if present)
  const eventGatewayId = "gatewayId" in event ? event.gatewayId : null;

  // Find all enabled user plugins scoped to the correct tenant
  const userPlugins = await prisma.userPlugin.findMany({
    where: {
      userId,
      isEnabled: true,
      organizationId: organizationId ?? null,
      // Filter by specific gateway when event originates from one
      ...(eventGatewayId ? { gatewayId: eventGatewayId } : {}),
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
    entryFile: userPlugin.entryFile ?? getPluginEntryPath(userPlugin.gatewayId, userPlugin.plugin.slug),
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

// ===========================================
// Discord Event Types & Transformation
// ===========================================

/**
 * Discord Gateway Event (from HTTP interactions webhook)
 */
export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: number; // 1=PING, 2=APPLICATION_COMMAND, 3=MESSAGE_COMPONENT, 4=AUTOCOMPLETE, 5=MODAL_SUBMIT
  token: string;
  version: number;
  guild_id?: string;
  channel_id?: string;
  channel?: { id: string; type: number; guild_id?: string; name?: string };
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
  };
  member?: {
    user: {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      bot?: boolean;
    };
    roles: string[];
    nick?: string;
    joined_at: string;
    permissions: string;
  };
  data?: {
    id?: string;
    name?: string;
    type?: number;
    options?: Array<{ name: string; type: number; value: unknown }>;
    custom_id?: string;
    component_type?: number;
    values?: string[];
  };
  message?: {
    id: string;
    channel_id: string;
    content: string;
    author: {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      bot?: boolean;
    };
    timestamp: string;
    tts: boolean;
    mention_everyone: boolean;
    embeds: Array<Record<string, unknown>>;
    attachments: Array<{ id: string; filename: string; url: string; size: number }>;
  };
}

/**
 * Discord Gateway Event — MESSAGE_CREATE dispatched via Gateway/Bot events
 */
export interface DiscordMessageCreate {
  id: string;
  channel_id: string;
  guild_id?: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
  };
  timestamp: string;
  tts: boolean;
  mention_everyone: boolean;
  embeds: Array<Record<string, unknown>>;
  attachments: Array<{ id: string; filename: string; url: string; size: number }>;
  referenced_message?: DiscordMessageCreate;
}

/**
 * Discord GUILD_MEMBER_ADD / GUILD_MEMBER_REMOVE event
 */
export interface DiscordGuildMemberEvent {
  guild_id: string;
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
  };
  nick?: string;
  roles: string[];
  joined_at?: string;
}

/**
 * Transform a Discord interaction to a PluginEvent
 */
export function transformDiscordInteraction(
  interaction: DiscordInteraction,
  gatewayId: string,
): PluginEvent | null {
  // Type 1 = PING — Discord handshake, not a real event for plugins
  if (interaction.type === 1) return null;

  const user = interaction.member?.user ?? interaction.user;

  const data: DiscordInteractionEventData = {
    id: interaction.id,
    applicationId: interaction.application_id,
    interactionType: interaction.type,
    token: interaction.token,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id ?? interaction.channel?.id,
    user: user ? {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      bot: user.bot,
    } : undefined,
    member: interaction.member ? {
      user: {
        id: interaction.member.user.id,
        username: interaction.member.user.username,
        discriminator: interaction.member.user.discriminator,
        avatar: interaction.member.user.avatar,
        bot: interaction.member.user.bot,
      },
      roles: interaction.member.roles,
      nick: interaction.member.nick,
      joinedAt: interaction.member.joined_at,
      permissions: interaction.member.permissions,
    } : undefined,
    data: interaction.data ? {
      id: interaction.data.id,
      name: interaction.data.name,
      type: interaction.data.type,
      options: interaction.data.options,
      customId: interaction.data.custom_id,
      componentType: interaction.data.component_type,
      values: interaction.data.values,
    } : undefined,
    message: interaction.message ? transformDiscordMessageData(interaction.message) : undefined,
  };

  return {
    type: "discord.interaction",
    data,
    gatewayId,
  };
}

/**
 * Transform a Discord MESSAGE_CREATE event to a PluginEvent
 */
export function transformDiscordMessageCreate(
  message: DiscordMessageCreate,
  gatewayId: string,
): PluginEvent {
  const data: DiscordMessageEventData = {
    id: message.id,
    channelId: message.channel_id,
    guildId: message.guild_id,
    content: message.content,
    author: {
      id: message.author.id,
      username: message.author.username,
      discriminator: message.author.discriminator,
      avatar: message.author.avatar,
      bot: message.author.bot,
    },
    timestamp: message.timestamp,
    tts: message.tts,
    mentionEveryone: message.mention_everyone,
    embeds: message.embeds,
    attachments: message.attachments,
    referencedMessage: message.referenced_message
      ? transformDiscordMessageDataFull(message.referenced_message)
      : undefined,
  };

  return {
    type: "discord.message",
    data,
    gatewayId,
  };
}

/**
 * Transform a Discord GUILD_MEMBER event
 */
export function transformDiscordGuildMemberEvent(
  event: DiscordGuildMemberEvent,
  eventType: "discord.guild_member_add" | "discord.guild_member_remove",
  gatewayId: string,
): PluginEvent {
  const data: DiscordGuildMemberEventData = {
    guildId: event.guild_id,
    user: {
      id: event.user.id,
      username: event.user.username,
      discriminator: event.user.discriminator,
      avatar: event.user.avatar,
      bot: event.user.bot,
    },
    nick: event.nick,
    roles: event.roles,
    joinedAt: event.joined_at,
  };

  return {
    type: eventType,
    data,
    gatewayId,
  };
}

function transformDiscordMessageData(
  msg: NonNullable<DiscordInteraction["message"]>,
): DiscordMessageEventData {
  return {
    id: msg.id,
    channelId: msg.channel_id,
    content: msg.content,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      discriminator: msg.author.discriminator,
      avatar: msg.author.avatar,
      bot: msg.author.bot,
    },
    timestamp: msg.timestamp,
    tts: msg.tts,
    mentionEveryone: msg.mention_everyone,
    embeds: msg.embeds,
    attachments: msg.attachments,
  };
}

function transformDiscordMessageDataFull(
  msg: DiscordMessageCreate,
): DiscordMessageEventData {
  return {
    id: msg.id,
    channelId: msg.channel_id,
    guildId: msg.guild_id,
    content: msg.content,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      discriminator: msg.author.discriminator,
      avatar: msg.author.avatar,
      bot: msg.author.bot,
    },
    timestamp: msg.timestamp,
    tts: msg.tts,
    mentionEveryone: msg.mention_everyone,
    embeds: msg.embeds,
    attachments: msg.attachments,
  };
}

/**
 * Handle a Discord interaction webhook for a specific gateway
 */
export async function handleDiscordWebhook(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  interaction: DiscordInteraction,
  executeGateway: GatewayActionExecutor,
): Promise<EventRoutingResult> {
  eventLogger.debug(
    { gatewayId, userId, organizationId, interactionId: interaction.id },
    "Handling Discord webhook",
  );

  const event = transformDiscordInteraction(interaction, gatewayId);

  if (!event) {
    eventLogger.debug(
      { gatewayId, interactionId: interaction.id },
      "PING interaction, skipping plugin routing",
    );
    return {
      pluginsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
  }

  return routeEventToPlugins(userId, organizationId, event, executeGateway);
}

// ===========================================
// Slack Event Types & Transformation
// ===========================================

/**
 * Slack Events API event_callback payload
 */
export interface SlackEventCallback {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackRawEvent;
  type: "event_callback";
  event_id: string;
  event_time: number;
}

/**
 * Raw Slack event (inner event object from event_callback)
 */
export interface SlackRawEvent {
  type: string; // "message", "app_mention", "reaction_added", "reaction_removed", etc.
  subtype?: string;
  user?: string;
  text?: string;
  ts?: string;
  channel?: string;
  channel_type?: string;
  thread_ts?: string;
  team?: string;
  blocks?: Array<Record<string, unknown>>;
  files?: Array<{ id: string; name: string; mimetype: string; url_private: string; size: number }>;
  bot_id?: string;
  app_id?: string;
  // Reaction events
  reaction?: string;
  item_user?: string;
  item?: { type: string; channel: string; ts: string };
  event_ts?: string;
}

/**
 * Slack interaction payload (block_actions, shortcuts, view_submission, etc.)
 */
export interface SlackInteractionPayload {
  type: string; // "block_actions" | "shortcut" | "message_action" | "view_submission" | "view_closed"
  trigger_id: string;
  user: { id: string; name: string; real_name?: string; team_id?: string };
  team?: { id: string; domain: string };
  channel?: { id: string; name: string };
  message?: SlackRawEvent;
  actions?: Array<{
    type: string;
    action_id: string;
    block_id: string;
    value?: string;
    selected_option?: { value: string; text: { type: string; text: string } };
  }>;
  view?: {
    id: string;
    type: string;
    title: { type: string; text: string };
    callback_id?: string;
    state?: { values: Record<string, Record<string, { value?: string }>> };
  };
  response_url?: string;
}

/**
 * Transform a Slack event_callback into a PluginEvent
 */
export function transformSlackEventCallback(
  payload: SlackEventCallback,
  gatewayId: string,
): PluginEvent | null {
  const event = payload.event;

  switch (event.type) {
    case "message": {
      // Ignore bot messages to prevent loops (unless subtype indicates edit/delete)
      if (event.bot_id && !event.subtype) return null;

      const data: SlackMessageEventData = {
        type: "message",
        subtype: event.subtype,
        channel: event.channel ?? "",
        channelType: event.channel_type,
        user: event.user,
        text: event.text ?? "",
        ts: event.ts ?? "",
        threadTs: event.thread_ts,
        team: event.team,
        blocks: event.blocks,
        files: event.files,
        botId: event.bot_id,
        appId: event.app_id,
      };
      return { type: "slack.message", data, gatewayId };
    }

    case "app_mention": {
      const data: SlackAppMentionEventData = {
        type: "app_mention",
        user: event.user ?? "",
        text: event.text ?? "",
        ts: event.ts ?? "",
        channel: event.channel ?? "",
        eventTs: event.event_ts ?? event.ts ?? "",
        threadTs: event.thread_ts,
      };
      return { type: "slack.app_mention", data, gatewayId };
    }

    case "reaction_added":
    case "reaction_removed": {
      const data: SlackReactionEventData = {
        type: event.type,
        user: event.user ?? "",
        reaction: event.reaction ?? "",
        itemUser: event.item_user,
        item: event.item ?? { type: "message", channel: "", ts: "" },
        eventTs: event.event_ts ?? "",
      };
      const eventType = event.type === "reaction_added"
        ? "slack.reaction_added" as const
        : "slack.reaction_removed" as const;
      return { type: eventType, data, gatewayId };
    }

    default:
      eventLogger.debug(
        { gatewayId, eventType: event.type },
        "Unhandled Slack event type",
      );
      return null;
  }
}

/**
 * Transform a Slack interaction payload into a PluginEvent
 */
export function transformSlackInteraction(
  payload: SlackInteractionPayload,
  gatewayId: string,
): PluginEvent {
  const data: SlackInteractionEventData = {
    type: payload.type,
    triggerId: payload.trigger_id,
    user: {
      id: payload.user.id,
      name: payload.user.name,
      realName: payload.user.real_name,
      teamId: payload.user.team_id,
    },
    team: payload.team,
    channel: payload.channel,
    message: payload.message ? {
      type: payload.message.type,
      subtype: payload.message.subtype,
      channel: payload.message.channel ?? "",
      text: payload.message.text ?? "",
      ts: payload.message.ts ?? "",
      user: payload.message.user,
      blocks: payload.message.blocks,
    } : undefined,
    actions: payload.actions?.map(a => ({
      type: a.type,
      actionId: a.action_id,
      blockId: a.block_id,
      value: a.value,
      selectedOption: a.selected_option ? {
        value: a.selected_option.value,
        text: a.selected_option.text,
      } : undefined,
    })),
    view: payload.view ? {
      id: payload.view.id,
      type: payload.view.type,
      title: payload.view.title,
      callbackId: payload.view.callback_id,
      state: payload.view.state,
    } : undefined,
    responseUrl: payload.response_url,
  };
  return { type: "slack.interaction", data, gatewayId };
}

/**
 * Handle a Slack webhook for a specific gateway
 */
export async function handleSlackWebhook(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  payload: Record<string, unknown>,
  executeGateway: GatewayActionExecutor,
): Promise<EventRoutingResult> {
  eventLogger.debug(
    { gatewayId, userId, organizationId, payloadType: payload.type },
    "Handling Slack webhook",
  );

  let event: PluginEvent | null = null;

  if (payload.type === "event_callback") {
    event = transformSlackEventCallback(payload as unknown as SlackEventCallback, gatewayId);
  } else if (
    typeof payload.type === "string" &&
    ["block_actions", "shortcut", "message_action", "view_submission", "view_closed"].includes(payload.type)
  ) {
    event = transformSlackInteraction(payload as unknown as SlackInteractionPayload, gatewayId);
  }

  if (!event) {
    eventLogger.debug(
      { gatewayId, payloadType: payload.type },
      "No event produced from Slack payload, skipping plugin routing",
    );
    return {
      pluginsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
  }

  return routeEventToPlugins(userId, organizationId, event, executeGateway);
}

// ===========================================
// WhatsApp Cloud API Event Transformation
// ===========================================

/**
 * WhatsApp webhook payload structure from Meta Cloud API.
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */
interface WhatsAppWebhookPayload {
  object: string; // "whatsapp_business_account"
  entry: Array<{
    id: string; // Business Account ID
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppIncomingMessage>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string; message?: string }>;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string; voice?: boolean };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<{ name: { formatted_name: string; first_name?: string; last_name?: string }; phones?: Array<{ phone: string; type?: string }> }>;
  reaction?: { message_id: string; emoji: string };
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description?: string } };
  context?: { from: string; id: string };
}

/**
 * Transform a WhatsApp inbound message into a PluginEvent
 */
export function transformWhatsAppMessage(
  msg: WhatsAppIncomingMessage,
  profileName: string | undefined,
  gatewayId: string,
): PluginEvent {
  const msgType = (["text", "image", "document", "audio", "video", "sticker", "location", "contacts", "reaction", "interactive"].includes(msg.type)
    ? msg.type
    : "unknown") as WhatsAppMessageEventData["type"];

  const data: WhatsAppMessageEventData = {
    from: msg.from,
    messageId: msg.id,
    timestamp: msg.timestamp,
    type: msgType,
    profileName,
  };

  // Map fields with snake_case → camelCase conversion
  if (msg.text) data.text = msg.text;
  if (msg.image) data.image = { id: msg.image.id, mimeType: msg.image.mime_type, sha256: msg.image.sha256, caption: msg.image.caption };
  if (msg.document) data.document = { id: msg.document.id, mimeType: msg.document.mime_type, sha256: msg.document.sha256, filename: msg.document.filename, caption: msg.document.caption };
  if (msg.audio) data.audio = { id: msg.audio.id, mimeType: msg.audio.mime_type, sha256: msg.audio.sha256, voice: msg.audio.voice };
  if (msg.video) data.video = { id: msg.video.id, mimeType: msg.video.mime_type, sha256: msg.video.sha256, caption: msg.video.caption };
  if (msg.sticker) data.sticker = { id: msg.sticker.id, mimeType: msg.sticker.mime_type, sha256: msg.sticker.sha256, animated: msg.sticker.animated };
  if (msg.location) data.location = msg.location;
  if (msg.contacts) data.contacts = msg.contacts;
  if (msg.reaction) data.reaction = { messageId: msg.reaction.message_id, emoji: msg.reaction.emoji };
  if (msg.interactive) {
    data.interactive = {
      type: msg.interactive.type,
      buttonReply: msg.interactive.button_reply ? { id: msg.interactive.button_reply.id, title: msg.interactive.button_reply.title } : undefined,
      listReply: msg.interactive.list_reply ? { id: msg.interactive.list_reply.id, title: msg.interactive.list_reply.title, description: msg.interactive.list_reply.description } : undefined,
    };
  }
  if (msg.context) data.context = { from: msg.context.from, messageId: msg.context.id };

  return { type: "whatsapp.message", data, gatewayId };
}

/**
 * Transform a WhatsApp status update into a PluginEvent
 */
function transformWhatsAppStatus(
  status: { id: string; status: "sent" | "delivered" | "read" | "failed"; timestamp: string; recipient_id: string; errors?: Array<{ code: number; title: string; message?: string }> },
  gatewayId: string,
): PluginEvent {
  const data: WhatsAppStatusEventData = {
    messageId: status.id,
    status: status.status,
    timestamp: status.timestamp,
    recipientId: status.recipient_id,
    errors: status.errors,
  };

  return { type: "whatsapp.status", data, gatewayId };
}

/**
 * Handle a WhatsApp Cloud API webhook for a specific gateway.
 * Processes entry[].changes[].value — may contain messages and/or statuses.
 */
export async function handleWhatsAppWebhook(
  gatewayId: string,
  userId: string,
  organizationId: string | null,
  payload: Record<string, unknown>,
  executeGateway: GatewayActionExecutor,
): Promise<EventRoutingResult> {
  eventLogger.debug(
    { gatewayId, userId, organizationId },
    "Handling WhatsApp webhook",
  );

  const whatsAppPayload = payload as unknown as WhatsAppWebhookPayload;
  const events: PluginEvent[] = [];

  // Iterate through all entries and changes
  for (const entry of whatsAppPayload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const profileName = value.contacts?.[0]?.profile?.name;

      // Transform inbound messages
      for (const msg of value.messages ?? []) {
        events.push(transformWhatsAppMessage(msg, profileName, gatewayId));
      }

      // Transform status updates
      for (const status of value.statuses ?? []) {
        events.push(transformWhatsAppStatus(status, gatewayId));
      }
    }
  }

  if (events.length === 0) {
    eventLogger.debug(
      { gatewayId },
      "No events produced from WhatsApp payload, skipping plugin routing",
    );
    return {
      pluginsExecuted: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
  }

  // Route all events to plugins — aggregate results
  let totalPlugins = 0;
  let totalSuccess = 0;
  let totalFailure = 0;
  const allResults: EventRoutingResult["results"] = [];

  for (const event of events) {
    const result = await routeEventToPlugins(userId, organizationId, event, executeGateway);
    totalPlugins += result.pluginsExecuted;
    totalSuccess += result.successCount;
    totalFailure += result.failureCount;
    allResults.push(...result.results);
  }

  return {
    pluginsExecuted: totalPlugins,
    successCount: totalSuccess,
    failureCount: totalFailure,
    results: allResults,
  };
}
