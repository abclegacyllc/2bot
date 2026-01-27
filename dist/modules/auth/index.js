"use strict";
/**
 * Auth Module
 *
 * Exports all authentication-related components.
 *
 * @module modules/auth
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
exports.authService = exports.AuthService = exports.AuthError = exports.AUTH_MODULE = void 0;
exports.AUTH_MODULE = "auth";
// Service
var auth_service_1 = require("./auth.service");
Object.defineProperty(exports, "AuthError", { enumerable: true, get: function () { return auth_service_1.AuthError; } });
Object.defineProperty(exports, "AuthService", { enumerable: true, get: function () { return auth_service_1.AuthService; } });
Object.defineProperty(exports, "authService", { enumerable: true, get: function () { return auth_service_1.authService; } });
// Types
__exportStar(require("./auth.types"), exports);
// Validation schemas
__exportStar(require("./auth.validation"), exports);
// Placeholder - routes will be added in task 1.3.x
// export * from "./auth.routes";
//# sourceMappingURL=index.js.map