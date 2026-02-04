"use strict";
/**
 * 2Bot AI Provider Types
 *
 * Shared types for the 2Bot AI service.
 * This is 2Bot's own AI service (not BYOK).
 *
 * @module modules/2bot-ai-provider/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoBotAIError = void 0;
// ===========================================
// Error Types
// ===========================================
class TwoBotAIError extends Error {
    code;
    statusCode;
    details;
    constructor(message, code, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = "TwoBotAIError";
    }
}
exports.TwoBotAIError = TwoBotAIError;
//# sourceMappingURL=types.js.map