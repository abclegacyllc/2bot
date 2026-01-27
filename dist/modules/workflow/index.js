"use strict";
/**
 * Workflow Module
 *
 * Exports for workflow automation system.
 *
 * @module modules/workflow
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowStatusSchema = exports.workflowSlugSchema = exports.workflowScopeSchema = exports.workflowRunListQuerySchema = exports.workflowNameSchema = exports.workflowListQuerySchema = exports.webhookTriggerConfigSchema = exports.updateWorkflowStepSchema = exports.updateWorkflowSchema = exports.triggerWorkflowSchema = exports.triggerTypeSchema = exports.triggerConfigSchema = exports.telegramMessageTriggerConfigSchema = exports.telegramCallbackTriggerConfigSchema = exports.stepConditionSchema = exports.scheduleTriggerConfigSchema = exports.manualTriggerConfigSchema = exports.inputMappingSchema = exports.errorHandlerSchema = exports.createWorkflowStepSchema = exports.createWorkflowSchema = void 0;
// Types
__exportStar(require("./workflow.types"), exports);
// Validation schemas
var workflow_validation_1 = require("./workflow.validation");
// Workflow schemas
Object.defineProperty(exports, "createWorkflowSchema", { enumerable: true, get: function () { return workflow_validation_1.createWorkflowSchema; } });
Object.defineProperty(exports, "createWorkflowStepSchema", { enumerable: true, get: function () { return workflow_validation_1.createWorkflowStepSchema; } });
Object.defineProperty(exports, "errorHandlerSchema", { enumerable: true, get: function () { return workflow_validation_1.errorHandlerSchema; } });
// Step schemas
Object.defineProperty(exports, "inputMappingSchema", { enumerable: true, get: function () { return workflow_validation_1.inputMappingSchema; } });
Object.defineProperty(exports, "manualTriggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.manualTriggerConfigSchema; } });
Object.defineProperty(exports, "scheduleTriggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.scheduleTriggerConfigSchema; } });
Object.defineProperty(exports, "stepConditionSchema", { enumerable: true, get: function () { return workflow_validation_1.stepConditionSchema; } });
Object.defineProperty(exports, "telegramCallbackTriggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.telegramCallbackTriggerConfigSchema; } });
// Trigger config schemas
Object.defineProperty(exports, "telegramMessageTriggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.telegramMessageTriggerConfigSchema; } });
Object.defineProperty(exports, "triggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.triggerConfigSchema; } });
Object.defineProperty(exports, "triggerTypeSchema", { enumerable: true, get: function () { return workflow_validation_1.triggerTypeSchema; } });
Object.defineProperty(exports, "triggerWorkflowSchema", { enumerable: true, get: function () { return workflow_validation_1.triggerWorkflowSchema; } });
Object.defineProperty(exports, "updateWorkflowSchema", { enumerable: true, get: function () { return workflow_validation_1.updateWorkflowSchema; } });
Object.defineProperty(exports, "updateWorkflowStepSchema", { enumerable: true, get: function () { return workflow_validation_1.updateWorkflowStepSchema; } });
Object.defineProperty(exports, "webhookTriggerConfigSchema", { enumerable: true, get: function () { return workflow_validation_1.webhookTriggerConfigSchema; } });
// Query schemas
Object.defineProperty(exports, "workflowListQuerySchema", { enumerable: true, get: function () { return workflow_validation_1.workflowListQuerySchema; } });
// Common schemas
Object.defineProperty(exports, "workflowNameSchema", { enumerable: true, get: function () { return workflow_validation_1.workflowNameSchema; } });
Object.defineProperty(exports, "workflowRunListQuerySchema", { enumerable: true, get: function () { return workflow_validation_1.workflowRunListQuerySchema; } });
Object.defineProperty(exports, "workflowScopeSchema", { enumerable: true, get: function () { return workflow_validation_1.workflowScopeSchema; } });
Object.defineProperty(exports, "workflowSlugSchema", { enumerable: true, get: function () { return workflow_validation_1.workflowSlugSchema; } });
Object.defineProperty(exports, "workflowStatusSchema", { enumerable: true, get: function () { return workflow_validation_1.workflowStatusSchema; } });
//# sourceMappingURL=index.js.map