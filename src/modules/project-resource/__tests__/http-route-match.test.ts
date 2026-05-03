import { describe, expect, it } from "vitest";

import {
  compileHttpRoute,
  matchCompiledRoute,
  pickBestMatch,
} from "../http-route-match";

describe("http-route-match", () => {
  describe("compileHttpRoute + matchCompiledRoute", () => {
    it("matches a literal path", () => {
      const c = compileHttpRoute("/hello");
      expect(matchCompiledRoute(c, "/hello")).toEqual({});
      expect(matchCompiledRoute(c, "/hello/")).toBeNull();
      expect(matchCompiledRoute(c, "/hellox")).toBeNull();
    });

    it("captures :params", () => {
      const c = compileHttpRoute("/users/:id");
      expect(matchCompiledRoute(c, "/users/42")).toEqual({ id: "42" });
      expect(matchCompiledRoute(c, "/users/42/edit")).toBeNull();
    });

    it("captures multiple :params and decodes URI components", () => {
      const c = compileHttpRoute("/orgs/:org/repos/:repo");
      expect(matchCompiledRoute(c, "/orgs/acme/repos/2bot")).toEqual({
        org: "acme",
        repo: "2bot",
      });
      expect(matchCompiledRoute(c, "/orgs/acme%20inc/repos/2bot")).toEqual({
        org: "acme inc",
        repo: "2bot",
      });
    });

    it("captures wildcard tail", () => {
      const c = compileHttpRoute("/files/*");
      expect(matchCompiledRoute(c, "/files/a/b/c.txt")).toEqual({
        "*": "a/b/c.txt",
      });
    });

    it("rejects non-anchored / partial matches", () => {
      const c = compileHttpRoute("/users/:id");
      expect(matchCompiledRoute(c, "/v1/users/42")).toBeNull();
    });

    it("escapes regex metachars in literal segments", () => {
      const c = compileHttpRoute("/a.b+c");
      expect(matchCompiledRoute(c, "/a.b+c")).toEqual({});
      expect(matchCompiledRoute(c, "/aXb+c")).toBeNull();
    });

    it("throws when pattern has duplicate :params", () => {
      expect(() => compileHttpRoute("/u/:id/v/:id")).toThrow();
    });

    it("requires leading slash", () => {
      expect(() => compileHttpRoute("hello")).toThrow();
    });
  });

  describe("pickBestMatch", () => {
    it("prefers more-specific patterns", () => {
      const routes = [
        { path: "/users/:id" },
        { path: "/users/me" },
      ];
      const m = pickBestMatch(routes, "/users/me");
      expect(m?.route.path).toBe("/users/me");
    });

    it("prefers non-wildcard over wildcard", () => {
      const routes = [{ path: "/files/*" }, { path: "/files/:name" }];
      const m = pickBestMatch(routes, "/files/readme.md");
      expect(m?.route.path).toBe("/files/:name");
      expect(m?.pathParams).toEqual({ name: "readme.md" });
    });

    it("returns null when nothing matches", () => {
      const routes = [{ path: "/a" }, { path: "/b/:id" }];
      expect(pickBestMatch(routes, "/c")).toBeNull();
    });
  });
});
