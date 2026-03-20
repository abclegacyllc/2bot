import { vertexTextGeneration } from "@/modules/2bot-ai-provider/adapters/vertex-ai.adapter";

const VERTEX_MODELS = [
  // Existing
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "llama-4-maverick-17b-128e-instruct-maas",
  "llama-4-scout-17b-16e-instruct-maas",
  "deepseek-r1-0528-maas",
  "qwen3-235b-a22b-instruct-2507-maas",
  "qwen3-coder-480b-a35b-instruct-maas",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  // New from Vertex AI Model Garden
  "glm-5-maas",
  "glm-4.7-maas",
  "deepseek-v3.1-maas",
  "deepseek-v3.2-maas",
  "deepseek-ocr-maas",
  "kimi-k2-thinking-maas",
  "minimax-m2-maas",
  "qwen3-next-80b-a3b-instruct-maas",
  "gpt-oss-120b-maas",
  "llama-3.3-70b-instruct-maas",
];

const GENLANG_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
];

async function testModel(modelId: string): Promise<void> {
  const start = Date.now();
  try {
    const result = await vertexTextGeneration({
      model: modelId,
      messages: [{ role: "user", content: "Say hi in 3 words" }],
      maxTokens: 20,
      temperature: 0.1,
      stream: false,
      tools: [],
      userId: "test-user",
    });
    const ms = Date.now() - start;
    console.log(`✅ ${modelId.padEnd(45)} ${String(ms).padStart(5)}ms  "${result.content.trim().slice(0, 50)}"`);
  } catch (err: any) {
    const ms = Date.now() - start;
    const msg = (err.message || String(err)).slice(0, 80);
    console.log(`❌ ${modelId.padEnd(45)} ${String(ms).padStart(5)}ms  ${msg}`);
  }
}

async function main() {
  console.log("Testing Vertex AI / Google text generation models...");
  console.log("=".repeat(100));
  
  console.log("\n--- Vertex AI (OpenAI-compat endpoint) ---");
  for (const m of VERTEX_MODELS) {
    await testModel(m);
  }
  
  console.log("\n--- GenLang API (routed from Vertex adapter) ---");
  for (const m of GENLANG_MODELS) {
    await testModel(m);
  }
  
  console.log("\nDone!");
}

main().catch(console.error);
