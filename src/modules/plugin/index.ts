/**
 * Plugin Module
 *
 * Manages plugin definitions, user plugin installations,
 * and plugin execution.
 *
 * @module modules/plugin
 */

export const PLUGIN_MODULE = "plugin" as const;

// Types
export * from "./plugin.types";

// Validation
export * from "./plugin.validation";

// Service
export { pluginService } from "./plugin.service";
