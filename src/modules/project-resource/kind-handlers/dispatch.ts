/**
 * KindHandler dispatch helpers
 *
 * Thin convenience layer over the registry. Routes call these instead of
 * the kind-specific helpers directly when they want type-safe dispatch:
 *
 *     await dispatchCreate(owner, { kind: "HTTP_ROUTE", input: { ... } });
 *
 * If a handler is registered but does not implement the requested
 * operation (e.g. GATEWAY_BOT has no `updateSidecar`), the dispatcher
 * throws ValidationError so the API surface returns a clean 400 instead of
 * a TypeError.
 *
 * @module modules/project-resource/kind-handlers/dispatch
 */

import type { ProjectResource } from "@prisma/client";

import { ValidationError } from "@/shared/errors";

import type { ProjectResourceOwnerFilter } from "../project-resource.types";
import { getKindHandler } from "./registry";
import type { CreateResourceInput, UpdateSidecarInput } from "./types";

export async function dispatchCreate(
  owner: ProjectResourceOwnerFilter,
  payload: CreateResourceInput,
): Promise<ProjectResource> {
  const handler = getKindHandler(payload.kind);
  if (!handler || !handler.create) {
    throw new ValidationError(
      `No create handler registered for kind "${payload.kind}"`,
    );
  }
  return handler.create(owner, payload.input);
}

/**
 * Dispatch a sidecar update. Returns `unknown` because each kind has its
 * own safe-shape (e.g. `SafeSecret`, `SafeExternalApi`,
 * `SafeDatabaseConnection`); the caller knows the kind it asked for and
 * can narrow with a type assertion or zod parse on the way out.
 */
export async function dispatchUpdateSidecar(
  owner: ProjectResourceOwnerFilter,
  resourceId: string,
  payload: UpdateSidecarInput,
): Promise<unknown> {
  const handler = getKindHandler(payload.kind);
  if (!handler || !handler.updateSidecar) {
    throw new ValidationError(
      `No updateSidecar handler registered for kind "${payload.kind}"`,
    );
  }
  return handler.updateSidecar(owner, resourceId, payload.input);
}
