"use strict";
/**
 * Plugin Handlers
 *
 * Registry of all built-in plugin handlers.
 * Marketplace plugins (V2) will be loaded dynamically.
 *
 * @module modules/plugin/handlers
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_PLUGINS = void 0;
exports.getPluginHandler = getPluginHandler;
exports.isBuiltinPlugin = isBuiltinPlugin;
exports.getBuiltinPluginSlugs = getBuiltinPluginSlugs;
exports.getAllBuiltinPlugins = getAllBuiltinPlugins;
exports.getAllBuiltinPluginSeedData = getAllBuiltinPluginSeedData;
const analytics_1 = require("./analytics");
// ===========================================
// Built-in Plugins Registry
// ===========================================
/**
 * All built-in plugin handlers
 */
exports.BUILTIN_PLUGINS = new Map([
    [
        analytics_1.analyticsPlugin.slug,
        {
            handler: analytics_1.analyticsPlugin,
            isBuiltin: true,
            tags: ["analytics", "statistics", "telegram", "tracking"],
            icon: "chart-bar",
        },
    ],
]);
/**
 * Get a plugin handler by slug
 */
function getPluginHandler(slug) {
    return exports.BUILTIN_PLUGINS.get(slug)?.handler;
}
/**
 * Check if a plugin is built-in
 */
function isBuiltinPlugin(slug) {
    return exports.BUILTIN_PLUGINS.has(slug);
}
/**
 * Get all built-in plugin slugs
 */
function getBuiltinPluginSlugs() {
    return Array.from(exports.BUILTIN_PLUGINS.keys());
}
/**
 * Get all built-in plugin registrations
 */
function getAllBuiltinPlugins() {
    return Array.from(exports.BUILTIN_PLUGINS.values());
}
/**
 * Get all built-in plugin seed data for database seeding.
 * This ensures the database schema matches the handler definitions (single source of truth).
 */
function getAllBuiltinPluginSeedData() {
    return Array.from(exports.BUILTIN_PLUGINS.values()).map((registration) => registration.handler.toSeedData());
}
// Re-export analytics module
__exportStar(require("./analytics"), exports);
//# sourceMappingURL=index.js.map