/**
 * Project Version types
 *
 * @module modules/project/project-version.types
 */

import type { ProjectVersionStatus } from "@prisma/client";

import type { ProjectOwnerFilter } from "./project.types";

export type ProjectVersionOwner = ProjectOwnerFilter;

/**
 * Manifest blob shape stored in `project_versions.manifest`.
 *
 * Captures everything needed to reconstruct a project's state. Plugin file
 * contents are referenced by hash + bundle path — the actual file bytes
 * live on the bridge volume, not in the manifest.
 */
export interface ProjectManifest {
  /** Manifest schema version (bump on breaking changes). */
  version: 1;

  project: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    kind: string;
    icon: string | null;
    color: string | null;
  };

  gateways: Array<{
    id: string;
    name: string;
    type: string;
    config: unknown;
    /** Credentials are stored encrypted at rest; we keep the encrypted blob. */
    credentialsEncrypted: string | null;
  }>;

  plugins: Array<{
    userPluginId: string;
    pluginSlug: string;
    pluginVersion: string | null;
    config: unknown;
    gatewayId: string | null;
    /** Bundle path on the bridge volume (`plugins/<projectSlug>/<pluginSlug>/`). */
    bundlePath: string | null;
    /** SHA-256 of the entry file contents at snapshot time. */
    entryFileHash: string | null;
  }>;

  workflows: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    triggerType: string;
    triggerConfig: unknown;
    status: string;
    isEnabled: boolean;
    gateways: Array<{ gatewayId: string; role: string }>;
    steps: Array<{
      id: string;
      order: number;
      name: string | null;
      pluginSlug: string;
      gatewayId: string | null;
      config: unknown;
      inputMapping: unknown;
      positionX: number | null;
      positionY: number | null;
    }>;
    edges: Array<{ id: string; fromStepId: string | null; toStepId: string }>;
  }>;

  /** When the snapshot was captured (ISO). */
  capturedAt: string;
}

export interface CreateVersionInput {
  /** Optional caller-provided source tag (e.g. "ai-agent", "cli", "api"). */
  source?: string;
  /** Optional buildspec hash for traceability. */
  buildspecHash?: string;
  /** UserId who triggered the apply. */
  appliedBy?: string;
}

export interface ProjectVersionSummary {
  id: string;
  projectId: string;
  versionNumber: number;
  status: ProjectVersionStatus;
  source: string | null;
  buildspecHash: string | null;
  appliedBy: string | null;
  createdAt: Date;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
}
