/**
 * Analytics Plugin Types
 *
 * Data structures for the built-in analytics plugin that tracks
 * message statistics and user activity for Telegram bots.
 *
 * @module modules/plugin/handlers/analytics/analytics.types
 */

// ===========================================
// Analytics Data Structures
// ===========================================

/**
 * Daily statistics snapshot
 */
export interface DailyStats {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Number of messages received that day */
  messagesReceived: number;
  /** Number of messages sent that day */
  messagesSent: number;
  /** Number of unique users that day */
  uniqueUsers: number;
  /** User IDs seen that day (stored separately for counting) */
  userIds: string[];
}

/**
 * Hourly statistics (for real-time charts)
 */
export interface HourlyStats {
  /** Hour in YYYY-MM-DD-HH format */
  hour: string;
  /** Number of messages in that hour */
  messages: number;
}

/**
 * Chat/Channel statistics
 */
export interface ChatStats {
  /** Telegram chat ID */
  chatId: number;
  /** Chat type */
  chatType: "private" | "group" | "supergroup" | "channel";
  /** Chat title (for groups/channels) */
  chatTitle?: string;
  /** Total messages from this chat */
  messageCount: number;
  /** First message timestamp */
  firstMessageAt: Date;
  /** Last message timestamp */
  lastMessageAt: Date;
}

/**
 * User statistics
 */
export interface UserStats {
  /** Telegram user ID */
  telegramUserId: number;
  /** Username (if available) */
  username?: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName?: string;
  /** Total messages from this user */
  messageCount: number;
  /** First seen timestamp */
  firstSeenAt: Date;
  /** Last seen timestamp */
  lastSeenAt: Date;
}

/**
 * Aggregated analytics data for a user plugin installation
 */
export interface AnalyticsData {
  /** Total messages received (incoming) */
  totalMessagesReceived: number;
  /** Total messages sent (outgoing via bot) */
  totalMessagesSent: number;
  /** Total unique users seen */
  totalUniqueUsers: number;
  /** Total unique chats/channels */
  totalUniqueChats: number;
  /** First activity timestamp */
  firstActivityAt: Date | null;
  /** Last activity timestamp */
  lastActivityAt: Date | null;
  /** When stats were last updated */
  updatedAt: Date;
}

/**
 * Analytics summary response (for API/UI)
 */
export interface AnalyticsSummary {
  /** User plugin installation ID */
  userPluginId: string;
  /** Overall statistics */
  totals: {
    messagesReceived: number;
    messagesSent: number;
    uniqueUsers: number;
    uniqueChats: number;
  };
  /** Today's stats */
  today: {
    messages: number;
    uniqueUsers: number;
  };
  /** Last 7 days daily breakdown */
  dailyStats: DailyStats[];
  /** Last 24 hours hourly breakdown */
  hourlyStats: HourlyStats[];
  /** Top active users */
  topUsers: Array<{
    telegramUserId: number;
    username?: string;
    firstName: string;
    messageCount: number;
  }>;
  /** Top active chats */
  topChats: Array<{
    chatId: number;
    chatType: string;
    chatTitle?: string;
    messageCount: number;
  }>;
}

// ===========================================
// Analytics Events
// ===========================================

/**
 * Event types that the analytics plugin tracks
 */
export type AnalyticsEventType =
  | "message.received"
  | "message.sent"
  | "callback.received"
  | "user.new"
  | "chat.new";

/**
 * Analytics event for tracking
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: Date;
  chatId: number;
  chatType: "private" | "group" | "supergroup" | "channel";
  chatTitle?: string;
  userId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  messageId?: number;
}

// ===========================================
// Analytics Configuration
// ===========================================

/**
 * Analytics plugin configuration options
 */
export interface AnalyticsConfig {
  /** Whether to track individual users */
  trackUsers: boolean;
  /** Whether to track individual chats */
  trackChats: boolean;
  /** Data retention period in days (default: 30) */
  retentionDays: number;
  /** Enable hourly stats (more storage, better granularity) */
  enableHourlyStats: boolean;
  /** Maximum number of top users to track */
  topUsersLimit: number;
  /** Maximum number of top chats to track */
  topChatsLimit: number;
}

/**
 * Default configuration
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  trackUsers: true,
  trackChats: true,
  retentionDays: 30,
  enableHourlyStats: true,
  topUsersLimit: 10,
  topChatsLimit: 10,
};

// ===========================================
// Storage Keys
// ===========================================

/**
 * Redis key patterns for analytics storage
 * All keys are prefixed with the userPluginId for isolation
 */
export const ANALYTICS_KEYS = {
  /** Main stats: analytics:{userPluginId}:stats */
  stats: (userPluginId: string) => `analytics:${userPluginId}:stats`,

  /** Daily stats: analytics:{userPluginId}:daily:{YYYY-MM-DD} */
  daily: (userPluginId: string, date: string) =>
    `analytics:${userPluginId}:daily:${date}`,

  /** Hourly stats: analytics:{userPluginId}:hourly:{YYYY-MM-DD-HH} */
  hourly: (userPluginId: string, hour: string) =>
    `analytics:${userPluginId}:hourly:${hour}`,

  /** Users set: analytics:{userPluginId}:users (sorted set by message count) */
  users: (userPluginId: string) => `analytics:${userPluginId}:users`,

  /** User details: analytics:{userPluginId}:user:{telegramUserId} */
  userDetail: (userPluginId: string, telegramUserId: number) =>
    `analytics:${userPluginId}:user:${telegramUserId}`,

  /** Chats set: analytics:{userPluginId}:chats (sorted set by message count) */
  chats: (userPluginId: string) => `analytics:${userPluginId}:chats`,

  /** Chat details: analytics:{userPluginId}:chat:{chatId} */
  chatDetail: (userPluginId: string, chatId: number) =>
    `analytics:${userPluginId}:chat:${chatId}`,

  /** Daily users set: analytics:{userPluginId}:daily:{date}:users */
  dailyUsers: (userPluginId: string, date: string) =>
    `analytics:${userPluginId}:daily:${date}:users`,
} as const;
