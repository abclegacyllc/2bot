/**
 * Provider Fetchers — Barrel Export
 *
 * To add a new provider:
 * 1. Create `<provider-name>.fetcher.ts` implementing `ProviderFetcher`
 * 2. Export it from this file
 * 3. Add it to PROVIDER_FETCHERS in pricing-monitor.service.ts
 *
 * @module modules/2bot-ai-provider/pricing-monitor/provider-fetchers/index
 */

export { AnthropicFetcher } from "./anthropic.fetcher";
export { FireworksFetcher } from "./fireworks.fetcher";
export { OpenAIFetcher } from "./openai.fetcher";
export { OpenRouterFetcher } from "./openrouter.fetcher";
export { TogetherAIFetcher } from "./together-ai.fetcher";

