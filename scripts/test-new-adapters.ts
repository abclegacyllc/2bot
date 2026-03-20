/**
 * Test script for new Google adapters:
 * 1. GenLang API (Gemini 3.x text generation)
 * 2. Imagen 4 native (Vertex AI predict endpoint)
 * 3. Veo video generation (Vertex AI predictLongRunning)
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-new-adapters.ts [genlang|imagen|veo|all]
 */

import { genLangTextGeneration, genLangTextGenerationStream } from "../src/modules/2bot-ai-provider/adapters/google-genlang.adapter";
import { vertexImageGeneration } from "../src/modules/2bot-ai-provider/adapters/vertex-ai.adapter";
import { veoVideoGeneration } from "../src/modules/2bot-ai-provider/adapters/google-veo.adapter";

const TESTS_TO_RUN = process.argv[2] || "all";

// ============================================
// Test: GenLang Text Generation
// ============================================
async function testGenLangText() {
  console.log("\n=== GenLang Text Generation ===\n");

  const models = [
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite-preview",
    "nano-banana-pro-preview",
  ];

  for (const model of models) {
    process.stdout.write(`  ${model}: `);
    try {
      const result = await genLangTextGeneration({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant. Reply in one sentence." },
          { role: "user", content: "What is the capital of France?" },
        ],
        temperature: 0.3,
        maxTokens: 100,
        userId: "test-user",
      });
      console.log(`✅ "${result.content.slice(0, 80)}..." (${result.usage.inputTokens}/${result.usage.outputTokens} tokens)`);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ============================================
// Test: GenLang Streaming
// ============================================
async function testGenLangStream() {
  console.log("\n=== GenLang Streaming ===\n");

  process.stdout.write("  gemini-3-flash-preview (stream): ");
  try {
    const gen = genLangTextGenerationStream({
      model: "gemini-3-flash-preview",
      messages: [
        { role: "user", content: "Say hello in 3 languages." },
      ],
      temperature: 0.3,
      maxTokens: 200,
      userId: "test-user",
    });

    let fullText = "";
    let result = await gen.next();
    while (!result.done) {
      fullText += result.value.delta;
      result = await gen.next();
    }
    const usage = result.value;
    console.log(`✅ "${fullText.slice(0, 80)}..." (${usage.inputTokens}/${usage.outputTokens} tokens)`);
  } catch (err) {
    console.log(`❌ ${err instanceof Error ? err.message : err}`);
  }
}

// ============================================
// Test: GenLang Image Models (Gemini with image gen)
// ============================================
async function testGenLangImageModels() {
  console.log("\n=== GenLang Image-capable Models ===\n");

  const imageModels = [
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
  ];

  for (const model of imageModels) {
    process.stdout.write(`  ${model}: `);
    try {
      const result = await genLangTextGeneration({
        model,
        messages: [
          { role: "user", content: "Generate a simple image of a red circle on a white background." },
        ],
        temperature: 0.5,
        maxTokens: 1000,
        userId: "test-user",
      });
      const hasImage = result.content.includes("data:image/");
      console.log(`${hasImage ? "✅" : "⚠️"} response: ${result.content.slice(0, 100)}... (${result.usage.totalTokens} tokens, hasImage=${hasImage})`);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ============================================
// Test: Imagen 4 Native (Vertex AI predict)
// ============================================
async function testImagen4() {
  console.log("\n=== Imagen 4 Native (Vertex AI) ===\n");

  const models = [
    "imagen-4.0-fast-generate-001",
    "imagen-4.0-generate-001",
    "imagen-4.0-ultra-generate-001",
  ];

  for (const model of models) {
    process.stdout.write(`  ${model}: `);
    try {
      const result = await vertexImageGeneration({
        model,
        prompt: "A beautiful sunset over the ocean, oil painting style",
        size: "1024x1024",
        userId: "test-user",
      });
      const hasData = result.images[0]?.url?.startsWith("data:");
      console.log(`✅ imageDataUrl=${hasData}, model=${result.model}`);
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ============================================
// Test: Veo Video Generation
// ============================================
async function testVeo() {
  console.log("\n=== Veo Video Generation ===\n");
  console.log("  (Note: Video generation is slow — may take 1-5 minutes per model)");
  console.log("  Testing only veo-3.0-fast-generate-001 for speed\n");

  process.stdout.write("  veo-3.0-fast-generate-001: ");
  try {
    const result = await veoVideoGeneration({
      model: "veo-3.0-fast-generate-001",
      prompt: "A calm ocean wave at sunset, slow motion",
      durationSeconds: 4,
      aspectRatio: "16:9",
      userId: "test-user",
    });
    const hasData = result.videoUrl?.startsWith("data:");
    console.log(`✅ videoDataUrl=${hasData}, duration=${result.durationSeconds}s, mime=${result.mimeType}`);
  } catch (err) {
    console.log(`❌ ${err instanceof Error ? err.message : err}`);
  }
}

// ============================================
// Test: Model Registry Validation
// ============================================
async function testRegistry() {
  console.log("\n=== Model Registry Validation ===\n");

  const { MODEL_REGISTRY } = await import("../src/modules/2bot-ai-provider/model-registry");

  // Check GenLang models have google provider
  const genlangModelIds = [
    "google/gemini-3-flash-preview",
    "google/gemini-3-pro-preview",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.1-flash-lite-preview",
    "google/gemini-3-pro-image-preview",
    "google/gemini-3.1-flash-image-preview",
    "google/nano-banana-pro-preview",
  ];

  for (const id of genlangModelIds) {
    const entry = MODEL_REGISTRY.find((m) => m.id === id);
    const hasGoogle = !!entry?.providers.google;
    console.log(`  ${id}: ${hasGoogle ? "✅ google provider" : "❌ NO google provider"} ${entry ? "" : "(NOT FOUND IN REGISTRY)"}`);
  }

  // Check Imagen 4 models have google provider
  const imagenModels = ["google/imagen-4.0-fast", "google/imagen-4.0-preview", "google/imagen-4.0-ultra"];
  for (const id of imagenModels) {
    const entry = MODEL_REGISTRY.find((m) => m.id === id);
    const hasGoogle = !!entry?.providers.google;
    console.log(`  ${id}: ${hasGoogle ? "✅ google provider" : "❌ NO google provider"}`);
  }

  // Check Veo models exist
  const veoModels = ["google/veo-2.0", "google/veo-3.0-fast", "google/veo-3.0", "google/veo-3.1-fast", "google/veo-3.1"];
  for (const id of veoModels) {
    const entry = MODEL_REGISTRY.find((m) => m.id === id);
    console.log(`  ${id}: ${entry ? "✅ found" : "❌ NOT FOUND"} ${entry?.capability === "video-generation" ? "(video-generation)" : ""}`);
  }

  // Summary counts
  const googleTextModels = MODEL_REGISTRY.filter((m) => m.providers.google && m.capability === "text-generation");
  const googleImageModels = MODEL_REGISTRY.filter((m) => m.providers.google && m.capability === "image-generation");
  const googleVideoModels = MODEL_REGISTRY.filter((m) => m.providers.google && m.capability === "video-generation");
  console.log(`\n  Summary: Google provider has ${googleTextModels.length} text, ${googleImageModels.length} image, ${googleVideoModels.length} video models`);
}

// ============================================
// Main
// ============================================
async function main() {
  console.log("🧪 Testing New Google Adapters");
  console.log("==============================");

  // Always run registry validation first
  await testRegistry();

  if (TESTS_TO_RUN === "all" || TESTS_TO_RUN === "genlang") {
    await testGenLangText();
    await testGenLangStream();
    await testGenLangImageModels();
  }

  if (TESTS_TO_RUN === "all" || TESTS_TO_RUN === "imagen") {
    await testImagen4();
  }

  if (TESTS_TO_RUN === "veo") {
    // Only run Veo when explicitly requested (slow)
    await testVeo();
  }

  if (TESTS_TO_RUN === "all") {
    console.log("\n  ℹ️  Veo test skipped (slow). Run with: npx tsx --env-file=.env.local scripts/test-new-adapters.ts veo");
  }

  console.log("\n✅ Done!\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
