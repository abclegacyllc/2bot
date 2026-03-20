/**
 * Test new Vertex AI models from the Model Garden attachment.
 * Tests both regional and global endpoint formats.
 */
import { logger } from "@/lib/logger";
import OpenAI from "openai";

// Suppress pino log output
logger.level = "silent";

const PROJECT = process.env.TWOBOT_VERTEX_AI_PROJECT!;

// Reuse token logic from adapter
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = JSON.parse(process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT!) as any;
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })).toString("base64url");
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;
  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await resp.json() as any;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function getClient(region: string): Promise<OpenAI> {
  const token = await getAccessToken();
  // "global" region uses different URL format
  const baseURL = region === "global"
    ? `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/endpoints/openapi`
    : `https://${region}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${region}/endpoints/openapi`;
  return new OpenAI({ apiKey: token, baseURL, timeout: 30_000 });
}

interface TestModel { name: string; modelId: string; region: string; }

const MODELS_TO_TEST: TestModel[] = [
  // --- NEW from attachment ---
  { name: "GLM 5",              modelId: "zai-org/glm-5-maas",                          region: "global" },
  { name: "GLM 4.7",            modelId: "zai-org/glm-4.7-maas",                        region: "global" },
  { name: "DeepSeek V3.2",      modelId: "deepseek-ai/deepseek-v3.2-maas",              region: "global" },
  { name: "DeepSeek V3.1",      modelId: "deepseek-ai/deepseek-v3.1-maas",              region: "us-west2" },
  { name: "Kimi K2",            modelId: "moonshotai/kimi-k2-thinking-maas",            region: "global" },
  { name: "MiniMax M2",         modelId: "minimaxai/minimax-m2-maas",                   region: "global" },
  { name: "Qwen3-Next 80B",     modelId: "qwen/qwen3-next-80b-a3b-instruct-maas",      region: "global" },
  { name: "GPT-OSS 120B",       modelId: "openai/gpt-oss-120b-maas",                    region: "global" },
  // --- EXISTING (verify) ---
  { name: "DeepSeek R1 0528",   modelId: "deepseek-ai/deepseek-r1-0528-maas",           region: "us-central1" },
  { name: "Llama 4 Maverick",   modelId: "meta/llama-4-maverick-17b-128e-instruct-maas", region: "us-east5" },
  { name: "Qwen3 235B",         modelId: "qwen/qwen3-235b-a22b-instruct-2507-maas",     region: "us-south1" },
  { name: "Gemini 2.5 Flash",   modelId: "google/gemini-2.5-flash",                      region: "us-central1" },
];

async function testModel(m: TestModel): Promise<void> {
  const start = Date.now();
  try {
    const client = await getClient(m.region);
    const resp = await client.chat.completions.create({
      model: m.modelId,
      messages: [{ role: "user", content: "Say hi in 3 words" }],
      max_tokens: 20,
      temperature: 0.1,
      stream: false,
    });
    const ms = Date.now() - start;
    const content = (resp as any).choices?.[0]?.message?.content?.trim().slice(0, 50) || "(empty)";
    console.log(`✅ ${m.name.padEnd(22)} ${m.region.padEnd(14)} ${String(ms).padStart(5)}ms  "${content}"`);
  } catch (err: any) {
    const ms = Date.now() - start;
    const status = err.status || "???";
    const msg = (err.message || String(err)).slice(0, 60);
    console.log(`❌ ${m.name.padEnd(22)} ${m.region.padEnd(14)} ${String(ms).padStart(5)}ms  [${status}] ${msg}`);
  }
}

async function main() {
  console.log("Testing Vertex AI models (new + existing)...");
  console.log("=".repeat(100));
  console.log(`${"Model".padEnd(22)} ${"Region".padEnd(14)} ${"Time".padStart(5)}   Result`);
  console.log("-".repeat(100));
  for (const m of MODELS_TO_TEST) {
    await testModel(m);
  }
  console.log("\nDone!");
}

main().catch(console.error);
