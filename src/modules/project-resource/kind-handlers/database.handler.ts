/**
 * DATABASE handler — KindHandler facade.
 *
 * @module modules/project-resource/kind-handlers/database.handler
 */

import {
    createDatabaseResource,
    updateDatabaseSidecar,
} from "../project-resource.service";
import type {
    CreateDatabaseResourceInput,
    ProjectResourceOwnerFilter,
    UpdateDatabaseSidecarInput,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const databaseHandler: KindHandler = {
  kind: "DATABASE",
  hardDeleteAllowed: true,

  create: (owner, input) =>
    createDatabaseResource(
      owner as ProjectResourceOwnerFilter,
      input as CreateDatabaseResourceInput,
    ),

  updateSidecar: (owner, resourceId, input) =>
    updateDatabaseSidecar(
      owner as ProjectResourceOwnerFilter,
      resourceId,
      input as UpdateDatabaseSidecarInput,
    ),
};
