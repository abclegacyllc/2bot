/**
 * GATEWAY_BOT handler
 *
 * GATEWAY_BOT resources mirror existing Gateway rows; their lifecycle is
 * driven by the Gateway itself (the `Gateway → ProjectResource` relation
 * cascades on delete). The handler exposes a `create` for spec-driven
 * provisioning and forbids hard delete.
 *
 * @module modules/project-resource/kind-handlers/gateway-bot.handler
 */

import { createProjectResource } from "../project-resource.service";
import type {
    CreateProjectResourceInput,
    ProjectResourceOwnerFilter,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const gatewayBotHandler: KindHandler = {
  kind: "GATEWAY_BOT",
  hardDeleteAllowed: false,

  create: (owner, input) =>
    createProjectResource(owner as ProjectResourceOwnerFilter, {
      ...(input as CreateProjectResourceInput),
      kind: "GATEWAY_BOT",
    }),
};
