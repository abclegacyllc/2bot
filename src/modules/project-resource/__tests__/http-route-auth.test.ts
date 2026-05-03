import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyHttpRouteAuth } from "../http-route-auth";

describe("verifyHttpRouteAuth", () => {
  describe("NONE", () => {
    it("always allows", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "NONE",
          authConfig: {},
          headers: {},
          rawBody: null,
        }),
      ).toEqual({ ok: true });
    });
  });

  describe("API_KEY", () => {
    it("accepts matching X-Api-Key", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "API_KEY",
          authConfig: { apiKey: "supersecret" },
          headers: { "x-api-key": "supersecret" },
          rawBody: null,
        }),
      ).toEqual({ ok: true });
    });

    it("rejects mismatched key with 403", () => {
      const r = verifyHttpRouteAuth({
        authMode: "API_KEY",
        authConfig: { apiKey: "supersecret" },
        headers: { "x-api-key": "wrong" },
        rawBody: null,
      });
      expect(r).toEqual({ ok: false, status: 403, message: expect.any(String) });
    });

    it("rejects missing header with 401", () => {
      const r = verifyHttpRouteAuth({
        authMode: "API_KEY",
        authConfig: { apiKey: "supersecret" },
        headers: {},
        rawBody: null,
      });
      expect(r).toEqual({ ok: false, status: 401, message: expect.any(String) });
    });

    it("rejects when key not configured", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "API_KEY",
          authConfig: {},
          headers: { "x-api-key": "x" },
          rawBody: null,
        }),
      ).toMatchObject({ ok: false, status: 401 });
    });

    it("rejects keys of different length without leaking timing", () => {
      const r = verifyHttpRouteAuth({
        authMode: "API_KEY",
        authConfig: { apiKey: "abcdef" },
        headers: { "x-api-key": "abc" },
        rawBody: null,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("HMAC", () => {
    const secret = "shh";
    const body = Buffer.from('{"hello":"world"}');
    const validHex = crypto.createHmac("sha256", secret).update(body).digest("hex");

    it("accepts a valid hex signature", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "HMAC",
          authConfig: { hmacSecret: secret },
          headers: { "x-signature": validHex },
          rawBody: body,
        }),
      ).toEqual({ ok: true });
    });

    it("accepts a valid sha256= prefixed signature", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "HMAC",
          authConfig: { hmacSecret: secret },
          headers: { "x-signature": `sha256=${validHex}` },
          rawBody: body,
        }),
      ).toEqual({ ok: true });
    });

    it("rejects an invalid signature with 403", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "HMAC",
          authConfig: { hmacSecret: secret },
          headers: { "x-signature": "deadbeef" },
          rawBody: body,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects when X-Signature is missing", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "HMAC",
          authConfig: { hmacSecret: secret },
          headers: {},
          rawBody: body,
        }),
      ).toMatchObject({ ok: false, status: 401 });
    });
  });

  describe("BEARER_JWT", () => {
    const secret = "jwt-secret";

    function makeJwt(
      payload: Record<string, unknown>,
      sec: string = secret,
      header: Record<string, unknown> = { alg: "HS256", typ: "JWT" },
    ): string {
      const b64 = (b: Buffer) =>
        b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      const h = b64(Buffer.from(JSON.stringify(header)));
      const p = b64(Buffer.from(JSON.stringify(payload)));
      const sig = b64(crypto.createHmac("sha256", sec).update(`${h}.${p}`).digest());
      return `${h}.${p}.${sig}`;
    }

    it("accepts a valid HS256 token", () => {
      const tok = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 60 });
      expect(
        verifyHttpRouteAuth({
          authMode: "BEARER_JWT",
          authConfig: { jwtSecret: secret },
          headers: { authorization: `Bearer ${tok}` },
          rawBody: null,
        }),
      ).toEqual({ ok: true });
    });

    it("rejects an expired token", () => {
      const tok = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 60 });
      expect(
        verifyHttpRouteAuth({
          authMode: "BEARER_JWT",
          authConfig: { jwtSecret: secret },
          headers: { authorization: `Bearer ${tok}` },
          rawBody: null,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects when signed with a different secret", () => {
      const tok = makeJwt({ sub: "u1" }, "other-secret");
      expect(
        verifyHttpRouteAuth({
          authMode: "BEARER_JWT",
          authConfig: { jwtSecret: secret },
          headers: { authorization: `Bearer ${tok}` },
          rawBody: null,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects non-HS256 algs", () => {
      const tok = makeJwt({ sub: "u1" }, secret, { alg: "none", typ: "JWT" });
      expect(
        verifyHttpRouteAuth({
          authMode: "BEARER_JWT",
          authConfig: { jwtSecret: secret },
          headers: { authorization: `Bearer ${tok}` },
          rawBody: null,
        }),
      ).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects missing Bearer header", () => {
      expect(
        verifyHttpRouteAuth({
          authMode: "BEARER_JWT",
          authConfig: { jwtSecret: secret },
          headers: {},
          rawBody: null,
        }),
      ).toMatchObject({ ok: false, status: 401 });
    });
  });
});
