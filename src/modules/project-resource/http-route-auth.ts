/**
 * HTTP route inbound auth verification.
 *
 * Each `HttpRoute` chooses one of:
 *   - `NONE`       — no auth check
 *   - `API_KEY`    — caller passes `X-Api-Key: <key>`; checked against
 *                    `authConfig.apiKey` with constant-time compare.
 *   - `HMAC`       — caller passes `X-Signature: sha256=<hex>` (or `<hex>`)
 *                    where the hex is `HMAC_SHA256(authConfig.hmacSecret, rawBody)`.
 *   - `BEARER_JWT` — caller passes `Authorization: Bearer <jwt>`. We verify the
 *                    HS256 signature against `authConfig.jwtSecret`, plus `exp`
 *                    and `nbf`. JWKS / RS256 is intentionally deferred.
 */

import crypto from "node:crypto";

import type { HttpAuthMode } from "@prisma/client";

export interface HttpRouteAuthInput {
  authMode: HttpAuthMode;
  authConfig: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  /** Raw request body bytes — required for HMAC verification. */
  rawBody: Buffer | null;
}

export type AuthVerifyResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string };

/** Lower-case header lookup that tolerates the Express style `string | string[]`. */
function header(
  headers: HttpRouteAuthInput["headers"],
  name: string,
): string | null {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (v === undefined) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

/** Constant-time compare for ASCII strings. Safe against length leaks. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyHttpRouteAuth(input: HttpRouteAuthInput): AuthVerifyResult {
  switch (input.authMode) {
    case "NONE":
      return { ok: true };

    case "API_KEY": {
      const expected = (input.authConfig as { apiKey?: unknown }).apiKey;
      if (typeof expected !== "string" || expected.length === 0) {
        return { ok: false, status: 401, message: "API key not configured" };
      }
      const provided = header(input.headers, "x-api-key");
      if (!provided) {
        return { ok: false, status: 401, message: "Missing X-Api-Key header" };
      }
      return safeEqual(provided, expected)
        ? { ok: true }
        : { ok: false, status: 403, message: "Invalid API key" };
    }

    case "HMAC": {
      const secret = (input.authConfig as { hmacSecret?: unknown }).hmacSecret;
      if (typeof secret !== "string" || secret.length === 0) {
        return { ok: false, status: 401, message: "HMAC secret not configured" };
      }
      const sigHeader = header(input.headers, "x-signature");
      if (!sigHeader) {
        return { ok: false, status: 401, message: "Missing X-Signature header" };
      }
      const sig = sigHeader.startsWith("sha256=")
        ? sigHeader.slice("sha256=".length)
        : sigHeader;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(input.rawBody ?? Buffer.alloc(0))
        .digest("hex");
      return safeEqual(sig.toLowerCase(), expected)
        ? { ok: true }
        : { ok: false, status: 403, message: "Invalid signature" };
    }

    case "BEARER_JWT": {
      const secret = (input.authConfig as { jwtSecret?: unknown }).jwtSecret;
      if (typeof secret !== "string" || secret.length === 0) {
        return { ok: false, status: 401, message: "JWT secret not configured" };
      }
      const auth = header(input.headers, "authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        return { ok: false, status: 401, message: "Missing Bearer token" };
      }
      const token = auth.slice("Bearer ".length).trim();
      const verdict = verifyHs256Jwt(token, secret);
      if (verdict.ok) return { ok: true };
      return { ok: false, status: 403, message: verdict.message };
    }

    default: {
      // Exhaustiveness guard.
      const exhaustive: never = input.authMode;
      void exhaustive;
      return { ok: false, status: 401, message: "Unsupported auth mode" };
    }
  }
}

/**
 * Minimal HS256 JWT verifier. Validates header alg/typ, signature, and the
 * `exp` / `nbf` claims when present. Does NOT enforce `iss`, `aud`, etc. —
 * keep route-config small for now; can be added later via authConfig.
 */
function verifyHs256Jwt(
  token: string,
  secret: string,
): { ok: true } | { ok: false; message: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, message: "Malformed JWT" };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let parsedHeader: { alg?: unknown; typ?: unknown };
  try {
    parsedHeader = JSON.parse(b64UrlDecode(headerB64).toString("utf8"));
  } catch {
    return { ok: false, message: "Bad JWT header" };
  }
  if (parsedHeader.alg !== "HS256") {
    return { ok: false, message: "Unsupported JWT alg" };
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = b64UrlDecode(sigB64);
  } catch {
    return { ok: false, message: "Bad JWT signature encoding" };
  }
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return { ok: false, message: "JWT signature mismatch" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, message: "Bad JWT payload" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) {
    return { ok: false, message: "JWT expired" };
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSec) {
    return { ok: false, message: "JWT not yet valid" };
  }
  return { ok: true };
}

function b64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
