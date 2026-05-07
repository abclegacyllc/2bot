/**
 * HTTP_ROUTE handler
 *
 * Wraps the existing `createHttpRouteResource` / `updateHttpRouteSidecar`
 * helpers behind the KindHandler dispatch contract.
 *
 * @module modules/project-resource/kind-handlers/http-route.handler
 */

import {
    createHttpRouteResource,
    updateHttpRouteSidecar,
} from "../project-resource.service";
import type {
    CreateHttpRouteResourceInput,
    ProjectResourceOwnerFilter,
    UpdateHttpRouteSidecarInput,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const httpRouteHandler: KindHandler = {
  kind: "HTTP_ROUTE",
  hardDeleteAllowed: true,

  create: (owner, input) =>
    createHttpRouteResource(
      owner as ProjectResourceOwnerFilter,
      input as CreateHttpRouteResourceInput,
    ),

  updateSidecar: (owner, resourceId, input) =>
    updateHttpRouteSidecar(
      owner as ProjectResourceOwnerFilter,
      resourceId,
      input as UpdateHttpRouteSidecarInput,
    ),
};
