/**
 * SCHEDULE handler — KindHandler facade.
 *
 * @module modules/project-resource/kind-handlers/schedule.handler
 */

import {
    createScheduleResource,
    updateScheduleSidecar,
} from "../project-resource.service";
import type {
    CreateScheduleResourceInput,
    ProjectResourceOwnerFilter,
    UpdateScheduleSidecarInput,
} from "../project-resource.types";
import type { KindHandler } from "./types";

export const scheduleHandler: KindHandler = {
  kind: "SCHEDULE",
  hardDeleteAllowed: true,

  create: (owner, input) =>
    createScheduleResource(
      owner as ProjectResourceOwnerFilter,
      input as CreateScheduleResourceInput,
    ),

  updateSidecar: (owner, resourceId, input) =>
    updateScheduleSidecar(
      owner as ProjectResourceOwnerFilter,
      resourceId,
      input as UpdateScheduleSidecarInput,
    ),
};
