/**
 * cursor-fetch.ts
 *
 * Safe URL fetching helper for the Cursor agent's `fetch_url` tool.
 * All requests are routed through the Squid proxy (HTTP_PROXY env var).
 * Contains SSRF protection to block requests to internal/private network ranges.
 */

import { logger } from "@/lib/logger";

const fetchLog = logger.child({ module: "cursor", capability: "fetch-url" });

// ---------------------------------------------------------------------------
// SSRF Protection
// ---------------------------------------------------------------------------

/**
 * Private/link-local IP ranges that must never be fetched.
 * Blocks requests to the internal Docker network, loopback, metadata services, etc.
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS/GCP metadata endpoint
  "metadata.google.internal",
  "169.254.170.2",   // ECS task metadata
]);

/** Match private IPv4 ranges: 10.x, 172.16–31.x, 192.168.x, 127.x */
const PRIVATE_IPV4_RE =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

/**
 * Validates the hostname/IP of a parsed URL.
 * Returns an error string if the URL should be blocked, null if safe.
 */
export function checkSSRF(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return "Invalid URL — must be an absolute URL (https://... or http://...)";
  }

  // Only allow http and https
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `Unsupported protocol "${parsed.protocol}". Only https:// and http:// are allowed.`;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return `Blocked: "${hostname}" is a loopback or metadata address.`;
  }

  if (PRIVATE_IPV4_RE.test(hostname)) {
    return `Blocked: "${hostname}" is in a private IP range.`;
  }

  // Block raw IPv6 loopback
  if (hostname === "[::1]" || hostname === "::1") {
    return `Blocked: IPv6 loopback is not allowed.`;
  }

  return null; // Safe
}

// ---------------------------------------------------------------------------
// HTML → Plain Text Stripping
// ---------------------------------------------------------------------------

/** Remove HTML tags and decode common entities to yield readable plain text. */
function htmlToText(html: string): string {
  return html
    // Remove <script> and <style> blocks entirely (including their content)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Replace common block elements with newlines for readability
    .replace(/<\/?(p|div|h[1-6]|li|br|tr|blockquote|pre)[^>]*>/gi, "\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // Collapse excessive whitespace / blank lines
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Main fetch helper
// ---------------------------------------------------------------------------

const MAX_RESPONSE_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 15_000;
/** Maximum raw response size to read before processing (prevents memory issues with huge pages) */
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB

export interface FetchUrlResult {
  content: string;
  mimeType: string;
  truncated: boolean;
  statusCode: number;
}

/**
 * Fetch a URL and return its text content, suitable for injecting into an LLM message.
 *
 * - Validates against SSRF attacks before making any request.
 * - Routes through HTTP_PROXY env var (Squid) when set.
 * - Returns stripped plain text for HTML pages; raw text for JSON/plain.
 * - Truncates to MAX_RESPONSE_CHARS characters.
 *
 * Throws on network failure or SSRF violation.
 */
export async function fetchUrl(urlString: string): Promise<FetchUrlResult> {
  // SSRF guard — must run before any network I/O
  const ssrfError = checkSSRF(urlString);
  if (ssrfError) {
    throw new Error(ssrfError);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        // Identify ourselves politely; some CDNs block headless bots
        "User-Agent": "2Bot-Cursor-Agent/1.0 (documentation fetch)",
        "Accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // Node's fetch picks up HTTP_PROXY / HTTPS_PROXY env vars automatically
      // when undici is configured (Next.js 13+ / Node 18+).
      // No explicit proxy configuration needed here.
      redirect: "follow",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fetchLog.warn({ url: urlString, err: message }, "fetch_url network error");
    throw new Error(`Network error fetching URL: ${message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0]?.trim() ?? "text/plain";

  // Read up to MAX_RESPONSE_BYTES to avoid buffering huge pages
  const reader = response.body?.getReader();
  let rawBytes = 0;
  const chunks: string[] = [];

  if (reader) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    while (true) {
      const { done, value } = await reader.read();
      if (done || value === undefined) break;
      rawBytes += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
      if (rawBytes >= MAX_RESPONSE_BYTES) {
        // Stop reading — we have enough
        reader.cancel().catch(() => undefined);
        break;
      }
    }
  } else {
    // Fallback for runtimes where body is not a ReadableStream
    const text = await response.text();
    chunks.push(text.slice(0, MAX_RESPONSE_BYTES));
  }

  const rawText = chunks.join("");

  // Strip HTML for HTML content types
  const isHtml = mimeType.includes("html");
  const processedText = isHtml ? htmlToText(rawText) : rawText;

  const truncated = processedText.length > MAX_RESPONSE_CHARS;
  const content = truncated
    ? processedText.slice(0, MAX_RESPONSE_CHARS) + `\n\n... [truncated — ${processedText.length - MAX_RESPONSE_CHARS} more characters]`
    : processedText;

  return {
    content,
    mimeType,
    truncated,
    statusCode: response.status,
  };
}
