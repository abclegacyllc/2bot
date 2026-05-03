/**
 * Phase 7.1 — chat-first end-to-end smoke test
 *
 * Drives the full BuildSpec lifecycle against a running API:
 *
 *   1. POST /ai-builder/validate    — accept a minimal valid spec
 *   2. POST /ai-builder/validate    — reject an obviously broken spec
 *   3. POST /ai-builder/apply       — apply the valid spec, returns version
 *   4. GET  /projects/:id/versions  — list versions (envelope shape)
 *   5. POST /:versionId/activate    — promote STAGING → ACTIVE (idempotent on already-ACTIVE)
 *   6. POST /:versionId/rollback    — flip back to a prior version
 *
 * NOTE: This script does NOT exercise the chat → buildspec extraction path
 * (that requires a live LLM and bridge container). The builder agent and
 * `extractBuildSpec` are covered by unit tests in
 * `src/modules/cursor/__tests__/buildspec-extract.test.ts`.
 *
 * Usage:
 *   FEATURE_AI_BUILDER=enabled FEATURE_PROJECT_VERSIONS=enabled \
 *     npx tsx scripts/smoke-test-chat-first.ts
 */

import jwt from "jsonwebtoken";

const API = process.env.SMOKE_API ?? "http://localhost:3002";
const JWT_SECRET = process.env.JWT_SECRET ?? "2bot-super-secret-key-for-jwt-tokens-min-32-chars";
const USER_ID = process.env.SMOKE_USER_ID ?? "cmlgj11hd0001jlky7n1rx2ci"; // admin@2bot.org
const SESSION_ID = process.env.SMOKE_SESSION_ID ?? "cmmlrn8nb00005kkyavqmd7br";

let passCount = 0;
let failCount = 0;

function pass(msg: string) {
  passCount++;
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg: string, detail?: unknown) {
  failCount++;
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  if (detail !== undefined) console.log(`    →`, detail);
}
function assert(cond: boolean, msg: string, detail?: unknown) {
  if (cond) pass(msg);
  else fail(msg, detail);
}

function token(): string {
  return jwt.sign(
    { userId: USER_ID, sessionId: SESSION_ID, type: "access" },
    JWT_SECRET,
    { expiresIn: "10m" },
  );
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message: string };
  meta?: Record<string, unknown>;
}

async function api<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------------------

const SLUG = `smoke-chat-${Date.now().toString(36)}`;

const VALID_SPEC = {
  version: 1 as const,
  project: {
    name: `Smoke chat-first ${SLUG}`,
    slug: SLUG,
    kind: "AUTOMATION" as const,
    description: "Phase 7.1 smoke project — safe to delete.",
  },
  gateways: [],
  plugins: [],
  workflows: [],
  smokeTests: [],
};

const BROKEN_SPEC = { version: 1, project: { name: "" } };

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\x1b[1;36mChat-first BuildSpec smoke test\x1b[0m`);
  console.log(`  API: ${API}`);
  console.log(`  Slug: ${SLUG}\n`);

  // 0) Server up?
  try {
    const h = await fetch(`${API}/health`);
    assert(h.ok, "API is reachable");
  } catch (err) {
    fail("API unreachable", err);
    process.exit(1);
  }

  // 1) Validate (happy path)
  const v1 = await api<{ ok: boolean; errors?: unknown[] }>(
    "POST",
    "/ai-builder/validate",
    { spec: VALID_SPEC },
  );
  assert(v1.status === 200 && v1.body.success === true, "validate accepts a valid spec");
  assert(v1.body.data?.ok === true, "validate response carries data.ok=true");

  // 2) Validate (broken)
  const v2 = await api<{ ok: boolean; errors?: unknown[] }>(
    "POST",
    "/ai-builder/validate",
    { spec: BROKEN_SPEC },
  );
  assert(v2.body.success === false, "validate rejects a broken spec");
  assert(
    Array.isArray(v2.body.data?.errors) && (v2.body.data?.errors?.length ?? 0) > 0,
    "validate returns at least one error",
  );

  // 3) Apply
  const apply = await api<{
    projectId: string;
    versionId: string;
    status: string;
    smoke?: unknown;
  }>("POST", "/ai-builder/apply", { spec: VALID_SPEC });
  if (apply.status !== 200 || !apply.body.success) {
    fail("apply returned non-success", apply);
    process.exit(1);
  }
  pass("apply returned success envelope");

  const projectId = apply.body.data?.projectId;
  const stagingVersionId = apply.body.data?.versionId;
  assert(typeof projectId === "string" && projectId.length > 0, "apply.data.projectId set");
  assert(
    typeof stagingVersionId === "string" && stagingVersionId.length > 0,
    "apply.data.versionId set",
  );
  if (!projectId || !stagingVersionId) {
    process.exit(1);
  }

  // 4) List versions
  const list = await api<Array<{ id: string; status: string; versionNumber: number }>>(
    "GET",
    `/projects/${projectId}/versions`,
  );
  assert(list.status === 200 && list.body.success === true, "list versions returns success");
  assert(
    Array.isArray(list.body.data) && (list.body.data?.length ?? 0) >= 1,
    "list versions has ≥1 row",
  );

  const initialActive = list.body.data?.find((v) => v.status === "ACTIVE");

  // 5) Activate (no-op if apply auto-activated; otherwise STAGING → ACTIVE).
  if (initialActive?.id !== stagingVersionId) {
    const act = await api<{ status: string }>(
      "POST",
      `/projects/${projectId}/versions/${stagingVersionId}/activate`,
    );
    assert(
      act.status === 200 && act.body.success === true,
      "activate returns success",
    );
    assert(act.body.data?.status === "ACTIVE", "activated version is ACTIVE");
  } else {
    pass("apply path auto-activated (no separate activate call needed)");
  }

  // 6) Rollback — only meaningful if there is a prior ACTIVE to roll back to.
  if (initialActive && initialActive.id !== stagingVersionId) {
    const rb = await api<{ status: string }>(
      "POST",
      `/projects/${projectId}/versions/${initialActive.id}/rollback`,
      { reason: "smoke test rollback" },
    );
    assert(
      rb.status === 200 && rb.body.success === true,
      "rollback returns success",
    );
    assert(
      rb.body.data?.status === "ACTIVE",
      "rolled-back version becomes ACTIVE",
    );
  } else {
    pass("rollback skipped (no prior ACTIVE — first apply for this project)");
  }

  // ---------------------------------------------------------------------------
  console.log(`\n\x1b[1m──────────────────────────────────────────────\x1b[0m`);
  console.log(
    `  \x1b[32mPassed: ${passCount}\x1b[0m  |  \x1b[31mFailed: ${failCount}\x1b[0m`,
  );
  console.log(`\x1b[1m──────────────────────────────────────────────\x1b[0m\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
