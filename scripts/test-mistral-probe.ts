import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function getToken(): Promise<string> {
  const sa = JSON.parse(process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT!);
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const { createSign } = await import("crypto");
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${p}`);
  const sig = s.sign(sa.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${p}.${sig}`,
  });
  return ((await r.json()) as { access_token: string }).access_token;
}

const MODELS = [
  // Codestral
  "codestral-2501", "codestral-2501-maas", "codestral-2-maas",
  "codestral-2505", "codestral-2505-maas", "codestral@2501", "codestral-latest",
  // Mistral Large
  "mistral-large@2411", "mistral-large-2411", "mistral-large-2411-maas",
  "mistral-large@latest", "mistral-large-latest", "mistral-large",
  // Mistral Medium
  "mistral-medium@2505", "mistral-medium-2505", "mistral-medium-2505-maas",
  "mistral-medium@latest", "mistral-medium",
  // Mistral Small
  "mistral-small@2503", "mistral-small-2503", "mistral-small-2503-maas",
  "mistral-small@latest", "mistral-small",
  // Mistral Nemo
  "mistral-nemo@2407", "mistral-nemo-2407", "mistral-nemo",
  // Pixtral
  "pixtral-large@2411", "pixtral-large-2411", "pixtral-large",
  // Ministral
  "ministral-8b@2410", "ministral-8b",
  // Mixtral
  "mixtral-8x7b@latest", "mixtral-8x7b",
];

const REGIONS = ["us-central1", "us-east5", "europe-west1", "global"];

async function main() {
  const token = await getToken();
  const PROJECT = process.env.TWOBOT_VERTEX_AI_PROJECT!;
  console.log("Probing Mistral models on Vertex AI...");
  console.log("(skipping 404s)\n");

  for (const region of REGIONS) {
    console.log(`=== ${region} ===`);
    let anyFound = false;

    for (const model of MODELS) {
      const baseUrl =
        region === "global"
          ? `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global`
          : `https://${region}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${region}`;

      const rawUrl = `${baseUrl}/publishers/mistralai/models/${model}:rawPredict`;
      try {
        const resp = await fetch(rawUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.status === 404) continue;
        anyFound = true;
        const text = await resp.text();
        let detail = "";
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          if (resp.status === 200) {
            const choices = j.choices as Array<{ message?: { content?: string } }> | undefined;
            detail = "WORKS! -> " + (choices?.[0]?.message?.content || "").slice(0, 40);
          } else if (j.error) {
            detail = ((j.error as { message?: string }).message || "").slice(0, 100);
          } else {
            detail = text.slice(0, 80);
          }
        } catch {
          detail = text.slice(0, 60);
        }
        const icon = resp.status === 200 ? "✅" : resp.status === 429 ? "⚡429" : `❌${resp.status}`;
        console.log(`${icon.padEnd(6)} ${model.padEnd(35)} ${detail}`);
      } catch (err: unknown) {
        console.log(
          `💥     ${model.padEnd(35)} ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`,
        );
      }
    }
    if (!anyFound) console.log("  (all 404)");
    console.log();
  }

  // Also try OpenAI-compat endpoint
  console.log("=== OpenAI-compat endpoint ===");
  const oaiModels = [
    "codestral-2501-maas",
    "codestral-2-maas",
    "codestral-2505-maas",
    "mistral-large-2411-maas",
    "mistral-medium-2505-maas",
    "mistral-small-2503-maas",
  ];
  for (const region of ["us-central1", "global"]) {
    const baseUrl =
      region === "global"
        ? `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/endpoints/openapi/chat/completions`
        : `https://${region}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${region}/endpoints/openapi/chat/completions`;

    for (const model of oaiModels) {
      try {
        const resp = await fetch(baseUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `mistralai/${model}`,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const text = await resp.text();
        let detail = "";
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          if (resp.status === 200) {
            const choices = j.choices as Array<{ message?: { content?: string } }> | undefined;
            detail = "WORKS! -> " + (choices?.[0]?.message?.content || "").slice(0, 40);
          } else if (j.error) {
            detail = ((j.error as { message?: string }).message || "").slice(0, 100);
          } else {
            detail = text.slice(0, 80);
          }
        } catch {
          detail = text.slice(0, 60);
        }
        const icon = resp.status === 200 ? "✅" : resp.status === 429 ? "⚡429" : `❌${resp.status}`;
        console.log(`${icon.padEnd(6)} ${region} mistralai/${model.padEnd(28)} ${detail}`);
      } catch (err: unknown) {
        console.log(
          `💥     ${region} mistralai/${model.padEnd(28)} ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`,
        );
      }
    }
  }
}

main().catch(console.error);
