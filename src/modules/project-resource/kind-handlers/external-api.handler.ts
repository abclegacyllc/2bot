/**
 * EXTERNAL_API handler — KindHandler facade.
 *
 * @module modules/project-resource/kind-handlers/external-api.handler
 */

import {
    createExternalApiResource,
    updateExternalApiSidecar,
} from "../project-resource.service";
import type {
    CreateExternalApiResourceInput,
    ProjectResourceOwnerFilter,
    UpdateExternalApiSidecarInput,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const externalApiHandler: KindHandler = {
  kind: "EXTERNAL_API",
  hardDeleteAllowed: true,

  create: (owner, input) =>
    createExternalApiResource(
      owner as ProjectResourceOwnerFilter,
      input as CreateExternalApiResourceInput,
    ),

  updateSidecar: (owner, resourceId, input) =>
    updateExternalApiSidecar(
      owner as ProjectResourceOwnerFilter,
      resourceId,
      input as UpdateExternalApiSidecarInput,
    ),
};
