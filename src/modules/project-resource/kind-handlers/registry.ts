/**
 * KindHandler registry
 *
 * Central lookup table mapping `ProjectResourceKind` → `KindHandler`. The
 * dispatcher (see `kind-handlers/dispatch.ts`) consults this registry to
 * route create/update calls to the right per-kind implementation.
 *
 * Today the handlers thin-wrap the existing functions in
 * `project-resource.service.ts`. The contract lets future PRs migrate
 * per-kind logic into the handlers one at a time without changing callers.
 *
 * **Adding a new kind**
 *   1. Implement a `KindHandler` instance in `kind-handlers/<kind>.handler.ts`.
 *   2. Add it to the `handlers` array below.
 *   3. Update the relevant zod schemas in `routes/project-resource.ts`.
 *   4. Marketplace plugins that ship custom resources can call
 *      `registerKindHandler()` at boot time.
 *
 * @module modules/project-resource/kind-handlers/registry
 */

import type { ProjectResourceKind } from "@prisma/client";

import { databaseHandler } from "./database.handler";
import { externalApiHandler } from "./external-api.handler";
import { gatewayBotHandler } from "./gateway-bot.handler";
import { httpRouteHandler } from "./http-route.handler";
import { scheduleHandler } from "./schedule.handler";
import { secretHandler } from "./secret.handler";
import type { KindHandler } from "./types";

const builtins: KindHandler[] = [
  gatewayBotHandler,
  httpRouteHandler,
  scheduleHandler,
  secretHandler,
  externalApiHandler,
  databaseHandler,
];

const registry = new Map<ProjectResourceKind, KindHandler>();
for (const handler of builtins) {
  registry.set(handler.kind, handler);
}

/**
 * Resolve the handler for a given kind. Returns `undefined` if no handler
 * is registered — the dispatcher converts that to a typed error so callers
 * see "kind not supported" rather than `Cannot read properties of undefined`.
 */
export function getKindHandler(
  kind: ProjectResourceKind,
): KindHandler | undefined {
  return registry.get(kind);
}

/**
 * Register an additional handler at runtime. Intended for marketplace /
 * plugin boot code that ships its own `ProjectResourceKind`. Throws if a
 * handler is already registered for that kind to avoid silent overrides.
 */
export function registerKindHandler(handler: KindHandler): void {
  if (registry.has(handler.kind)) {
    throw new Error(
      `KindHandler for "${handler.kind}" is already registered`,
    );
  }
  registry.set(handler.kind, handler);
}

/** Test-only: clear and reseed registry. */
export function __resetRegistryForTests(): void {
  registry.clear();
  for (const handler of builtins) {
    registry.set(handler.kind, handler);
  }
}

/** Snapshot of all currently-registered kinds. */
export function listRegisteredKinds(): ProjectResourceKind[] {
  return Array.from(registry.keys());
}
