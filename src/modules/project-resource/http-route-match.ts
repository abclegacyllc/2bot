/**
 * HTTP route path-pattern matching.
 *
 * Patterns may contain:
 *   - literal path segments (e.g. `/users`)
 *   - named params: `:name` — matches a single non-empty path segment
 *   - wildcard: `*` — matches the rest of the path (greedy, may include `/`)
 *
 * Examples:
 *   `/hello`           matches `/hello` only
 *   `/users/:id`       matches `/users/42`, capturing `{ id: "42" }`
 *   `/files/*`         matches `/files/a/b/c.txt`, capturing `{ "*": "a/b/c.txt" }`
 *   `/orgs/:org/repos/:repo` captures both
 *
 * Matching is exact (anchored). Trailing slashes are significant.
 */

const PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

export interface CompiledRoute {
  /** Source pattern (kept for diagnostics) */
  pattern: string;
  regex: RegExp;
  paramNames: string[];
}

/**
 * Compile a route pattern into a matcher.
 *
 * Throws on duplicate :param names — these should be rejected at create-time
 * by `validateHttpRouteSpec`, but we re-check defensively.
 */
export function compileHttpRoute(pattern: string): CompiledRoute {
  if (!pattern.startsWith("/")) {
    throw new Error(`HTTP route pattern must start with '/': ${pattern}`);
  }

  const paramNames: string[] = [];
  let regexBody = "";
  let cursor = 0;

  // Walk the pattern, replacing :params and * with regex equivalents while
  // escaping every other character.
  while (cursor < pattern.length) {
    const ch = pattern[cursor];
    if (ch === undefined) break;

    if (ch === "*") {
      paramNames.push("*");
      regexBody += "(.*)";
      cursor += 1;
      continue;
    }

    if (ch === ":") {
      // Match the param name.
      PARAM_RE.lastIndex = cursor;
      const m = PARAM_RE.exec(pattern);
      if (!m || m.index !== cursor || m[1] === undefined) {
        regexBody += escapeRegex(ch);
        cursor += 1;
        continue;
      }
      const name = m[1];
      if (paramNames.includes(name)) {
        throw new Error(`HTTP route has duplicate :${name} param`);
      }
      paramNames.push(name);
      regexBody += "([^/]+)";
      cursor = m.index + m[0].length;
      continue;
    }

    regexBody += escapeRegex(ch);
    cursor += 1;
  }

  return {
    pattern,
    regex: new RegExp("^" + regexBody + "$"),
    paramNames,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match an incoming request path against a compiled route. Returns the
 * extracted path-param map, or `null` when the route doesn't match.
 *
 * The wildcard `*` is exposed under the `"*"` key.
 */
export function matchCompiledRoute(
  compiled: CompiledRoute,
  incomingPath: string,
): Record<string, string> | null {
  const m = compiled.regex.exec(incomingPath);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < compiled.paramNames.length; i++) {
    const name = compiled.paramNames[i];
    if (name === undefined) continue;
    out[name] = decodeURIComponentSafe(m[i + 1] ?? "");
  }
  return out;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Find the best-matching route from a candidate list.
 *
 * Ranking (to keep behavior predictable when several patterns match):
 *   1. Patterns with fewer params/wildcards win (more specific first).
 *   2. Patterns without `*` beat patterns with `*`.
 *   3. Otherwise, first-listed wins.
 */
export function pickBestMatch<T extends { path: string }>(
  routes: T[],
  incomingPath: string,
): { route: T; pathParams: Record<string, string> } | null {
  let best: { route: T; pathParams: Record<string, string>; specificity: number } | null = null;

  for (const r of routes) {
    let compiled: CompiledRoute;
    try {
      compiled = compileHttpRoute(r.path);
    } catch {
      continue;
    }
    const params = matchCompiledRoute(compiled, incomingPath);
    if (!params) continue;
    const hasWildcard = compiled.paramNames.includes("*");
    // Lower number = more specific.
    const specificity = compiled.paramNames.length + (hasWildcard ? 100 : 0);
    if (!best || specificity < best.specificity) {
      best = { route: r, pathParams: params, specificity };
    }
  }

  if (!best) return null;
  return { route: best.route, pathParams: best.pathParams };
}
