"use strict";
// Application Constants - Re-export all constants
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
exports.HTTP_STATUS = exports.APP_CONFIG = exports.GATEWAY_TYPES = void 0;
__exportStar(require("./data-categories"), exports);
__exportStar(require("./limits"), exports);
__exportStar(require("./org-plans"), exports);
__exportStar(require("./permissions"), exports);
__exportStar(require("./plans"), exports);
__exportStar(require("./rate-limits"), exports);
__exportStar(require("./workspace-addons"), exports);
/**
 * Supported gateway types
 */
exports.GATEWAY_TYPES = {
    TELEGRAM_BOT: "telegram_bot",
    AI_OPENAI: "ai_openai",
};
/**
 * Application-wide settings
 */
exports.APP_CONFIG = {
    name: "2Bot",
    version: "0.1.0",
    apiVersion: "v1",
    defaultPageSize: 20,
    maxPageSize: 100,
    supportEmail: "support@2bot.org",
    docsUrl: "https://docs.2bot.org",
};
/**
 * HTTP Status Codes (commonly used)
 */
exports.HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 422,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
};
//# sourceMappingURL=index.js.map