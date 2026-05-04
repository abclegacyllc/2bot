/**
 * ProjectResource module types (Path C)
 *
 * @module modules/project-resource/project-resource.types
 */

import type {
    DatabaseDriver,
    DatabaseSslMode,
    ExternalApiAuthMode,
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

// ===========================================
// EXTERNAL_API sidecar (Phase 7.5)
// ===========================================

/**
 * Plaintext credential bag whose shape depends on `authMode`.
 *
 * - NONE     → undefined / empty
 * - API_KEY  → { apiKey, headerName? }
 * - BEARER   → { token }
 * - BASIC    → { username, password }
 * - HMAC     → { hmacSecret, algorithm? }
 *
 * Encrypted at rest as a single AES-256-GCM ciphertext blob.
 */
export type ExternalApiCredentials =
  | { apiKey: string; headerName?: string }
  | { token: string }
  | { username: string; password: string }
  | { hmacSecret: string; algorithm?: "sha256" | "sha512" }
  | Record<string, never>;

export interface ExternalApiSpec {
  /** Required base URL the API sits behind, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  authMode?: ExternalApiAuthMode;
  /** Plaintext credentials. Encrypted before persistence. */
  credentials?: ExternalApiCredentials;
  /** Default headers merged into every request (non-secret only). */
  defaultHeaders?: Record<string, string>;
  /** Per-call timeout in ms. 0 = platform default (15s). */
  timeoutMs?: number;
}

export interface CreateExternalApiResourceInput {
  projectId: string;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  metadata?: Record<string, unknown> | null;
  externalApi: ExternalApiSpec;
}

export interface UpdateExternalApiSidecarInput {
  baseUrl?: string;
  authMode?: ExternalApiAuthMode;
  /** When provided, rotates credentials (bumps version + lastRotatedAt). */
  credentials?: ExternalApiCredentials;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Public shape of an ExternalApi returned by the API. NEVER includes the
 * encrypted credential blob.
 */
export interface SafeExternalApi {
  id: string;
  resourceId: string;
  baseUrl: string;
  authMode: ExternalApiAuthMode;
  defaultHeaders: Record<string, string>;
  timeoutMs: number;
  version: number;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// DATABASE sidecar (Phase 7.5)
// ===========================================

export interface DatabaseSpec {
  driver: DatabaseDriver;
  /** Hostname or IP. For SQLITE this holds the file path. */
  host: string;
  /** TCP port. POSTGRES default 5432, MYSQL 3306. Ignored for SQLITE. */
  port?: number;
  /** Database / schema name. For SQLITE same as the file path. */
  database: string;
  username?: string | null;
  /** Plaintext password. Encrypted before persistence. Optional for SQLITE. */
  password?: string | null;
  sslMode?: DatabaseSslMode;
  poolMin?: number;
  poolMax?: number;
}

export interface CreateDatabaseResourceInput {
  projectId: string;
  name: string;
  slug?: string;
  status?: ProjectResourceStatus;
  metadata?: Record<string, unknown> | null;
  database: DatabaseSpec;
}

export interface UpdateDatabaseSidecarInput {
  driver?: DatabaseDriver;
  host?: string;
  port?: number;
  database?: string;
  username?: string | null;
  /** When provided, rotates the password (bumps version + lastRotatedAt). */
  password?: string | null;
  sslMode?: DatabaseSslMode;
  poolMin?: number;
  poolMax?: number;
}

/**
 * Public shape of a DatabaseConnection returned by the API. NEVER includes
 * the encrypted password blob.
 */
export interface SafeDatabaseConnection {
  id: string;
  resourceId: string;
  driver: DatabaseDriver;
  host: string;
  port: number;
  database: string;
  username: string | null;
  sslMode: DatabaseSslMode;
  poolMin: number;
  poolMax: number;
  version: number;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
