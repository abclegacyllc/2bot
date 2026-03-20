/**
 * Bot Templates — Pre-Tested Plugin Combinations
 *
 * Each bot template is a curated combination of plugins that work well together,
 * with pre-configured settings and event routing rules.
 *
 * Users can one-click install a template to set up a fully functional bot
 * without needing to know which plugins to pick or how to configure them.
 *
 * @module modules/plugin/bot-templates
 */

import type { GatewayType } from "@prisma/client";

// ===========================================
// Bot Template Types
// ===========================================

export interface BotTemplatePlugin {
  /** Template ID from plugin-templates.ts (e.g., "ai-chat-bot") */
  templateId: string;
  /** Override config values for this plugin */
  config?: Record<string, unknown>;
  /** Event role for conflict resolution */
  eventRole?: "responder" | "observer";
  /** Event types this plugin should handle */
  eventTypes?: string[];
}

export interface BotTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Longer description explaining the template */
  longDescription: string;
  /** Icon emoji for display */
  icon: string;
  /** Required gateway type */
  gatewayType: GatewayType;
  /** Difficulty level */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Tags for filtering */
  tags: string[];
  /** Plugins included in this template (in priority order) */
  plugins: BotTemplatePlugin[];
}

/** Listing item (without full config details) */
export interface BotTemplateListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  gatewayType: GatewayType;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  pluginCount: number;
  pluginNames: string[];
}

// ===========================================
// Bot Template Definitions
// ===========================================

const BOT_TEMPLATES: BotTemplate[] = [
  {
    id: "ai-assistant",
    name: "AI Assistant Bot",
    description: "A smart AI-powered chatbot with conversation memory and analytics tracking.",
    longDescription:
      "Set up an intelligent chatbot that uses AI to respond to messages, " +
      "remembers conversation context, and tracks usage analytics. " +
      "Perfect for customer support, personal assistants, or community bots.",
    icon: "🤖",
    gatewayType: "TELEGRAM_BOT",
    difficulty: "beginner",
    tags: ["ai", "chat", "assistant", "analytics", "popular"],
    plugins: [
      {
        templateId: "ai-chat-bot",
        config: {
          model: "auto",
          systemPrompt: "You are a helpful assistant. Be concise and friendly.",
          maxHistory: 10,
        },
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
      {
        templateId: "channel-analytics",
        config: {
          trackUsers: true,
          trackChats: true,
          retentionDays: 30,
          enableHourlyStats: false,
        },
        eventRole: "observer",
        eventTypes: ["telegram.message"],
      },
    ],
  },
  {
    id: "community-bot",
    name: "Community Manager",
    description: "Auto-reply to common questions and track community engagement.",
    longDescription:
      "Automatically respond to FAQs, greet new members, and track " +
      "community activity stats. Customize keyword-response rules to " +
      "handle the most common questions without manual intervention.",
    icon: "👥",
    gatewayType: "TELEGRAM_BOT",
    difficulty: "beginner",
    tags: ["community", "auto-reply", "moderation", "analytics"],
    plugins: [
      {
        templateId: "auto-responder",
        config: {
          rules: [
            { keyword: "hello", response: "Hey there! 👋 Welcome to our community!" },
            { keyword: "help", response: "📚 Check our FAQ at /help or ask your question and an admin will respond." },
            { keyword: "rules", response: "📋 Be respectful, no spam, stay on topic. Full rules: /rules" },
          ],
        },
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
      {
        templateId: "channel-analytics",
        config: {
          trackUsers: true,
          trackChats: true,
          retentionDays: 90,
          enableHourlyStats: true,
        },
        eventRole: "observer",
        eventTypes: ["telegram.message"],
      },
    ],
  },
  {
    id: "ai-creative",
    name: "AI Creative Studio",
    description: "Generate text responses and AI images — a full creative toolkit bot.",
    longDescription:
      "Combines an AI chatbot for text conversations with AI image generation. " +
      "Users can chat naturally and generate images with /imagine. " +
      "Great for creative communities and content generation.",
    icon: "🎨",
    gatewayType: "TELEGRAM_BOT",
    difficulty: "intermediate",
    tags: ["ai", "image", "creative", "chat", "generation"],
    plugins: [
      {
        templateId: "ai-chat-bot",
        config: {
          model: "auto",
          systemPrompt:
            "You are a creative assistant. Help users with writing, ideas, and creative projects. " +
            "If they want to generate an image, tell them to use /imagine followed by their prompt.",
          maxHistory: 10,
        },
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
      {
        templateId: "ai-image-bot",
        config: {
          model: "auto",
          triggerPrefix: "/imagine ",
        },
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
    ],
  },
  {
    id: "utility-bot",
    name: "Utility Toolkit",
    description: "Weather, commands, and echo — a multi-purpose utility bot.",
    longDescription:
      "A versatile bot with weather lookups (/weather city), custom commands, " +
      "and echo functionality. A great starting point to build upon " +
      "with your own features.",
    icon: "🛠️",
    gatewayType: "TELEGRAM_BOT",
    difficulty: "beginner",
    tags: ["utilities", "weather", "commands", "starter"],
    plugins: [
      {
        templateId: "command-bot",
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
      {
        templateId: "weather-bot",
        config: { defaultCity: "" },
        eventRole: "responder",
        eventTypes: ["telegram.message"],
      },
    ],
  },
  {
    id: "analytics-dashboard",
    name: "Analytics Dashboard",
    description: "Track all bot activity with scheduled reports and real-time analytics.",
    longDescription:
      "Monitor your bot's activity with real-time analytics tracking and " +
      "periodic scheduled reports. See message counts, unique users, " +
      "peak hours, and engagement trends.",
    icon: "📊",
    gatewayType: "TELEGRAM_BOT",
    difficulty: "intermediate",
    tags: ["analytics", "reporting", "monitoring", "data"],
    plugins: [
      {
        templateId: "channel-analytics",
        config: {
          trackUsers: true,
          trackChats: true,
          retentionDays: 90,
          enableHourlyStats: true,
        },
        eventRole: "observer",
        eventTypes: ["telegram.message"],
      },
      {
        templateId: "scheduled-reporter",
        eventRole: "observer",
        eventTypes: [],
      },
    ],
  },
];

// ===========================================
// Template Accessors
// ===========================================

/**
 * Get all bot templates (listing format)
 */
export function getBotTemplateList(): BotTemplateListItem[] {
  return BOT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    gatewayType: t.gatewayType,
    difficulty: t.difficulty,
    tags: t.tags,
    pluginCount: t.plugins.length,
    pluginNames: t.plugins.map((p) => p.templateId),
  }));
}

/**
 * Get a specific bot template by ID
 */
export function getBotTemplateById(id: string): BotTemplate | undefined {
  return BOT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get bot templates filtered by gateway type
 */
export function getBotTemplatesByGateway(gatewayType: GatewayType): BotTemplateListItem[] {
  return getBotTemplateList().filter((t) => t.gatewayType === gatewayType);
}
