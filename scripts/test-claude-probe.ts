/**
 * Quick test to probe which Claude model IDs exist in Vertex AI
 */
import "dotenv/config";

// Inline minimal auth — same as the adapter
async function getToken(): Promise<string> {
  const sa = JSON.parse(process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT!);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

const PROJECT = process.env.TWOBOT_VERTEX_AI_PROJECT!;

const MODELS_TO_PROBE = [
  // Claude 4.x family
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-sonnet-4@20250514",
  "claude-opus-4@20250514",
  "claude-haiku-4@20250514",
  "claude-haiku-4-6",
  // Claude 4.5 family
  "claude-sonnet-4-5@20250514",
  "claude-haiku-4-5@20250514",
  "claude-opus-4-5@20250514",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
  // Claude 3.5 family
  "claude-3-5-sonnet-v2@20241022",
  "claude-3-5-haiku@20241022",
  "claude-3-5-sonnet@20240620",
  // Claude 3 family
  "claude-3-opus@20240229",
  "claude-3-sonnet@20240229",
  "claude-3-haiku@20240307",
];

// Also try us-east5 region (common for Claude on Vertex)
const REGIONS_TO_TRY = ["global", "us-east5", "us-central1", "europe-west1"];

async function main() {
  const token = await getToken();
  console.log("Probing Claude model IDs on Vertex AI rawPredict...\n");

  for (const region of REGIONS_TO_TRY) {
    console.log(`\n--- Region: ${region} ---`);
    for (const model of MODELS_TO_PROBE) {
      const baseUrl =
        region === "global"
          ? `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global`
          : `https://${region}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${region}`;
      const url = `${baseUrl}/publishers/anthropic/models/${model}:rawPredict`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            anthropic_version: "vertex-2023-10-16",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(15000),
        });

        const text = await resp.text();
        if (resp.status !== 404) {
          const firstLine = text.split("\n").find((l) => l.trim()) || "";
          const statusEmoji = resp.status === 200 ? "✅" : resp.status === 429 ? "⚡" : "❌";
          console.log(
            `${statusEmoji} ${String(resp.status).padEnd(4)} ${model.padEnd(40)} ${firstLine.slice(0, 80)}`,
          );
        }
      } catch (err: unknown) {
        console.log(`💥 ERR  ${model.padEnd(40)} ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

main().catch(console.error);
