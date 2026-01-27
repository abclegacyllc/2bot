"use strict";
/**
 * Gateway Module
 *
 * Manages Telegram Bot, AI providers, and webhook gateways
 * with encrypted credential storage and status tracking.
 *
 * @module modules/gateway
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
exports.withCircuitBreaker = exports.isGatewayCircuitAvailable = exports.getGatewayCircuitStats = exports.getAllGatewayCircuitStats = exports.executeWithCircuit = exports.GatewayUnavailableError = exports.CircuitOpenError = exports.telegramBotProvider = exports.aiProvider = exports.UnsupportedActionError = exports.TelegramBotProvider = exports.TelegramApiError = exports.InvalidCredentialsError = exports.GatewayNotConnectedError = exports.BaseGatewayProvider = exports.AIProvider = exports.AIApiError = exports.gatewayRegistry = exports.GatewayRegistryError = exports.gatewayService = exports.GATEWAY_MODULE = void 0;
exports.GATEWAY_MODULE = "gateway";
// Types
__exportStar(require("./gateway.types"), exports);
// Validation
__exportStar(require("./gateway.validation"), exports);
// Service
var gateway_service_1 = require("./gateway.service");
Object.defineProperty(exports, "gatewayService", { enumerable: true, get: function () { return gateway_service_1.gatewayService; } });
// Registry
var gateway_registry_1 = require("./gateway.registry");
Object.defineProperty(exports, "GatewayRegistryError", { enumerable: true, get: function () { return gateway_registry_1.GatewayRegistryError; } });
Object.defineProperty(exports, "gatewayRegistry", { enumerable: true, get: function () { return gateway_registry_1.gatewayRegistry; } });
// Providers
var providers_1 = require("./providers");
Object.defineProperty(exports, "AIApiError", { enumerable: true, get: function () { return providers_1.AIApiError; } });
Object.defineProperty(exports, "AIProvider", { enumerable: true, get: function () { return providers_1.AIProvider; } });
Object.defineProperty(exports, "BaseGatewayProvider", { enumerable: true, get: function () { return providers_1.BaseGatewayProvider; } });
Object.defineProperty(exports, "GatewayNotConnectedError", { enumerable: true, get: function () { return providers_1.GatewayNotConnectedError; } });
Object.defineProperty(exports, "InvalidCredentialsError", { enumerable: true, get: function () { return providers_1.InvalidCredentialsError; } });
Object.defineProperty(exports, "TelegramApiError", { enumerable: true, get: function () { return providers_1.TelegramApiError; } });
Object.defineProperty(exports, "TelegramBotProvider", { enumerable: true, get: function () { return providers_1.TelegramBotProvider; } });
Object.defineProperty(exports, "UnsupportedActionError", { enumerable: true, get: function () { return providers_1.UnsupportedActionError; } });
Object.defineProperty(exports, "aiProvider", { enumerable: true, get: function () { return providers_1.aiProvider; } });
Object.defineProperty(exports, "telegramBotProvider", { enumerable: true, get: function () { return providers_1.telegramBotProvider; } });
// Circuit Breaker
var gateway_circuit_1 = require("./gateway-circuit");
Object.defineProperty(exports, "CircuitOpenError", { enumerable: true, get: function () { return gateway_circuit_1.CircuitOpenError; } });
Object.defineProperty(exports, "GatewayUnavailableError", { enumerable: true, get: function () { return gateway_circuit_1.GatewayUnavailableError; } });
Object.defineProperty(exports, "executeWithCircuit", { enumerable: true, get: function () { return gateway_circuit_1.executeWithCircuit; } });
Object.defineProperty(exports, "getAllGatewayCircuitStats", { enumerable: true, get: function () { return gateway_circuit_1.getAllGatewayCircuitStats; } });
Object.defineProperty(exports, "getGatewayCircuitStats", { enumerable: true, get: function () { return gateway_circuit_1.getGatewayCircuitStats; } });
Object.defineProperty(exports, "isGatewayCircuitAvailable", { enumerable: true, get: function () { return gateway_circuit_1.isGatewayCircuitAvailable; } });
Object.defineProperty(exports, "withCircuitBreaker", { enumerable: true, get: function () { return gateway_circuit_1.withCircuitBreaker; } });
//# sourceMappingURL=index.js.map