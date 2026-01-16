/**
 * Plugin Handlers
 *
 * Registry of all built-in plugin handlers.
 * Marketplace plugins (V2) will be loaded dynamically.
 *
 * @module modules/plugin/handlers
 */

import { Prisma } from "@prisma/client";

import type { PluginHandler, PluginRegistration } from "../plugin.interface";
import { analyticsPlugin } from "./analytics";

// ===========================================
// Built-in Plugins Registry
// ===========================================

/**
 * All built-in plugin handlers
 */
export const BUILTIN_PLUGINS: Map<string, PluginRegistration> = new Map([
  [
    analyticsPlugin.slug,
    {
      handler: analyticsPlugin,
      isBuiltin: true,
      tags: ["analytics", "statistics", "telegram", "tracking"],
      icon: "chart-bar",
    },
  ],
]);

/**
 * Get a plugin handler by slug
 */
export function getPluginHandler(slug: string): PluginHandler | undefined {
  return BUILTIN_PLUGINS.get(slug)?.handler;
}

/**
 * Check if a plugin is built-in
 */
export function isBuiltinPlugin(slug: string): boolean {
  return BUILTIN_PLUGINS.has(slug);
}

/**
 * Get all built-in plugin slugs
 */
export function getBuiltinPluginSlugs(): string[] {
  return Array.from(BUILTIN_PLUGINS.keys());
}

/**
 * Get all built-in plugin registrations
 */
export function getAllBuiltinPlugins(): PluginRegistration[] {
  return Array.from(BUILTIN_PLUGINS.values());
}

/**
 * Get all built-in plugin seed data for database seeding.
 * This ensures the database schema matches the handler definitions (single source of truth).
 */
export function getAllBuiltinPluginSeedData(): Prisma.PluginCreateInput[] {
  return Array.from(BUILTIN_PLUGINS.values()).map(
    (registration) => registration.handler.toSeedData()
  );
}

// Re-export analytics module
export * from "./analytics";
