/**
 * Project module types
 *
 * @module modules/project/project.types
 */

import type { ProjectKind, ProjectStatus } from "@prisma/client";

export interface ProjectOwnerFilter {
  userId: string;
  organizationId?: string | null;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description?: string | null;
  kind?: ProjectKind;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  kind?: ProjectKind;
  status?: ProjectStatus;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export interface LinkResourcesInput {
  gatewayIds?: string[];
  workflowIds?: string[];
  userPluginIds?: string[];
}
