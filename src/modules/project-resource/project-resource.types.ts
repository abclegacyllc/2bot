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
  authMode?: HttpAuthMode;
  authConfig?: Record<string, unknown>;
  maxBodyKb?: number;
  timeoutMs?: number;
  corsOrigin?: string | null;
  passthroughBody?: boolean;
}
