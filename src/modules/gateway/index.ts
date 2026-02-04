/**
 * Gateway Module
 *
 * Manages Telegram Bot, AI providers, and webhook gateways
 * with encrypted credential storage and status tracking.
 *
 * Also includes BYOK (Bring Your Own Key) AI usage tracking.
 * BYOK is for users who use their own API keys - metrics only, no credits.
 *
 * @module modules/gateway
 */

export const GATEWAY_MODULE = "gateway" as const;

// Types
export * from "./gateway.types";

// Validation
export * from "./gateway.validation";

// Service
export { gatewayService } from "./gateway.service";

// Monitoring
export { gatewayMonitor } from "./gateway-monitor";

// Registry
export {
    GatewayRegistryError, gatewayRegistry, type GatewayAction, type GatewayProvider, type ProviderRegistrationOptions
} from "./gateway.registry";

// Providers
export {
    AIApiError, AIProvider, BaseGatewayProvider,
    GatewayNotConnectedError, InvalidCredentialsError, TelegramApiError, TelegramBotProvider, UnsupportedActionError, aiProvider, telegramBotProvider
} from "./providers";

// Circuit Breaker
export {
    CircuitOpenError, GatewayUnavailableError, executeWithCircuit, getAllGatewayCircuitStats, getGatewayCircuitStats, isGatewayCircuitAvailable,
    withCircuitBreaker
} from "./gateway-circuit";

// ===========================================
// BYOK AI Usage Tracking (Metrics Only)
// ===========================================

// BYOK Usage Service - Records usage for user's own API keys
export {
    byokUsageService,
    getBillingPeriod,
    getCurrentBillingPeriod,
    type AICapability,
    type BYOKChatUsageData,
    type BYOKImageUsageData,
    type BYOKSTTUsageData,
    type BYOKTTSUsageData,
    type BYOKUsageData,
    type BYOKUsageStats,
    type RecordBYOKUsageData
} from "./ai-usage.service";

// BYOK Metrics Service - Display-only usage stats
export {
    byokMetricsService,
    type BYOKTokenBreakdown,
    type BYOKTokenUsage
} from "./ai-metrics.service";
