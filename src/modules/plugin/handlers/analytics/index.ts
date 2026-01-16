/**
 * Analytics Plugin Module
 *
 * Built-in plugin that tracks message statistics and user activity
 * for Telegram bots.
 *
 * @module modules/plugin/handlers/analytics
 */

// Types
export * from "./analytics.types";

// Storage
export { AnalyticsStorage, createAnalyticsStorage } from "./analytics.storage";

// Handler
export { AnalyticsPlugin, analyticsPlugin } from "./analytics.handler";
