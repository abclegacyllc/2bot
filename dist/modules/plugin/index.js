"use strict";
/**
 * Plugin Module
 *
 * Manages plugin definitions, user plugin installations,
 * and plugin execution.
 *
 * @module modules/plugin
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
exports.pluginService = exports.PLUGIN_MODULE = void 0;
exports.PLUGIN_MODULE = "plugin";
// Types
__exportStar(require("./plugin.types"), exports);
// Validation
__exportStar(require("./plugin.validation"), exports);
// Service
var plugin_service_1 = require("./plugin.service");
Object.defineProperty(exports, "pluginService", { enumerable: true, get: function () { return plugin_service_1.pluginService; } });
//# sourceMappingURL=index.js.map