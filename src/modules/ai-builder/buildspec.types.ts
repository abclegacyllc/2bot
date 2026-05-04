/**
 * BuildSpec types & result shapes
 *
 * @module modules/ai-builder/buildspec.types
 */

import type { BuildSpec } from "./buildspec.schema";

export type { BuildSpec } from "./buildspec.schema";

/**
 * Resolved id-map after a successful apply: spec-local ref → real DB id.
 */
export interface BuildSpecApplyResult {
  status: "applied" | "rolled-back" | "validation-failed";
  projectId?: string;
  /** Spec ref → DB id for resources actually created/linked */
  refMap: {
    gateways: Record<string, string>;
    plugins: Record<string, string>; // spec ref → UserPlugin.id
    workflows: Record<string, string>;
    /** Spec ref → ProjectResource.id (HTTP_ROUTE / SCHEDULE / SECRET). */
    resources: Record<string, string>;
  };
  /** Smoke test results, in spec order */
  smokeResults: BuildSpecSmokeResult[];
  /** If status === "rolled-back", the reason. */
  rollbackReason?: string;
  /** If status === "validation-failed", the zod issues formatted. */
  validationErrors?: Record<string, string[]>;
}

export interface BuildSpecSmokeResult {
  workflowRef: string;
  workflowId: string;
  ok: boolean;
  errorCount: number;
  warningCount: number;
  errors: Array<{ code: string; message: string }>;
}

export interface BuildSpecOwner {
  userId: string;
  organizationId?: string | null;
}

export interface BuildSpecApplyOptions {
  /**
   * If true (default), skip mutation and only validate the spec end-to-end.
   * Used by `/ai-builder/validate` and `/ai-builder/smoke-test` endpoints.
   */
  dryRun?: boolean;
  /**
   * If true and any smoke test fails, the entire apply is rolled back.
   * Defaults to true.
   */
  rollbackOnSmokeFailure?: boolean;
  /**
   * Optional human-readable label saved on created resources for audit trail.
   */
  source?: string;
}

export type ValidatedBuildSpec = BuildSpec;
