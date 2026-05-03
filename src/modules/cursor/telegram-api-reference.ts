/**
 * Telegram Bot API Reference — Compact searchable index
 *
 * Used by the `search_docs` tool to answer Telegram API questions
 * without hallucinating methods, parameters, or behaviors.
 *
 * @module modules/cursor/telegram-api-reference
 */

interface ApiMethod {
  method: string;
  description: string;
  params: string;
  returns: string;
  tags: string[];
}

const METHODS: ApiMethod[] = [
  // ── Messages ──
  {
    method: "sendMessage",
    description: "Send a text message to a chat. Supports HTML/Markdown parse_mode, reply_markup for keyboards.",
    params: "chat_id (int|string), text (string), parse_mode? ('HTML'|'MarkdownV2'), reply_markup? (InlineKeyboard|ReplyKeyboard|Remove|ForceReply), disable_notification?, reply_to_message_id?, message_thread_id?",
    returns: "Message",
    tags: ["message", "text", "send", "keyboard", "reply"],
  },
  {
    method: "editMessageText",
    description: "Edit text of a previously sent message. Must provide chat_id+message_id OR inline_message_id.",
    params: "chat_id?, message_id?, inline_message_id?, text (string), parse_mode?, reply_markup?",
    returns: "Message | true",
    tags: ["edit", "message", "text", "update"],
  },
  {
    method: "deleteMessage",
    description: "Delete a message. Bot must have delete permission in groups. Can only delete messages less than 48 hours old.",
    params: "chat_id (int|string), message_id (int)",
    returns: "true",
    tags: ["delete", "message", "remove"],
  },
  {
    method: "forwardMessage",
    description: "Forward a message from one chat to another.",
    params: "chat_id (int|string), from_chat_id (int|string), message_id (int), disable_notification?",
    returns: "Message",
    tags: ["forward", "message"],
  },
  {
    method: "copyMessage",
    description: "Copy a message without the 'Forwarded from' header.",
    params: "chat_id, from_chat_id, message_id, caption?, parse_mode?, reply_markup?",
    returns: "MessageId",
    tags: ["copy", "message"],
  },
  // ── Media ──
  {
    method: "sendPhoto",
    description: "Send a photo by file_id, URL, or upload. Max 10MB. caption up to 1024 chars.",
    params: "chat_id, photo (string|InputFile), caption?, parse_mode?, reply_markup?",
    returns: "Message",
    tags: ["photo", "image", "media", "send"],
  },
  {
    method: "sendDocument",
    description: "Send a general file (document). Max 50MB.",
    params: "chat_id, document (string|InputFile), caption?, parse_mode?, reply_markup?",
    returns: "Message",
    tags: ["document", "file", "send", "upload"],
  },
  {
    method: "sendVideo",
    description: "Send a video. Max 50MB. Supports streaming.",
    params: "chat_id, video (string|InputFile), duration?, width?, height?, caption?, reply_markup?",
    returns: "Message",
    tags: ["video", "media", "send"],
  },
  {
    method: "sendVoice",
    description: "Send a voice message (.ogg with OPUS). Max 50MB.",
    params: "chat_id, voice (string|InputFile), duration?, caption?, reply_markup?",
    returns: "Message",
    tags: ["voice", "audio", "send"],
  },
  {
    method: "sendAudio",
    description: "Send an audio file (.mp3). Max 50MB. Displayed as a music file.",
    params: "chat_id, audio (string|InputFile), duration?, performer?, title?, caption?, reply_markup?",
    returns: "Message",
    tags: ["audio", "music", "send"],
  },
  {
    method: "sendAnimation",
    description: "Send a GIF or H.264/MPEG-4 animation. Max 50MB.",
    params: "chat_id, animation (string|InputFile), duration?, width?, height?, caption?, reply_markup?",
    returns: "Message",
    tags: ["gif", "animation", "media", "send"],
  },
  {
    method: "sendSticker",
    description: "Send a .WEBP, .TGS, or .WEBM sticker.",
    params: "chat_id, sticker (string|InputFile), reply_markup?",
    returns: "Message",
    tags: ["sticker", "send"],
  },
  {
    method: "sendLocation",
    description: "Send a point on the map. Optionally live for a period.",
    params: "chat_id, latitude (float), longitude (float), live_period?, reply_markup?",
    returns: "Message",
    tags: ["location", "map", "gps", "send"],
  },
  {
    method: "sendContact",
    description: "Send a phone contact.",
    params: "chat_id, phone_number (string), first_name (string), last_name?, reply_markup?",
    returns: "Message",
    tags: ["contact", "phone", "send"],
  },
  {
    method: "sendMediaGroup",
    description: "Send a group of photos/videos as an album (2-10 items).",
    params: "chat_id, media (InputMediaPhoto[]|InputMediaVideo[]), disable_notification?",
    returns: "Message[]",
    tags: ["album", "media", "group", "send"],
  },
  {
    method: "sendDice",
    description: "Send animated emoji that shows a random value.",
    params: "chat_id, emoji? ('🎲'|'🎯'|'🏀'|'⚽'|'🎳'|'🎰'), reply_markup?",
    returns: "Message",
    tags: ["dice", "random", "game", "send"],
  },
  {
    method: "sendChatAction",
    description: "Tell the user that something is happening (typing, uploading, etc). Status shown for 5 seconds.",
    params: "chat_id, action ('typing'|'upload_photo'|'record_video'|'upload_video'|'record_voice'|'upload_voice'|'upload_document'|'find_location')",
    returns: "true",
    tags: ["typing", "action", "status", "indicator"],
  },
  // ── Callback ──
  {
    method: "answerCallbackQuery",
    description: "Answer a callback query from an inline keyboard button. Must be called within 10 seconds.",
    params: "callback_query_id (string), text?, show_alert? (bool), url?",
    returns: "true",
    tags: ["callback", "button", "inline", "keyboard", "answer"],
  },
  // ── Inline Mode ──
  {
    method: "answerInlineQuery",
    description: "Answer an inline query with up to 50 results.",
    params: "inline_query_id (string), results (InlineQueryResult[]), cache_time?, is_personal?, next_offset?",
    returns: "true",
    tags: ["inline", "query", "answer", "search"],
  },
  // ── Chat Management ──
  {
    method: "getChat",
    description: "Get up-to-date info about a chat (title, description, member count, etc).",
    params: "chat_id (int|string)",
    returns: "ChatFullInfo",
    tags: ["chat", "info", "get"],
  },
  {
    method: "getChatMember",
    description: "Get information about a member of a chat.",
    params: "chat_id, user_id (int)",
    returns: "ChatMember",
    tags: ["member", "user", "status", "chat"],
  },
  {
    method: "getChatMemberCount",
    description: "Get the number of members in a chat.",
    params: "chat_id (int|string)",
    returns: "int",
    tags: ["member", "count", "chat"],
  },
  {
    method: "banChatMember",
    description: "Ban a user from a group/supergroup/channel. In supergroups, the user will not be able to return.",
    params: "chat_id, user_id (int), until_date? (unix timestamp), revoke_messages? (bool)",
    returns: "true",
    tags: ["ban", "kick", "member", "moderation"],
  },
  {
    method: "unbanChatMember",
    description: "Unban a previously banned user in a supergroup or channel.",
    params: "chat_id, user_id (int), only_if_banned? (bool)",
    returns: "true",
    tags: ["unban", "member", "moderation"],
  },
  {
    method: "restrictChatMember",
    description: "Restrict a user in a supergroup. Permissions set via ChatPermissions object.",
    params: "chat_id, user_id (int), permissions (ChatPermissions), until_date?",
    returns: "true",
    tags: ["restrict", "mute", "permissions", "moderation"],
  },
  {
    method: "promoteChatMember",
    description: "Promote a user to admin with specific rights.",
    params: "chat_id, user_id, can_change_info?, can_post_messages?, can_edit_messages?, can_delete_messages?, can_manage_chat?, can_invite_users?",
    returns: "true",
    tags: ["promote", "admin", "moderation"],
  },
  {
    method: "setChatTitle",
    description: "Change the title of a chat (groups and channels).",
    params: "chat_id, title (string, 1-128 chars)",
    returns: "true",
    tags: ["title", "chat", "settings"],
  },
  {
    method: "setChatDescription",
    description: "Change the description of a group/supergroup/channel.",
    params: "chat_id, description? (string, 0-255 chars)",
    returns: "true",
    tags: ["description", "chat", "settings"],
  },
  {
    method: "setChatPhoto",
    description: "Set a new chat photo.",
    params: "chat_id, photo (InputFile)",
    returns: "true",
    tags: ["photo", "chat", "settings", "avatar"],
  },
  {
    method: "pinChatMessage",
    description: "Pin a message in a group/supergroup/channel.",
    params: "chat_id, message_id (int), disable_notification?",
    returns: "true",
    tags: ["pin", "message"],
  },
  {
    method: "unpinChatMessage",
    description: "Unpin a message in a group/supergroup/channel.",
    params: "chat_id, message_id? (int)",
    returns: "true",
    tags: ["unpin", "message"],
  },
  {
    method: "leaveChat",
    description: "Bot leaves the group/supergroup/channel.",
    params: "chat_id",
    returns: "true",
    tags: ["leave", "chat"],
  },
  // ── Bot Commands ──
  {
    method: "setMyCommands",
    description: "Set the list of bot commands shown in the menu. Up to 100 commands.",
    params: "commands (BotCommand[]), scope? (BotCommandScope), language_code?",
    returns: "true",
    tags: ["commands", "menu", "bot", "set"],
  },
  {
    method: "getMyCommands",
    description: "Get the current list of the bot's commands.",
    params: "scope?, language_code?",
    returns: "BotCommand[]",
    tags: ["commands", "menu", "bot", "get"],
  },
  {
    method: "deleteMyCommands",
    description: "Delete the list of the bot's commands for the given scope.",
    params: "scope?, language_code?",
    returns: "true",
    tags: ["commands", "menu", "bot", "delete"],
  },
  // ── Webhooks ──
  {
    method: "setWebhook",
    description: "Specify a URL for incoming updates via webhook.",
    params: "url (string), certificate?, ip_address?, max_connections?, allowed_updates?, drop_pending_updates?, secret_token?",
    returns: "true",
    tags: ["webhook", "set", "updates"],
  },
  {
    method: "getWebhookInfo",
    description: "Get current webhook status.",
    params: "(none)",
    returns: "WebhookInfo",
    tags: ["webhook", "info", "status"],
  },
  {
    method: "deleteWebhook",
    description: "Remove webhook integration. Use getUpdates for long polling after.",
    params: "drop_pending_updates?",
    returns: "true",
    tags: ["webhook", "delete", "remove"],
  },
  // ── Files ──
  {
    method: "getFile",
    description: "Get a File object with file_path to download. Files up to 20MB.",
    params: "file_id (string)",
    returns: "File (use https://api.telegram.org/file/bot<token>/<file_path> to download)",
    tags: ["file", "download", "get"],
  },
  // ── Payments ──
  {
    method: "sendInvoice",
    description: "Send an invoice for payment. Requires payment provider token.",
    params: "chat_id, title, description, payload, provider_token, currency, prices (LabeledPrice[]), ...many optional",
    returns: "Message",
    tags: ["payment", "invoice", "billing", "send"],
  },
  {
    method: "answerPreCheckoutQuery",
    description: "Respond to a pre-checkout query. Must answer within 10 seconds.",
    params: "pre_checkout_query_id (string), ok (bool), error_message?",
    returns: "true",
    tags: ["payment", "checkout", "answer"],
  },
  // ── Bot Info ──
  {
    method: "getMe",
    description: "Get basic info about the bot: id, first_name, username, can_join_groups, etc.",
    params: "(none)",
    returns: "User",
    tags: ["bot", "info", "me", "get"],
  },
];

/**
 * Common Telegram update objects and their structure.
 */
const OBJECTS = [
  {
    name: "Message",
    description: "A message object. Key fields: message_id, from (User), chat (Chat), date, text, entities, reply_to_message, photo, document, video, voice, audio, sticker, location, contact, caption.",
    tags: ["message", "object", "update"],
  },
  {
    name: "CallbackQuery",
    description: "Incoming callback from an inline keyboard button. Fields: id, from (User), message (Message), chat_instance, data (string — the callback_data you set on the button).",
    tags: ["callback", "query", "button", "inline"],
  },
  {
    name: "InlineKeyboardMarkup",
    description: "An inline keyboard. Fields: inline_keyboard (InlineKeyboardButton[][]). Each button: { text, callback_data?, url?, switch_inline_query? }",
    tags: ["keyboard", "inline", "button", "markup"],
  },
  {
    name: "ReplyKeyboardMarkup",
    description: "A custom keyboard below the message input. Fields: keyboard (KeyboardButton[][]), resize_keyboard?, one_time_keyboard?, selective?",
    tags: ["keyboard", "reply", "custom", "markup"],
  },
  {
    name: "ChatPermissions",
    description: "Permissions for a chat member. Fields: can_send_messages, can_send_audios, can_send_documents, can_send_photos, can_send_videos, can_send_video_notes, can_send_voice_notes, can_send_polls, can_send_other_messages, can_add_web_page_previews, can_change_info, can_invite_users, can_pin_messages, can_manage_topics.",
    tags: ["permissions", "restrict", "chat"],
  },
  {
    name: "User",
    description: "A Telegram user or bot. Fields: id (int), is_bot, first_name, last_name?, username?, language_code?",
    tags: ["user", "member", "from"],
  },
  {
    name: "Chat",
    description: "A chat (private, group, supergroup, channel). Fields: id (int), type ('private'|'group'|'supergroup'|'channel'), title?, username?, first_name?, last_name?",
    tags: ["chat", "group", "channel"],
  },
];

/**
 * Search the Telegram Bot API reference by keyword.
 * Returns matching methods and objects, ranked by relevance.
 */
export function searchTelegramDocs(query: string, maxResults = 8): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return "No search terms provided.";

  // Score methods
  const scoredMethods = METHODS.map((m) => {
    let score = 0;
    const haystack = `${m.method} ${m.description} ${m.tags.join(" ")}`.toLowerCase();
    for (const term of terms) {
      if (m.method.toLowerCase().includes(term)) score += 10;
      if (m.tags.some((t) => t.includes(term))) score += 5;
      if (haystack.includes(term)) score += 2;
    }
    return { ...m, score };
  }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults);

  // Score objects
  const scoredObjects = OBJECTS.map((o) => {
    let score = 0;
    const haystack = `${o.name} ${o.description} ${o.tags.join(" ")}`.toLowerCase();
    for (const term of terms) {
      if (o.name.toLowerCase().includes(term)) score += 10;
      if (o.tags.some((t) => t.includes(term))) score += 5;
      if (haystack.includes(term)) score += 2;
    }
    return { ...o, score };
  }).filter((o) => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  const parts: string[] = [];

  if (scoredMethods.length > 0) {
    parts.push("## Telegram Bot API Methods\n");
    for (const m of scoredMethods) {
      parts.push(`### ${m.method}`);
      parts.push(m.description);
      parts.push(`**Parameters:** ${m.params}`);
      parts.push(`**Returns:** ${m.returns}\n`);
    }
  }

  if (scoredObjects.length > 0) {
    parts.push("## Telegram Objects\n");
    for (const o of scoredObjects) {
      parts.push(`### ${o.name}`);
      parts.push(`${o.description}\n`);
    }
  }

  if (parts.length === 0) {
    return `No Telegram API docs found for "${query}". Try different keywords like: sendMessage, keyboard, callback, photo, ban, webhook, payment.`;
  }

  return parts.join("\n");
}
