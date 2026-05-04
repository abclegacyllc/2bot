/**
 * BuildSpec Schema (AI BuildSpec Orchestrator)
 *
 * A BuildSpec is the declarative description an AI agent emits when a user
 * says "build me a Telegram bot that translates messages". The orchestrator
 * applies a BuildSpec atomically: Project → Gateways → UserPlugins → Workflows
 * → WorkflowGateway links → smoke tests → activate-or-rollback.
 *
 * Design rules:
 *   • All cross-references are by *spec-local id* (a string the spec author
 *     picks, e.g. "tg-main", "translate-step"), NOT by DB id. The orchestrator
 *     resolves spec-local ids to real DB ids during apply.
 *   • Existing resources can be referenced via { ref: "existing", id: "<dbId>" }.
 *   • All resources are scoped to the spec's owner (userId, organizationId).
 *
 * @module modules/ai-builder/buildspec.schema
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────

const SpecLocalId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-_]*$/i,
  "spec-local id must be alphanumeric with - or _ separators");

const Slug = z.string().min(1).max(64).regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
  "slug must be lowercase, dashed, 1-64 chars");

// ─────────────────────────────────────────────────────────────────────
// Project
// ─────────────────────────────────────────────────────────────────────

export const ProjectKindEnum = z.enum(["BOT", "WEB_APP", "AUTOMATION", "HYBRID"]);

export const ProjectSpec = z.object({
  // Spec-local id; other parts of the spec reference this project by `ref`.
  ref: SpecLocalId.default("project"),
  // If provided, orchestrator updates the existing project. If absent, creates.
  existingId: z.string().optional(),
  name: z.string().min(1).max(120),
  slug: Slug.optional(),
  description: z.string().max(2000).nullable().optional(),
  kind: ProjectKindEnum.default("HYBRID"),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────
// Gateway
// ─────────────────────────────────────────────────────────────────────

export const GatewayTypeEnum = z.enum([
  "TELEGRAM_BOT",
  "DISCORD_BOT",
  "SLACK_BOT",
  "WHATSAPP_BOT",
]);

const GatewayCredentialsTelegram = z.object({ botToken: z.string().min(1) });
const GatewayCredentialsDiscord = z.object({
  botToken: z.string().min(1),
  applicationId: z.string().optional(),
});
const GatewayCredentialsSlack = z.object({
  botToken: z.string().min(1),
  signingSecret: z.string().optional(),
});
const GatewayCredentialsWhatsapp = z.object({
  accessToken: z.string().min(1),
  phoneNumberId: z.string().optional(),
});

const GatewayCredentialsAny = z.record(z.string(), z.unknown());

export const GatewaySpec = z.discriminatedUnion("source", [
  // Reference an existing gateway already owned by the user
  z.object({
    source: z.literal("existing"),
    ref: SpecLocalId,
    id: z.string().min(1),
  }),
  // Create a new gateway as part of this build
  z.object({
    source: z.literal("new"),
    ref: SpecLocalId,
    name: z.string().min(1).max(120),
    type: GatewayTypeEnum,
    credentials: z.union([
      GatewayCredentialsTelegram,
      GatewayCredentialsDiscord,
      GatewayCredentialsSlack,
      GatewayCredentialsWhatsapp,
      GatewayCredentialsAny,
    ]),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
]);

// ─────────────────────────────────────────────────────────────────────
// UserPlugin install
// ─────────────────────────────────────────────────────────────────────

export const PluginInstallSpec = z.object({
  ref: SpecLocalId,
  // Marketplace plugin slug (e.g. "echo-bot"). Must already exist in the
  // Plugin table — Wave 1 does NOT create new plugin code.
  pluginSlug: z.string().min(1).max(120),
  // Optional gateway binding by spec-local ref (or "existing-id:<id>").
  gatewayRef: SpecLocalId.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ─────────────────────────────────────────────────────────────────────
// Workflow (canvas) + steps + edges + gateway links
// ─────────────────────────────────────────────────────────────────────

export const WorkflowTriggerTypeEnum = z.enum([
  "BOT_MESSAGE",
  "TELEGRAM_MESSAGE",
  "TELEGRAM_CALLBACK",
  "DISCORD_MESSAGE",
  "DISCORD_COMMAND",
  "SLACK_MESSAGE",
  "SLACK_COMMAND",
  "WHATSAPP_MESSAGE",
  "SCHEDULE",
  "WEBHOOK",
  "MANUAL",
]);

export const WorkflowGatewayRoleEnum = z.enum(["trigger", "action-target", "side-effect"]);

export const WorkflowStepSpec = z.object({
  ref: SpecLocalId,
  order: z.number().int().min(0).default(0),
  name: z.string().max(120).optional(),
  // Reference an existing Plugin by slug (Wave 1 limitation).
  pluginSlug: z.string().min(1).max(120),
  // Per-step gateway override by spec-local ref (defaults to canvas trigger gateway).
  gatewayRef: SpecLocalId.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  inputMapping: z.record(z.string(), z.unknown()).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export const WorkflowEdgeSpec = z.object({
  fromStepRef: SpecLocalId,
  toStepRef: SpecLocalId,
});

export const WorkflowSpec = z.object({
  ref: SpecLocalId,
  name: z.string().min(1).max(120),
  slug: Slug,
  description: z.string().max(2000).optional(),
  triggerType: WorkflowTriggerTypeEnum,
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  // Multiple gateway bindings — replaces the legacy single gatewayId.
  gateways: z.array(z.object({
    gatewayRef: SpecLocalId,
    role: WorkflowGatewayRoleEnum.default("trigger"),
  })).default([]),
  steps: z.array(WorkflowStepSpec).default([]),
  edges: z.array(WorkflowEdgeSpec).default([]),
  // If true, workflow is created in DRAFT and activated only after smoke pass.
  activateOnSuccess: z.boolean().default(true),
});

// ─────────────────────────────────────────────────────────────────────
// Smoke tests (Wave 1: preflight-only)
// ─────────────────────────────────────────────────────────────────────

export const SmokeTestSpec = z.object({
  workflowRef: SpecLocalId,
  // Wave 1: only "preflight" is supported. Wave 2 will add "manual-run" and
  // "sample-payload".
  kind: z.literal("preflight").default("preflight"),
});

// ─────────────────────────────────────────────────────────────────────
// ProjectResource (Phase 7.3+)
//
// Currently shipping kinds: HTTP_ROUTE. Future kinds (SCHEDULE, SECRET,
// EXTERNAL_API, DATABASE, KV_STORE, OBJECT_STORE) will be added as new
// arms of the discriminated union — existing specs keep validating because
// the field is optional and defaults to `[]`.
// ─────────────────────────────────────────────────────────────────────

export const HttpMethodEnum = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "ANY",
]);

export const HttpAuthModeEnum = z.enum([
  "NONE",
  "API_KEY",
  "HMAC",
  "BEARER_JWT",
]);

const HttpRouteResourceConfig = z.object({
  method: HttpMethodEnum.default("ANY"),
  // URL path with optional `:params` and trailing `*` wildcard.
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^\/[A-Za-z0-9\-._~/:*]*$/,
      "path must start with '/' and contain only safe URL characters",
    ),
  /**
   * Spec-local ref to a `plugins[]` install that will receive the
   * `http.request` event. Optional — a route may be defined ahead of its
   * handler and bound later. Mutually exclusive with `targetWorkflowRef`.
   */
  targetPluginRef: SpecLocalId.optional(),
  /**
   * Spec-local ref to a `workflows[]` entry (must have triggerType=WEBHOOK)
   * that will be fired on each request. Mutually exclusive with
   * `targetPluginRef`.
   */
  targetWorkflowRef: SpecLocalId.optional(),
  targetExport: z.string().min(1).max(128).nullable().optional(),
  authMode: HttpAuthModeEnum.default("NONE"),
  authConfig: z.record(z.string(), z.unknown()).optional(),
  maxBodyKb: z.number().int().min(0).max(10_000).optional(),
  timeoutMs: z.number().int().min(100).max(60_000).optional(),
  corsOrigin: z.string().max(256).nullable().optional(),
  passthroughBody: z.boolean().optional(),
});

const HttpRouteResource = z.object({
  ref: SpecLocalId,
  kind: z.literal("HTTP_ROUTE"),
  name: z.string().min(1).max(120),
  slug: Slug.optional(),
  httpRoute: HttpRouteResourceConfig,
});

// SCHEDULE resource (Phase 7.4)
const ScheduleResourceConfig = z.object({
  /** 5-field cron expression. Validated at apply time by `cron-parser`. */
  cron: z.string().min(1).max(200),
  /** IANA timezone (e.g. "Europe/London"). Defaults to UTC. */
  timezone: z.string().min(1).max(64).nullable().optional(),
  /**
   * Spec-local ref to a `workflows[]` entry fired on each tick. Optional —
   * unbound schedules advance their `nextFireAt` without dispatching.
   */
  targetWorkflowRef: SpecLocalId.optional(),
  enabled: z.boolean().optional(),
});

const ScheduleResource = z.object({
  ref: SpecLocalId,
  kind: z.literal("SCHEDULE"),
  name: z.string().min(1).max(120),
  slug: Slug.optional(),
  schedule: ScheduleResourceConfig,
});

// SECRET resource (Phase 7.4)
const SecretResourceConfig = z.object({
  /** Logical identifier referenced by plugin/workflow code. */
  key: z
    .string()
    .regex(
      /^[A-Z0-9_]{1,128}$/,
      "secret key must match ^[A-Z0-9_]{1,128}$ (uppercase letters, digits, underscore)",
    ),
  /**
   * Plaintext value. Encrypted at rest with AES-256-GCM by the orchestrator;
   * never returned by the API.
   */
  value: z.string().min(1).max(64 * 1024),
  description: z.string().max(500).nullable().optional(),
});

const SecretResource = z.object({
  ref: SpecLocalId,
  kind: z.literal("SECRET"),
  name: z.string().min(1).max(120),
  slug: Slug.optional(),
  secret: SecretResourceConfig,
});

export const ResourceSpec = z.discriminatedUnion("kind", [
  HttpRouteResource,
  ScheduleResource,
  SecretResource,
]);

// ─────────────────────────────────────────────────────────────────────
// Top-level BuildSpec
// ─────────────────────────────────────────────────────────────────────

export const BuildSpecV1 = z.object({
  version: z.literal(1).default(1),
  project: ProjectSpec,
  gateways: z.array(GatewaySpec).default([]),
  plugins: z.array(PluginInstallSpec).default([]),
  workflows: z.array(WorkflowSpec).default([]),
  resources: z.array(ResourceSpec).default([]),
  smokeTests: z.array(SmokeTestSpec).default([]),
}).superRefine((spec, ctx) => {
  // Cross-reference validation: every gatewayRef must resolve to a known gateway.
  const gatewayRefs = new Set(spec.gateways.map((g) => g.ref));
  const stepRefsByWorkflow = new Map<string, Set<string>>();

  for (const wf of spec.workflows) {
    const stepRefs = new Set(wf.steps.map((s) => s.ref));
    stepRefsByWorkflow.set(wf.ref, stepRefs);

    for (const link of wf.gateways) {
      if (!gatewayRefs.has(link.gatewayRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workflows", wf.ref, "gateways"],
          message: `gatewayRef "${link.gatewayRef}" not found in spec.gateways`,
        });
      }
    }
    for (const step of wf.steps) {
      if (step.gatewayRef && !gatewayRefs.has(step.gatewayRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workflows", wf.ref, "steps", step.ref, "gatewayRef"],
          message: `step gatewayRef "${step.gatewayRef}" not found in spec.gateways`,
        });
      }
    }
    for (const edge of wf.edges) {
      if (!stepRefs.has(edge.fromStepRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workflows", wf.ref, "edges"],
          message: `edge.fromStepRef "${edge.fromStepRef}" not found in workflow steps`,
        });
      }
      if (!stepRefs.has(edge.toStepRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["workflows", wf.ref, "edges"],
          message: `edge.toStepRef "${edge.toStepRef}" not found in workflow steps`,
        });
      }
    }
  }

  for (const plugin of spec.plugins) {
    if (plugin.gatewayRef && !gatewayRefs.has(plugin.gatewayRef)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plugins", plugin.ref, "gatewayRef"],
        message: `plugin gatewayRef "${plugin.gatewayRef}" not found in spec.gateways`,
      });
    }
  }

  for (const test of spec.smokeTests) {
    const wfExists = spec.workflows.some((w) => w.ref === test.workflowRef);
    if (!wfExists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smokeTests"],
        message: `smokeTest workflowRef "${test.workflowRef}" not found`,
      });
    }
  }

  // Workflow slug uniqueness within a single spec.
  const wfSlugs = new Set<string>();
  for (const wf of spec.workflows) {
    if (wfSlugs.has(wf.slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workflows"],
        message: `duplicate workflow slug "${wf.slug}" within BuildSpec`,
      });
    }
    wfSlugs.add(wf.slug);
  }

  // Plugin & gateway ref uniqueness.
  const allRefs: string[] = [
    ...spec.gateways.map((g) => g.ref),
    ...spec.plugins.map((p) => p.ref),
    ...spec.workflows.map((w) => w.ref),
    ...spec.resources.map((r) => r.ref),
  ];
  const seen = new Set<string>();
  for (const r of allRefs) {
    if (seen.has(r)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refs"],
        message: `duplicate spec-local ref "${r}" — refs must be unique across gateways/plugins/workflows`,
      });
    }
    seen.add(r);
  }

  // ProjectResource cross-refs (Phase 7.3+).
  const pluginRefs = new Set(spec.plugins.map((p) => p.ref));
  const workflowRefs = new Set(spec.workflows.map((w) => w.ref));
  const httpRouteKey = new Set<string>();
  const secretKeys = new Set<string>();
  for (const r of spec.resources) {
    if (r.kind === "HTTP_ROUTE") {
      // targetPluginRef must resolve when set.
      if (r.httpRoute.targetPluginRef && !pluginRefs.has(r.httpRoute.targetPluginRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "httpRoute", "targetPluginRef"],
          message: `targetPluginRef "${r.httpRoute.targetPluginRef}" not found in spec.plugins`,
        });
      }
      // targetWorkflowRef must resolve when set.
      if (r.httpRoute.targetWorkflowRef && !workflowRefs.has(r.httpRoute.targetWorkflowRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "httpRoute", "targetWorkflowRef"],
          message: `targetWorkflowRef "${r.httpRoute.targetWorkflowRef}" not found in spec.workflows`,
        });
      }
      // Mutually exclusive targets.
      if (r.httpRoute.targetPluginRef && r.httpRoute.targetWorkflowRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "httpRoute"],
          message: "targetPluginRef and targetWorkflowRef are mutually exclusive",
        });
      }

      // (method, path) uniqueness within the spec — DB enforces (project, kind, slug)
      // but the (method, path) pair is what callers actually hit.
      const key = `${r.httpRoute.method}\u0000${r.httpRoute.path}`;
      if (httpRouteKey.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "httpRoute"],
          message: `duplicate HTTP_ROUTE for ${r.httpRoute.method} ${r.httpRoute.path}`,
        });
      }
      httpRouteKey.add(key);

      // Auth-mode requirements.
      if (r.httpRoute.authMode === "API_KEY") {
        const cfg = (r.httpRoute.authConfig ?? {}) as { apiKey?: unknown };
        if (typeof cfg.apiKey !== "string" || cfg.apiKey.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["resources", r.ref, "httpRoute", "authConfig", "apiKey"],
            message: "authMode=API_KEY requires authConfig.apiKey",
          });
        }
      }
      if (r.httpRoute.authMode === "HMAC") {
        const cfg = (r.httpRoute.authConfig ?? {}) as { hmacSecret?: unknown };
        if (typeof cfg.hmacSecret !== "string" || cfg.hmacSecret.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["resources", r.ref, "httpRoute", "authConfig", "hmacSecret"],
            message: "authMode=HMAC requires authConfig.hmacSecret",
          });
        }
      }
    }

    if (r.kind === "SCHEDULE") {
      if (r.schedule.targetWorkflowRef && !workflowRefs.has(r.schedule.targetWorkflowRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "schedule", "targetWorkflowRef"],
          message: `targetWorkflowRef "${r.schedule.targetWorkflowRef}" not found in spec.workflows`,
        });
      }
    }

    if (r.kind === "SECRET") {
      // Logical key uniqueness within the spec — multiple resources MAY share
      // a name but must NOT share a key (the bridge runtime resolves by key).
      if (secretKeys.has(r.secret.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", r.ref, "secret", "key"],
          message: `duplicate SECRET key "${r.secret.key}" within BuildSpec`,
        });
      }
      secretKeys.add(r.secret.key);
    }
  }
});

export type BuildSpec = z.infer<typeof BuildSpecV1>;
export type BuildSpecProject = z.infer<typeof ProjectSpec>;
export type BuildSpecGateway = z.infer<typeof GatewaySpec>;
export type BuildSpecPluginInstall = z.infer<typeof PluginInstallSpec>;
export type BuildSpecWorkflow = z.infer<typeof WorkflowSpec>;
export type BuildSpecWorkflowStep = z.infer<typeof WorkflowStepSpec>;
export type BuildSpecWorkflowEdge = z.infer<typeof WorkflowEdgeSpec>;
export type BuildSpecSmokeTest = z.infer<typeof SmokeTestSpec>;
export type BuildSpecResource = z.infer<typeof ResourceSpec>;
export type BuildSpecHttpRouteResource = z.infer<typeof HttpRouteResource>;
export type BuildSpecScheduleResource = z.infer<typeof ScheduleResource>;
export type BuildSpecSecretResource = z.infer<typeof SecretResource>;
