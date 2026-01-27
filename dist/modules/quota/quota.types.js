"use strict";
/**
 * Quota Types
 *
 * Types and enums for the resource quota system.
 *
 * @module modules/quota/quota.types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceType = void 0;
// ===========================================
// Resource Types
// ===========================================
var ResourceType;
(function (ResourceType) {
    ResourceType["WORKFLOW"] = "workflow";
    ResourceType["PLUGIN"] = "plugin";
    ResourceType["API_CALL"] = "api_call";
    ResourceType["STORAGE"] = "storage";
    ResourceType["WORKFLOW_STEP"] = "workflow_step";
    ResourceType["GATEWAY"] = "gateway";
    ResourceType["DEPARTMENT"] = "department";
    ResourceType["MEMBER"] = "member";
})(ResourceType || (exports.ResourceType = ResourceType = {}));
//# sourceMappingURL=quota.types.js.map