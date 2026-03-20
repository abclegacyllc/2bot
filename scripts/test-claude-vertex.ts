import { vertexTextGeneration } from "@/modules/2bot-ai-provider/adapters/vertex-ai.adapter";

const CLAUDE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

async function testModel(modelId: string) {
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
    console.log(
      `✅ ${modelId.padEnd(35)} ${String(ms).padStart(5)}ms  "${result.content.trim().slice(0, 60)}"`,
    );
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 120);
    console.log(
      `❌ ${modelId.padEnd(35)} ${String(ms).padStart(5)}ms  ${msg}`,
    );
  }
}

async function main() {
  console.log("Testing Claude models via Vertex AI rawPredict...\n");
  for (const m of CLAUDE_MODELS) {
    await testModel(m);
  }
  console.log("\nDone!");
}

main().catch(console.error);
