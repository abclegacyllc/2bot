/**
 * Quick test script for provider health and model discovery
 *
 * Run: npx tsx scripts/test-provider-health.ts
 */

import { config } from "dotenv";
// Load .env.local first, then .env as fallback
config({ path: ".env.local" });
config({ path: ".env" });

import {
    discoverAllModels,
    discoverAnthropicModels,
    discoverOpenAIModels,
} from "../src/modules/2bot-ai-provider/model-discovery.service";
import {
    getConfiguredProviders,
    isProviderConfigured
} from "../src/modules/2bot-ai-provider/provider-config";
import {
    checkAllProviders
} from "../src/modules/2bot-ai-provider/provider-health.service";

async function main() {
  console.log("\n===========================================");
  console.log("2Bot AI Provider Health & Model Discovery Test");
  console.log("===========================================\n");

  // Check env vars (without exposing full keys)
  const openaiKey = process.env.TWOBOT_OPENAI_API_KEY;
  const anthropicKey = process.env.TWOBOT_ANTHROPIC_API_KEY;

  console.log("Environment Variables:");
  console.log(`  TWOBOT_OPENAI_API_KEY: ${openaiKey ? `${openaiKey.slice(0, 15)}...${openaiKey.slice(-4)}` : "NOT SET"}`);
  console.log(`  TWOBOT_ANTHROPIC_API_KEY: ${anthropicKey ? `${anthropicKey.slice(0, 15)}...${anthropicKey.slice(-4)}` : "NOT SET"}`);

  // Basic format check
  console.log("\n1. Basic Format Checks (no API calls):");
  console.log(`  OpenAI configured: ${isProviderConfigured("openai")}`);
  console.log(`  Anthropic configured: ${isProviderConfigured("anthropic")}`);
  console.log(`  Configured providers: ${getConfiguredProviders().join(", ") || "NONE"}`);

  // Real health check
  console.log("\n2. Real API Health Checks (making actual API calls)...\n");

  const results = await checkAllProviders();

  for (const result of results) {
    const status = result.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY";
    console.log(`  ${result.provider.toUpperCase()}: ${status}`);
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
    if (result.latencyMs) {
      console.log(`    Latency: ${result.latencyMs}ms`);
    }
    console.log(`    Last checked: ${result.lastChecked.toISOString()}`);
    console.log();
  }

  // Model discovery
  console.log("3. Model Discovery (querying provider APIs)...\n");

  const healthyProviders = results.filter((r) => r.healthy);

  if (healthyProviders.length === 0) {
    console.log("  ❌ No healthy providers, skipping model discovery");
  } else {
    // Discover models from each provider
    if (results.find((r) => r.provider === "openai" && r.healthy)) {
      console.log("  Discovering OpenAI models...");
      const openaiModels = await discoverOpenAIModels();
      console.log(`  ✅ Found ${openaiModels.length} OpenAI models:`);
      for (const model of openaiModels) {
        const badge = model.badge ? ` [${model.badge}]` : "";
        const dep = model.deprecated ? " (DEPRECATED)" : "";
        console.log(`     - ${model.id} (${model.name})${badge}${dep}`);
      }
      console.log();
    }

    if (results.find((r) => r.provider === "anthropic" && r.healthy)) {
      console.log("  Discovering Anthropic models...");
      const anthropicModels = await discoverAnthropicModels();
      console.log(`  ✅ Found ${anthropicModels.length} Anthropic models:`);
      for (const model of anthropicModels) {
        const badge = model.badge ? ` [${model.badge}]` : "";
        const dep = model.deprecated ? " (DEPRECATED)" : "";
        console.log(`     - ${model.id} (${model.name})${badge}${dep}`);
      }
      console.log();
    }
  }

  // Final available models
  console.log("4. Final Available Models (after discovery):");
  const allModels = await discoverAllModels();
  console.log(`   Total: ${allModels.length} models\n`);

  // Group by provider and capability
  const byProvider: Record<string, typeof allModels> = {};
  for (const m of allModels) {
    const key = `${m.provider}/${m.capability}`;
    if (!byProvider[key]) byProvider[key] = [];
    byProvider[key].push(m);
  }

  for (const [key, models] of Object.entries(byProvider)) {
    console.log(`   ${key}:`);
    for (const m of models) {
      const badge = m.badge ? ` [${m.badge}]` : "";
      const def = m.isDefault ? " ⭐ DEFAULT" : "";
      const dep = m.deprecated ? " ⚠️ DEPRECATED" : "";
      console.log(`     - ${m.name}${badge}${def}${dep}`);
      console.log(`       ID: ${m.id}`);
      if (m.creditsPerInputToken) console.log(`       Cost: ${m.creditsPerInputToken}/${m.creditsPerOutputToken} credits/1k tokens`);
    }
  }

  // Summary
  const healthyCount = results.filter((r) => r.healthy).length;
  console.log("\n===========================================");
  console.log(`SUMMARY:`);
  console.log(`  Providers: ${healthyCount}/${results.length} healthy`);
  console.log(`  Models: ${allModels.length} discovered`);
  if (healthyCount === 0) {
    console.log("\n⚠️  WARNING: No AI providers are working!");
    console.log("   Check your API keys in .env.local file:");
    console.log("   - TWOBOT_OPENAI_API_KEY=sk-...");
    console.log("   - TWOBOT_ANTHROPIC_API_KEY=sk-ant-...");
  }
  console.log("===========================================\n");
}

main().catch(console.error);
