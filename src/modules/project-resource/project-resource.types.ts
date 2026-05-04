/**
 * ProjectResource module types (Path C)
 *
 * @module modules/project-resource/project-resource.types
 */

import type {
    HttpAuthMode,
    HttpMethod,
    ProjectResourceKind,
    ProjectResourceStatus,
} from "@prisma/client";

export interface ProjectResourceOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

export interface CreateProjectResourceInput {
  projectId: string;
  kind: ProjectResourceKind;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  /** When kind === 'GATEWAY_BOT'. */
  gatewayId?: string | null;
}

export interface UpdateProjectResourceInput {
  name?: string;
  slug?: string;
  status?: ProjectResourceStatus;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

export interface ListProjectResourcesOptions {
  kind?: ProjectResourceKind;
  status?: ProjectResourceStatus;
}

// ===========================================
// HTTP_ROUTE sidecar
// ===========================================

export interface HttpRouteSpec {
  method?: HttpMethod;
  path: string;
  targetUserPluginId?: string | null;
  targetExport?: string | null;
  /** Phase 7.3c: optional WEBHOOK-triggered Workflow target. */
  targetWorkflowId?: string | null;
  authMode?: HttpAuthMode;
  authConfig?: Record<string, unknown>;
  maxBodyKb?: number;
  timeoutMs?: number;
  corsOrigin?: string | null;
  passthroughBody?: boolean;
}

export interface CreateHttpRouteResourceInput {
  projectId: string;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  metadata?: Record<string, unknown> | null;
  httpRoute: HttpRouteSpec;
}

export interface UpdateHttpRouteSidecarInput {
  method?: HttpMethod;
  path?: string;
  targetUserPluginId?: string | null;
  targetExport?: string | null;
  /** Phase 7.3c: optional WEBHOOK-triggered Workflow target. */
  targetWorkflowId?: string | null;
  authMode?: HttpAuthMode;
  authConfig?: Record<string, unknown>;
  maxBodyKb?: number;
  timeoutMs?: number;
  corsOrigin?: string | null;
  passthroughBody?: boolean;
}

// ===========================================
// SCHEDULE sidecar (Phase 7.4)
// ===========================================

export interface ScheduleSpec {
  /** 5-field cron expression. */
  cron: string;
  /** IANA timezone name. Defaults to UTC. */
  timezone?: string | null;
  /** Workflow fired on each tick. Optional — unbound schedules are no-ops. */
  targetWorkflowId?: string | null;
  /** When false, the schedule exists but does not fire. */
  enabled?: boolean;
}

export interface CreateScheduleResourceInput {
  projectId: string;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  metadata?: Record<string, unknown> | null;
  schedule: ScheduleSpec;
}

export interface UpdateScheduleSidecarInput {
  cron?: string;
  timezone?: string | null;
  targetWorkflowId?: string | null;
  enabled?: boolean;
}

// ===========================================
// SECRET sidecar (Phase 7.4)
// ===========================================

export interface SecretSpec {
  /** Logical identifier referenced by plugin/workflow code, e.g. `OPENAI_API_KEY`. */
  key: string;
  /** Plaintext value. Encrypted at rest; never returned by the API. */
  value: string;
  description?: string | null;
}

export interface CreateSecretResourceInput {
  projectId: string;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  metadata?: Record<string, unknown> | null;
  secret: SecretSpec;
}

export interface UpdateSecretSidecarInput {
  /** When provided, rotates the value (bumps version + lastRotatedAt). */
  value?: string;
  /** Renaming the logical key. */
  key?: string;
  description?: string | null;
}

/**
 * Public shape of a Secret returned by the API. NEVER includes the plaintext
 * `value` field.
 */
export interface SafeSecret {
  id: string;
  resourceId: string;
  key: string;
  description: string | null;
  version: number;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
