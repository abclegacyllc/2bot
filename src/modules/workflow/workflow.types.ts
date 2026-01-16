/**
 * Workflow Types
 *
 * Type definitions for workflow automation system.
 * Workflows chain plugins together with triggers, conditions, and mappings.
 *
 * @module modules/workflow/workflow.types
 */

import type {
    WorkflowScope,
    WorkflowStatus,
    WorkflowTriggerType
} from "@prisma/client";

// Re-export Prisma types
export type {
    Workflow, WorkflowRun, WorkflowScope, WorkflowStatus, WorkflowStep, WorkflowStepRun,
    WorkflowTriggerType
} from "@prisma/client";

// ===========================================
// Trigger Configurations
// ===========================================

/**
 * Telegram message trigger config
 */
export interface TelegramMessageTriggerConfig {
  /** Filter by message type */
  filterType?: "all" | "text" | "photo" | "document" | "command";
  /** Command prefix (e.g., "/start") */
  commandPrefix?: string;
  /** Text pattern regex */
  textPattern?: string;
  /** Chat type filter */
  chatTypes?: Array<"private" | "group" | "supergroup" | "channel">;
}

/**
 * Telegram callback trigger config
 */
export interface TelegramCallbackTriggerConfig {
  /** Callback data pattern (regex or exact) */
  dataPattern?: string;
  /** Exact match values */
  dataValues?: string[];
}

/**
 * Schedule (cron) trigger config
 */
export interface ScheduleTriggerConfig {
  /** Cron expression (e.g., "0 9 * * *" for 9am daily) */
  cron: string;
  /** Timezone (e.g., "America/New_York") */
  timezone?: string;
  /** Start date */
  startDate?: string;
  /** End date */
  endDate?: string;
}

/**
 * Webhook trigger config
 */
export interface WebhookTriggerConfig {
  /** Validation secret */
  secret?: string;
  /** Allowed HTTP methods */
  methods?: Array<"GET" | "POST" | "PUT" | "DELETE">;
  /** Expected content type */
  contentType?: string;
}

/**
 * Manual trigger config
 */
export interface ManualTriggerConfig {
  /** Required parameters */
  requiredParams?: string[];
  /** Parameter schema (JSON Schema) */
  paramsSchema?: Record<string, unknown>;
}

/**
 * Union type for all trigger configs
 */
export type TriggerConfig =
  | TelegramMessageTriggerConfig
  | TelegramCallbackTriggerConfig
  | ScheduleTriggerConfig
  | WebhookTriggerConfig
  | ManualTriggerConfig
  | Record<string, unknown>;

// ===========================================
// Step Configuration
// ===========================================

/**
 * Input mapping template
 * Maps data from trigger/previous steps to plugin input
 *
 * @example
 * {
 *   "text": "{{trigger.message.text}}",
 *   "userId": "{{ctx.userId}}",
 *   "previousResult": "{{steps.0.output.result}}"
 * }
 */
export interface InputMapping {
  [outputKey: string]: string;
}

/**
 * Conditional execution expression
 *
 * @example
 * { if: "{{prev.sentiment}} == 'negative'" }
 * { if: "{{trigger.message.text}}.includes('urgent')" }
 */
export interface StepCondition {
  /** JavaScript-like expression */
  if: string;
}

/**
 * Error handling strategy for a step
 */
export type StepErrorHandler = "stop" | "continue" | "retry";

// ===========================================
// API Response Types
// ===========================================

/**
 * Workflow definition for API responses
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  slug: string;
  scope: WorkflowScope;
  triggerType: WorkflowTriggerType;
  triggerConfig: TriggerConfig;
  gatewayId?: string;
  status: WorkflowStatus;
  isEnabled: boolean;
  steps: WorkflowStepDefinition[];
  executionCount: number;
  lastExecutedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow step definition for API responses
 */
export interface WorkflowStepDefinition {
  id: string;
  order: number;
  name?: string;
  pluginId: string;
  pluginSlug?: string;
  pluginName?: string;
  inputMapping: InputMapping;
  config: Record<string, unknown>;
  gatewayId?: string;
  condition?: StepCondition;
  onError: StepErrorHandler;
  maxRetries: number;
}

/**
 * Workflow run summary for API responses
 */
export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  triggeredBy: string;
  status: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  stepsCompleted: number;
  totalSteps: number;
}

/**
 * Workflow run detail for API responses
 */
export interface WorkflowRunDetail extends WorkflowRunSummary {
  triggerData?: unknown;
  output?: unknown;
  failedStepOrder?: number;
  stepRuns: WorkflowStepRunDetail[];
}

/**
 * Step run detail for API responses
 */
export interface WorkflowStepRunDetail {
  id: string;
  stepOrder: number;
  stepName?: string;
  pluginSlug: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
}

// ===========================================
// Execution Context Types
// ===========================================

/**
 * Execution context passed through workflow steps
 */
export interface WorkflowExecutionContext {
  /** Workflow ID */
  workflowId: string;
  /** Run ID */
  runId: string;
  /** User who owns the workflow */
  userId: string;
  /** Organization ID if org workflow */
  organizationId?: string;
  /** Trigger information */
  trigger: {
    type: WorkflowTriggerType;
    data: unknown;
    timestamp: Date;
  };
  /** Variables accumulated during execution */
  variables: Record<string, unknown>;
  /** Results from each step */
  steps: Record<
    number,
    {
      input: unknown;
      output: unknown;
      status: string;
      durationMs: number;
    }
  >;
}

/**
 * Template context for variable resolution
 * Available variables in input mappings and conditions
 */
export interface TemplateContext {
  /** Original trigger data */
  trigger: unknown;
  /** Previous step output (shortcut for steps[currentStep-1].output) */
  prev?: unknown;
  /** All step outputs by order */
  steps: Record<number, unknown>;
  /** Environment variables (whitelisted) */
  env: Record<string, string>;
  /** Execution context */
  ctx: {
    userId: string;
    organizationId?: string;
    workflowId: string;
    runId: string;
    timestamp: Date;
  };
}

// ===========================================
// Request/Response Types
// ===========================================

/**
 * Create workflow request
 */
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  slug: string;
  scope?: WorkflowScope;
  triggerType: WorkflowTriggerType;
  triggerConfig?: TriggerConfig;
  gatewayId?: string;
}

/**
 * Update workflow request
 */
export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  slug?: string;
  triggerType?: WorkflowTriggerType;
  triggerConfig?: TriggerConfig;
  gatewayId?: string | null;
  status?: WorkflowStatus;
  isEnabled?: boolean;
}

/**
 * Create workflow step request
 */
export interface CreateWorkflowStepRequest {
  order: number;
  name?: string;
  pluginId: string;
  inputMapping?: InputMapping;
  config?: Record<string, unknown>;
  gatewayId?: string;
  condition?: StepCondition;
  onError?: StepErrorHandler;
  maxRetries?: number;
}

/**
 * Update workflow step request
 */
export interface UpdateWorkflowStepRequest {
  name?: string;
  order?: number;
  pluginId?: string;
  inputMapping?: InputMapping;
  config?: Record<string, unknown>;
  gatewayId?: string | null;
  condition?: StepCondition | null;
  onError?: StepErrorHandler;
  maxRetries?: number;
}

/**
 * Manual trigger request
 */
export interface TriggerWorkflowRequest {
  params?: Record<string, unknown>;
}

// ===========================================
// Workflow Statistics
// ===========================================

/**
 * Workflow statistics
 */
export interface WorkflowStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

/**
 * User workflow summary
 */
export interface UserWorkflowSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  runsThisMonth: number;
  mostUsedWorkflow?: {
    id: string;
    name: string;
    executionCount: number;
  };
}
