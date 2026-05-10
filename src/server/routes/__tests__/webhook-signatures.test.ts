/**
 * Webhook Signature Verification Tests
 *
 * Tests the three signature verifiers used by inbound gateway
 * webhooks: Slack (HMAC-SHA256), Discord (Ed25519), WhatsApp
 * (HMAC-SHA256). These run against real cryptographic primitives —
 * no mocks — because correctness here is what stops impersonation
 * attacks. A "passing" test that took shortcuts on crypto is worse
 * than no test.
 *
 * Each suite:
 *   1. Generates a real key (or seeds a known secret)
 *   2. Signs a fixture payload using the same algorithm the source
 *      provider uses
 *   3. Hands the signature to our verifier
 *   4. Tampers with each input and asserts the verifier fails closed
 */

import { describe, expect, it } from "vitest";
import {
  createHmac,
  webcrypto,
} from "node:crypto";

import {
  verifyDiscordSignature,
  verifySlackSignature,
  verifyWhatsAppSignature,
} from "../webhook";

// ---------------------------------------------------------------------------
// Slack — HMAC-SHA256 with a 5-minute replay window
// ---------------------------------------------------------------------------

describe("verifySlackSignature", () => {
  const SECRET = "8f742231b10e8888abcd99cdcdf2a9ee";

  function sign(timestamp: string, body: string): string {
    const base = `v0:${timestamp}:${body}`;
    return `v0=${createHmac("sha256", SECRET).update(base).digest("hex")}`;
  }

  it("accepts a valid signature on a fresh timestamp", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"event_callback","event":{"text":"hi"}}';
    const sig = sign(ts, body);
    expect(await verifySlackSignature(SECRET, sig, ts, body)).toBe(true);
  });

  it("rejects a request older than 5 minutes (replay protection)", async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 6 * 60); // 6 min ago
    const body = '{"type":"event_callback"}';
    const sig = sign(ts, body);
    expect(await verifySlackSignature(SECRET, sig, ts, body)).toBe(false);
  });

  it("rejects a request from 6 minutes in the future (clock skew bound)", async () => {
    const ts = String(Math.floor(Date.now() / 1000) + 6 * 60);
    const body = '{"type":"event_callback"}';
    const sig = sign(ts, body);
    expect(await verifySlackSignature(SECRET, sig, ts, body)).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"event_callback","event":{"text":"hi"}}';
    const sig = sign(ts, body);
    const evilBody = body.replace("hi", "haxx");
    expect(await verifySlackSignature(SECRET, sig, ts, evilBody)).toBe(false);
  });

  it("rejects a swapped timestamp (signature regenerated for a different ts)", async () => {
    const ts1 = String(Math.floor(Date.now() / 1000));
    const ts2 = String(Math.floor(Date.now() / 1000) - 30);
    const body = '{"type":"event_callback"}';
    const sig = sign(ts1, body);
    // valid signature for ts1, but verifier is told it's ts2
    expect(await verifySlackSignature(SECRET, sig, ts2, body)).toBe(false);
  });

  it("rejects a signature signed with the wrong secret", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const wrongSig = `v0=${createHmac("sha256", "wrong-secret").update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(await verifySlackSignature(SECRET, wrongSig, ts, body)).toBe(false);
  });

  it("rejects a malformed signature header", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(await verifySlackSignature(SECRET, "garbage", ts, "{}")).toBe(false);
    expect(await verifySlackSignature(SECRET, "", ts, "{}")).toBe(false);
  });

  it("rejects a non-numeric timestamp without throwing", async () => {
    expect(await verifySlackSignature(SECRET, "v0=abc", "not-a-number", "{}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Discord — Ed25519
// ---------------------------------------------------------------------------

describe("verifyDiscordSignature", () => {
  /**
   * Generate a fresh Ed25519 keypair using the same WebCrypto API the
   * verifier uses. Returns the public key as hex (which is how Discord
   * expects it to be configured) and a sign() helper.
   */
  async function makeKeypair() {
    const kp = (await webcrypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    )) as { privateKey: CryptoKey; publicKey: CryptoKey };

    const rawPub = new Uint8Array(await webcrypto.subtle.exportKey("raw", kp.publicKey));
    const publicKeyHex = Array.from(rawPub)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    async function sign(message: string): Promise<string> {
      const sigBytes = new Uint8Array(
        await webcrypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(message)),
      );
      return Array.from(sigBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    return { publicKeyHex, sign };
  }

  it("accepts a valid Ed25519 signature for the canonical (timestamp + body)", async () => {
    const { publicKeyHex, sign } = await makeKeypair();
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":1}'; // PING
    const sig = await sign(ts + body);
    expect(await verifyDiscordSignature(publicKeyHex, sig, ts, body)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const { publicKeyHex, sign } = await makeKeypair();
    const ts = "1700000000";
    const body = '{"type":2,"data":{"name":"hello"}}';
    const sig = await sign(ts + body);
    expect(
      await verifyDiscordSignature(publicKeyHex, sig, ts, '{"type":2,"data":{"name":"haxx"}}'),
    ).toBe(false);
  });

  it("rejects a tampered timestamp", async () => {
    const { publicKeyHex, sign } = await makeKeypair();
    const ts = "1700000000";
    const body = '{"type":1}';
    const sig = await sign(ts + body);
    expect(await verifyDiscordSignature(publicKeyHex, sig, "1700000001", body)).toBe(false);
  });

  it("rejects a signature from a different keypair", async () => {
    const a = await makeKeypair();
    const b = await makeKeypair();
    const ts = "1700000000";
    const body = '{"type":1}';
    const sigB = await b.sign(ts + body);
    expect(await verifyDiscordSignature(a.publicKeyHex, sigB, ts, body)).toBe(false);
  });

  it("rejects a malformed public key without throwing", async () => {
    expect(
      await verifyDiscordSignature("not-hex", "00".repeat(64), "1700000000", "{}"),
    ).toBe(false);
  });

  it("rejects a malformed signature without throwing", async () => {
    const { publicKeyHex } = await makeKeypair();
    expect(await verifyDiscordSignature(publicKeyHex, "garbage", "1700000000", "{}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp / Meta — HMAC-SHA256 with `sha256=` prefix
// ---------------------------------------------------------------------------

describe("verifyWhatsAppSignature", () => {
  const SECRET = "meta-app-secret-very-long-string-1234";

  function sign(body: string): string {
    return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  }

  it("accepts a valid signature", async () => {
    const body = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}';
    expect(await verifyWhatsAppSignature(SECRET, sign(body), body)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const body = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}';
    const sig = sign(body);
    expect(
      await verifyWhatsAppSignature(SECRET, sig, body.replace('"1"', '"hijacked"')),
    ).toBe(false);
  });

  it("rejects a signature signed with the wrong secret", async () => {
    const body = "{}";
    const wrongSig = `sha256=${createHmac("sha256", "different").update(body).digest("hex")}`;
    expect(await verifyWhatsAppSignature(SECRET, wrongSig, body)).toBe(false);
  });

  it("rejects a signature missing the sha256= prefix", async () => {
    const body = "{}";
    const hex = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(await verifyWhatsAppSignature(SECRET, hex, body)).toBe(false);
  });

  it("rejects an empty signature without throwing", async () => {
    expect(await verifyWhatsAppSignature(SECRET, "", "{}")).toBe(false);
  });
});
