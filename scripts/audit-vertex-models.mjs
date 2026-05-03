#!/usr/bin/env node
/**
 * One-time audit script: test every Google Vertex AI model in our registry.
 * Run: node scripts/audit-vertex-models.mjs
 */
import { createSign } from "crypto";
import "dotenv/config";

const sa = JSON.parse(process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT);
const project = process.env.TWOBOT_VERTEX_AI_PROJECT;
const region = process.env.TWOBOT_VERTEX_AI_REGION || "us-central1";

console.log(`Project: ${project}, Region: ${region}, SA: ${sa.client_email}`);

// Get access token
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const payload = b64url(JSON.stringify({
  iss: sa.client_email,
  scope: "https://www.googleapis.com/auth/cloud-platform",
  aud: sa.token_uri || "https://oauth2.googleapis.com/token",
  iat: now, exp: now + 3600,
}));
const sign = createSign("RSA-SHA256");
sign.update(`${header}.${payload}`);
const signature = sign.sign(sa.private_key, "base64url");
const jwt = `${header}.${payload}.${signature}`;

const tokenRes = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
});
const { access_token } = await tokenRes.json();
console.log(`Token OK: ${access_token.slice(0, 20)}...`);
console.log();

const BASE = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}`;

async function testModel(modelId, endpoint, body) {
  const url = `${BASE}/publishers/google/models/${modelId}:${endpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (res.ok) {
      return { status: res.status, ok: true, snippet: text.slice(0, 120) };
    }
    return { status: res.status, ok: false, error: text.slice(0, 250) };
  } catch (e) {
    return { status: 0, ok: false, error: e.message?.slice(0, 150) };
  }
}

// MaaS third-party models — use rawPredict with OpenAI-compatible format
const maasModels = [
  "claude-sonnet-4-6", "claude-opus-4-6",
  "deepseek-v3.1-maas", "deepseek-v3.2-maas", "deepseek-r1-0528-maas", "deepseek-ocr-maas",
  "llama-4-maverick-17b-128e-instruct-maas", "llama-4-scout-17b-16e-instruct-maas", "llama-3.3-70b-instruct-maas",
  "gpt-oss-120b-maas", "glm-5-maas", "glm-4.7-maas",
  "minimax-m2-maas", "qwen3-235b-a22b-instruct-2507-maas", "qwen3-next-80b-a3b-instruct-maas",
  "qwen3-next-80b-a3b-thinking-maas", "kimi-k2-thinking-maas",
  "grok-4.20-non-reasoning", "grok-4.1-fast-non-reasoning", "grok-4.1-fast-reasoning",
  "codestral-2", "qwen3-coder-480b-a35b-instruct-maas",
];

const geminiModels = [
  "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro",
  "gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview", "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview", "gemini-2.5-flash-image",
];

console.log("=== MaaS / Third-Party Models (rawPredict) ===");
for (const m of maasModels) {
  const r = await testModel(m, "rawPredict", {
    model: m, messages: [{ role: "user", content: "Say hi in one word" }], max_tokens: 5, stream: false,
  });
  const tag = r.ok ? "✅ OK" : `❌ ${r.status}`;
  console.log(`  ${m}: ${tag}${r.ok ? "" : " — " + r.error?.slice(0, 150)}`);
}

console.log();
console.log("=== Gemini Models (generateContent) ===");
for (const m of geminiModels) {
  const r = await testModel(m, "generateContent", {
    contents: [{ role: "user", parts: [{ text: "Say hi in one word" }] }],
    generationConfig: { maxOutputTokens: 5 },
  });
  const tag = r.ok ? "✅ OK" : `❌ ${r.status}`;
  console.log(`  ${m}: ${tag}${r.ok ? "" : " — " + r.error?.slice(0, 150)}`);
}

// Image models
console.log();
console.log("=== Image Models (predict) ===");
const imageModels = [
  "imagen-4.0-fast-generate-001", "imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001",
];
for (const m of imageModels) {
  // Just check if the endpoint accepts requests (we won't generate an actual image)
  const r = await testModel(m, "predict", {
    instances: [{ prompt: "a red dot" }],
    parameters: { sampleCount: 1 },
  });
  const tag = r.ok ? "✅ OK" : `❌ ${r.status}`;
  console.log(`  ${m}: ${tag}${r.ok ? "" : " — " + r.error?.slice(0, 150)}`);
}

// Video models
console.log();
console.log("=== Video Models (predict) ===");
const videoModels = [
  "veo-2.0-generate-001", "veo-3.0-fast-generate-001", "veo-3.0-generate-001",
  "veo-3.1-fast-generate-preview", "veo-3.1-generate-001",
];
for (const m of videoModels) {
  const r = await testModel(m, "predict", {
    instances: [{ prompt: "a red dot moving slowly" }],
    parameters: {},
  });
  const tag = r.ok ? "✅ OK" : `❌ ${r.status}`;
  console.log(`  ${m}: ${tag}${r.ok ? "" : " — " + r.error?.slice(0, 150)}`);
}

// Embedding models
console.log();
console.log("=== Embedding Models (predict) ===");
const embeddingModels = ["multilingual-e5-large-instruct-maas", "multilingual-e5-small-maas"];
for (const m of embeddingModels) {
  const r = await testModel(m, "rawPredict", {
    input: ["hello"], model: m,
  });
  const tag = r.ok ? "✅ OK" : `❌ ${r.status}`;
  console.log(`  ${m}: ${tag}${r.ok ? "" : " — " + r.error?.slice(0, 150)}`);
}
