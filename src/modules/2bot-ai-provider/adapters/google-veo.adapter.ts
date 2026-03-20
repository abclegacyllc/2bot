/**
 * Google Veo Video Generation Adapter
 *
 * For Veo 2.0, 3.0, 3.1 video generation via Vertex AI predictLongRunning endpoint.
 * These models are async — they return an operation ID that must be polled for completion.
 *
 * Endpoint: https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/publishers/google/models/{model}:predictLongRunning
 * Poll: GET https://{REGION}-aiplatform.googleapis.com/v1/{operationName}
 *
 * @module modules/2bot-ai-provider/adapters/google-veo.adapter
 */

import { logger } from "@/lib/logger";
import type { VideoGenerationRequest, VideoGenerationResponse } from "../types";
import { TwoBotAIError } from "../types";

// ===========================================
// Configuration
// ===========================================

const VERTEX_REGION = process.env.TWOBOT_VERTEX_AI_REGION || "us-central1";
const VERTEX_PROJECT = process.env.TWOBOT_VERTEX_AI_PROJECT;

const MAX_POLL_ATTEMPTS = 120; // 10 minutes max (5s intervals)
const POLL_INTERVAL_MS = 5_000;

// ===========================================
// Access Token (reuse from vertex-ai adapter via import)
// ===========================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const serviceAccountJson = process.env.TWOBOT_VERTEX_AI_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new TwoBotAIError(
      "TWOBOT_VERTEX_AI_SERVICE_ACCOUNT not configured",
      "PROVIDER_ERROR",
      500,
    );
  }

  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
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

  const tokenResponse = await fetch(
    sa.token_uri || "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!tokenResponse.ok) {
    throw new TwoBotAIError(
      "Failed to obtain Vertex AI access token for Veo",
      "PROVIDER_ERROR",
      500,
    );
  }

  const data = (await tokenResponse.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

// ===========================================
// Aspect Ratio Mapping
// ===========================================

function mapAspectRatio(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "16:9":
    case "9:16":
    case "1:1":
      return aspectRatio;
    default:
      return "16:9"; // Default for video
  }
}

// ===========================================
// Video Generation
// ===========================================

export async function veoVideoGeneration(
  request: VideoGenerationRequest,
): Promise<VideoGenerationResponse> {
  const log = logger.child({ adapter: "google-veo", model: request.model });

  if (!VERTEX_PROJECT) {
    throw new TwoBotAIError(
      "TWOBOT_VERTEX_AI_PROJECT not configured",
      "PROVIDER_ERROR",
      500,
    );
  }

  const token = await getAccessToken();
  const model = request.model || "veo-3.0-generate-001";

  const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_REGION}/publishers/google/models/${model}:predictLongRunning`;

  log.info({ model, durationSeconds: request.durationSeconds }, "Starting Veo video generation");

  // Submit the long-running prediction
  const submitResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: 1,
        durationSeconds: request.durationSeconds || 4,
        aspectRatio: mapAspectRatio(request.aspectRatio),
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!submitResponse.ok) {
    const errText = await submitResponse.text().catch(() => "Unknown error");
    throw new TwoBotAIError(
      `Veo video generation submit failed: ${submitResponse.status}`,
      "PROVIDER_ERROR",
      submitResponse.status,
      { detail: errText },
    );
  }

  const operation = (await submitResponse.json()) as {
    name: string;
    done?: boolean;
    response?: {
      predictions: Array<{
        bytesBase64Encoded: string;
        mimeType: string;
      }>;
    };
    error?: { code: number; message: string };
  };

  log.info({ operationName: operation.name }, "Veo operation submitted");

  // If already done (unlikely for video), return immediately
  if (operation.done && operation.response) {
    return buildVideoResponse(operation.response, model, request);
  }
  if (operation.done && operation.error) {
    throw new TwoBotAIError(
      `Veo error: ${operation.error.message}`,
      "PROVIDER_ERROR",
      operation.error.code || 500,
    );
  }

  // Poll for completion using fetchPredictOperation (POST method)
  // Vertex AI publisher model LROs require this endpoint, not GET on the operation resource
  const modelPath = `projects/${VERTEX_PROJECT}/locations/${VERTEX_REGION}/publishers/google/models/${model}`;
  const pollUrl = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/${modelPath}:fetchPredictOperation`;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const freshToken = await getAccessToken();
    const pollResponse = await fetch(pollUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operationName: operation.name }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!pollResponse.ok) {
      log.warn(
        { attempt, status: pollResponse.status },
        "Veo poll request failed",
      );
      continue;
    }

    const pollResult = (await pollResponse.json()) as typeof operation;

    if (pollResult.done) {
      if (pollResult.error) {
        throw new TwoBotAIError(
          `Veo error: ${pollResult.error.message}`,
          "PROVIDER_ERROR",
          pollResult.error.code || 500,
        );
      }
      if (pollResult.response) {
        log.info(
          { model, attempts: attempt + 1 },
          "Veo video generation completed",
        );
        return buildVideoResponse(pollResult.response, model, request);
      }
    }
  }

  throw new TwoBotAIError(
    "Veo video generation timed out after polling",
    "TIMEOUT",
    408,
  );
}

function buildVideoResponse(
  response: {
    predictions: Array<{ bytesBase64Encoded: string; mimeType: string }>;
  },
  model: string,
  request: VideoGenerationRequest,
): VideoGenerationResponse {
  const prediction = response.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new TwoBotAIError(
      "Veo returned no video data",
      "PROVIDER_ERROR",
      500,
    );
  }

  return {
    id: `veo-${Date.now()}`,
    model,
    videoUrl: `data:${prediction.mimeType || "video/mp4"};base64,${prediction.bytesBase64Encoded}`,
    mimeType: prediction.mimeType || "video/mp4",
    durationSeconds: request.durationSeconds || 4,
    creditsUsed: 0,
    newBalance: 0,
  };
}
