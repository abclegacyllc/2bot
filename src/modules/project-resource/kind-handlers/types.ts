/**
 * KindHandler interface
 *
 * A KindHandler encapsulates the per-kind logic that the polymorphic
 * ProjectResource layer needs to delegate based on `ProjectResource.kind`:
 * input validation, resource creation (incl. sidecar), sidecar updates, and
 * any kind-specific cleanup that should run before / instead of the generic
 * `deleteProjectResource` path.
 *
 * The handler does NOT own the parent `ProjectResource` row — generic
 * mutations (rename, archive, slug change, status flip) still flow through
 * `project-resource.service.ts`. Handlers exist so:
 *
 *   1. New resource kinds can be added without editing a 1.7k-line monolith.
 *   2. Marketplace plugins can ship custom kinds by registering a handler.
 *   3. Tests can exercise per-kind logic in isolation.
 *
 * This file intentionally only defines the *contract*. The current
 * implementations in `kind-handlers/*.handler.ts` delegate to the existing
 * functions in `project-resource.service.ts`; future PRs can move logic
 * into the handlers one kind at a time.
 *
 * @module modules/project-resource/kind-handlers/types
 */

import type { ProjectResource, ProjectResourceKind } from "@prisma/client";

import type {
    CreateDatabaseResourceInput,
    CreateExternalApiResourceInput,
    CreateHttpRouteResourceInput,
    CreateProjectResourceInput,
    CreateScheduleResourceInput,
    CreateSecretResourceInput,
    ProjectResourceOwnerFilter,
    UpdateDatabaseSidecarInput,
    UpdateExternalApiSidecarInput,
    UpdateHttpRouteSidecarInput,
    UpdateScheduleSidecarInput,
    UpdateSecretSidecarInput,
} from "../project-resource.types";

/**
 * Discriminated union for create-with-sidecar inputs. Matches the shape
 * accepted by the existing `createXxxResource()` helpers — the dispatcher
 * just routes to the correct one.
 */
export type CreateResourceInput =
  | { kind: "GATEWAY_BOT"; input: CreateProjectResourceInput }
  | { kind: "HTTP_ROUTE"; input: CreateHttpRouteResourceInput }
  | { kind: "SCHEDULE"; input: CreateScheduleResourceInput }
  | { kind: "SECRET"; input: CreateSecretResourceInput }
  | { kind: "EXTERNAL_API"; input: CreateExternalApiResourceInput }
  | { kind: "DATABASE"; input: CreateDatabaseResourceInput };

export type UpdateSidecarInput =
  | { kind: "HTTP_ROUTE"; input: UpdateHttpRouteSidecarInput }
  | { kind: "SCHEDULE"; input: UpdateScheduleSidecarInput }
  | { kind: "SECRET"; input: UpdateSecretSidecarInput }
  | { kind: "EXTERNAL_API"; input: UpdateExternalApiSidecarInput }
  | { kind: "DATABASE"; input: UpdateDatabaseSidecarInput };

/**
 * Per-kind handler. The interface is intentionally permissive on
 * input/output types — the dispatcher narrows them via the discriminated
 * unions above. Wrappers in `kind-handlers/*.handler.ts` can be more
 * strictly typed; they're cast to this shape at registry time.
 *
 * Implementations may return either the parent `ProjectResource` row or a
 * sidecar-shaped object (e.g. `SafeSecret`, `SafeExternalApi`) — the
 * registry is intentionally lenient about return type so the existing
 * service helpers can be wrapped without rewriting their signatures.
 */
export interface KindHandler {
  readonly kind: ProjectResourceKind;

  /**
   * Whether this kind can be hard-deleted via the generic delete endpoint.
   * GATEWAY_BOT returns false because deletion is driven by the parent
   * Gateway's onDelete cascade.
   */
  readonly hardDeleteAllowed: boolean;

  /**
   * Create a resource of this kind plus its sidecar row(s). The `input`
   * shape is the matching `Create*ResourceInput` from
   * `project-resource.types`; the registry stores handlers in their
   * concrete-typed form and the dispatcher narrows the union before
   * calling.
   */
  create?: (
    owner: ProjectResourceOwnerFilter,
    input: unknown,
  ) => Promise<ProjectResource>;

  /**
   * Update the sidecar row(s) for an existing resource of this kind.
   * Returns the kind-specific safe view (e.g. `SafeSecret`,
   * `SafeExternalApi`) or the parent `ProjectResource`, depending on the
   * underlying helper.
   */
  updateSidecar?: (
    owner: ProjectResourceOwnerFilter,
    resourceId: string,
    input: unknown,
  ) => Promise<unknown>;
}
