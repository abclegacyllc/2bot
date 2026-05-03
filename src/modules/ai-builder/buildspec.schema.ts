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
// Top-level BuildSpec
// ─────────────────────────────────────────────────────────────────────

export const BuildSpecV1 = z.object({
  version: z.literal(1).default(1),
  project: ProjectSpec,
  gateways: z.array(GatewaySpec).default([]),
  plugins: z.array(PluginInstallSpec).default([]),
  workflows: z.array(WorkflowSpec).default([]),
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
});

export type BuildSpec = z.infer<typeof BuildSpecV1>;
export type BuildSpecProject = z.infer<typeof ProjectSpec>;
export type BuildSpecGateway = z.infer<typeof GatewaySpec>;
export type BuildSpecPluginInstall = z.infer<typeof PluginInstallSpec>;
export type BuildSpecWorkflow = z.infer<typeof WorkflowSpec>;
export type BuildSpecWorkflowStep = z.infer<typeof WorkflowStepSpec>;
export type BuildSpecWorkflowEdge = z.infer<typeof WorkflowEdgeSpec>;
export type BuildSpecSmokeTest = z.infer<typeof SmokeTestSpec>;
