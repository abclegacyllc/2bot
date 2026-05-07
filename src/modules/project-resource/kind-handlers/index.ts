/**
 * KindHandler module barrel.
 *
 * Public surface for the per-kind dispatcher pattern.
 *
 * @module modules/project-resource/kind-handlers
 */

export { dispatchCreate, dispatchUpdateSidecar } from "./dispatch";
export {
    __resetRegistryForTests,
    getKindHandler,
    listRegisteredKinds,
    registerKindHandler,
} from "./registry";
export type { CreateResourceInput, KindHandler, UpdateSidecarInput } from "./types";
