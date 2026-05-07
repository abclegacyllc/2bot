/**
 * SECRET handler — KindHandler facade.
 *
 * @module modules/project-resource/kind-handlers/secret.handler
 */

import {
    createSecretResource,
    updateSecretSidecar,
} from "../project-resource.service";
import type {
    CreateSecretResourceInput,
    ProjectResourceOwnerFilter,
    UpdateSecretSidecarInput,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const secretHandler: KindHandler = {
  kind: "SECRET",
  hardDeleteAllowed: true,

  create: (owner, input) =>
    createSecretResource(
      owner as ProjectResourceOwnerFilter,
      input as CreateSecretResourceInput,
    ),

  updateSidecar: (owner, resourceId, input) =>
    updateSecretSidecar(
      owner as ProjectResourceOwnerFilter,
      resourceId,
      input as UpdateSecretSidecarInput,
    ),
};
