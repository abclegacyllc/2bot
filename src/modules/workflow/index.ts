/**
 * Workflow Module
 *
 * Exports for workflow automation system.
 *
 * @module modules/workflow
 */

// Types
export * from "./workflow.types";

// Validation schemas
export {
    // Workflow schemas
    createWorkflowSchema, createWorkflowStepSchema, errorHandlerSchema,
    // Step schemas
    inputMappingSchema, manualTriggerConfigSchema, scheduleTriggerConfigSchema, stepConditionSchema, telegramCallbackTriggerConfigSchema,
    // Trigger config schemas
    telegramMessageTriggerConfigSchema, triggerConfigSchema, triggerTypeSchema, triggerWorkflowSchema, updateWorkflowSchema, updateWorkflowStepSchema, webhookTriggerConfigSchema,
    // Query schemas
    workflowListQuerySchema,
    // Common schemas
    workflowNameSchema, workflowRunListQuerySchema, workflowScopeSchema, workflowSlugSchema, workflowStatusSchema,
    // Inferred types
    type CreateWorkflowInput, type CreateWorkflowStepInput, type TriggerType, type TriggerWorkflowInput, type UpdateWorkflowInput, type UpdateWorkflowStepInput, type WorkflowListQuery,
    type WorkflowRunListQuery, type WorkflowScope, type WorkflowStatus
} from "./workflow.validation";

