# Phase 10: Workflow System (V2)

> **Goal:** Build n8n/Zapier-like visual workflow builder for plugin automation chains
> **Estimated Sessions:** 15-20
> **Prerequisites:** Phase 9 complete, Workflow models from Phase 3, Phase 4 (Organizations) complete

---

## 📋 Task Overview

| ID | Task | Status | Notes |
|----|------|--------|-------|
| **Workflow Service** ||||
| 10.1.1 | Create workflow service | ⬜ | CRUD + validation |
| 10.1.2 | Create workflow API endpoints | ⬜ | |
| 10.1.3 | Create template engine | ⬜ | Variable resolution |
| **Workflow Scopes** ||||
| 10.1.4 | Implement workflow scopes | ⬜ | USER, DEPARTMENT, ORGANIZATION |
| 10.1.5 | Create scope-based access control | ⬜ | Permission checks |
| 10.1.6 | Create scope selection UI | ⬜ | Context-aware options |
| **Workflow Execution** ||||
| 10.2.1 | Create workflow executor | ⬜ | Step-by-step execution |
| 10.2.2 | Create trigger handlers | ⬜ | Telegram, schedule, webhook |
| 10.2.3 | Create step executor | ⬜ | Plugin invocation |
| 10.2.4 | Create error handler | ⬜ | Retry, continue, stop |
| **Resource Limits** ||||
| 10.2.5 | Implement workflow resource limits | ⬜ | Timeout, memory, steps |
| 10.2.6 | Implement rate limiting | ⬜ | Per user/dept/org |
| 10.2.7 | Add quota checks to workflow creation | ⬜ | Enforce plan limits |
| **Workflow Triggers** ||||
| 10.3.1 | Implement Telegram triggers | ⬜ | Message, callback |
| 10.3.2 | Implement Schedule triggers | ⬜ | Cron-based |
| 10.3.3 | Implement Webhook triggers | ⬜ | External HTTP |
| 10.3.4 | Implement Manual triggers | ⬜ | User-initiated |
| **Workflow UI** ||||
| 10.4.1 | Create workflow list page | ⬜ | With scope filter |
| 10.4.2 | Create visual workflow builder | ⬜ | Drag-and-drop |
| 10.4.3 | Create step configuration panel | ⬜ | |
| 10.4.4 | Create input mapping UI | ⬜ | Template variables |
| 10.4.5 | Create workflow test/run UI | ⬜ | |
| **Run History** ||||
| 10.5.1 | Create run history page | ⬜ | |
| 10.5.2 | Create run detail view | ⬜ | Step-by-step trace |
| 10.5.3 | Create run replay | ⬜ | Re-run with same input |

---

## 🏢 Workflow Scope Architecture

### Context: Personal Workspace vs Organization

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TWO WORKSPACE CONTEXTS                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PERSONAL WORKSPACE (No Organization)                            │   │
│  │                                                                  │   │
│  │  User with FREE/PRO plan, not part of any org                    │   │
│  │                                                                  │   │
│  │  - Only ONE scope: USER (personal workflows)                     │   │
│  │  - No departments, no org hierarchy                              │   │
│  │  - Limits from user's personal plan                              │   │
│  │  - User owns all their workflows                                 │   │
│  │                                                                  │   │
│  │  Example: Solo developer, freelancer, hobbyist                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ORGANIZATION WORKSPACE                                          │   │
│  │                                                                  │   │
│  │  User is member of an organization                               │   │
│  │                                                                  │   │
│  │  - THREE scopes: PERSONAL, DEPARTMENT, ORGANIZATION              │   │
│  │  - Hierarchical access control                                   │   │
│  │  - Limits from org plan + dept/employee quotas                   │   │
│  │                                                                  │   │
│  │  Example: Company team members                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Personal Workspace (User-Level) Workflows

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 USER-LEVEL WORKFLOWS (No Organization)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User: john@example.com                                                 │
│  Plan: PRO (personal subscription)                                      │
│  Context: Personal Workspace                                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MY WORKFLOWS                                                    │   │
│  │                                                                  │   │
│  │  📋 Daily Standup Reminder          [Active]   [Edit] [Delete]   │   │
│  │  📋 Blog Post to Telegram           [Active]   [Edit] [Delete]   │   │
│  │  📋 Customer Inquiry Auto-Reply     [Paused]   [Edit] [Delete]   │   │
│  │  📋 Weekly Analytics Report         [Active]   [Edit] [Delete]   │   │
│  │                                                                  │   │
│  │  Used: 4/10 workflows                                            │   │
│  │                                                                  │   │
│  │  [+ Create Workflow]                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Resource Limits (PRO Personal Plan):                                   │
│  • Max workflows: 10                                                    │
│  • Max steps per workflow: 10                                           │
│  • Timeout: 30 seconds                                                  │
│  • API calls: 10,000/day                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### User-Level Resource Limits (Personal Workspace)

```
┌─────────────────────────────────────────────────────────────────────────┐
│              PERSONAL WORKSPACE LIMITS (No Organization)                │
├─────────────────┬───────────────┬───────────────┬───────────────────────┤
│     Resource    │     FREE      │      PRO      │     Notes             │
├─────────────────┼───────────────┼───────────────┼───────────────────────┤
│ Workflows       │       3       │      10       │ Total owned           │
│ Steps/Workflow  │       5       │      10       │                       │
│ Timeout         │      15s      │      30s      │ Per execution         │
│ Memory          │     64 MB     │    128 MB     │ Per execution         │
│ API Calls/Day   │     500       │   10,000      │                       │
│ Storage         │     50 MB     │    500 MB     │                       │
│ Parallel Runs   │       1       │       3       │ Same workflow         │
└─────────────────┴───────────────┴───────────────┴───────────────────────┘
```

### The Three Workflow Scopes (Organization Context)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WORKFLOW SCOPE HIERARCHY                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ORGANIZATION SCOPE                                              │   │
│  │                                                                  │   │
│  │  - Created by: Owner only                                        │   │
│  │  - Used by: All members across all departments                   │   │
│  │  - Example: Company-wide announcement bot                        │   │
│  │  - Resource limit: Organization plan limits                      │   │
│  │  - Gateways: Uses organization's shared gateways                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  DEPARTMENT SCOPE                                                │   │
│  │                                                                  │   │
│  │  - Created by: Owner or Department Manager                       │   │
│  │  - Used by: All members of that department                       │   │
│  │  - Example: Sales team lead notification                         │   │
│  │  - Resource limit: Department quota (set by Owner)               │   │
│  │  - Gateways: Department-specific or org gateways                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PERSONAL SCOPE                                                  │   │
│  │                                                                  │   │
│  │  - Created by: Any employee                                      │   │
│  │  - Used by: Only that employee                                   │   │
│  │  - Example: Personal reminder, task automation                   │   │
│  │  - Resource limit: Employee quota (set by Manager)               │   │
│  │  - Gateways: Must use existing dept/org gateways                 │   │
│  │  - Restrictions:                                                 │   │
│  │    • Max 5 workflows per employee (configurable)                 │   │
│  │    • Max 5 steps per workflow                                    │   │
│  │    • Cannot trigger department/org workflows                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Workflow Scope Database Schema

```prisma
enum WorkflowScope {
  USER           // Personal workspace (no org) OR employee personal in org
  DEPARTMENT     // Shared within department (org only)
  ORGANIZATION   // Company-wide automation (org only)
}

model Workflow {
  id               String           @id @default(cuid())
  
  // Ownership
  userId           String           @map("user_id")        // Creator (always required)
  organizationId   String?          @map("organization_id") // NULL = personal workspace
  departmentId     String?          @map("department_id")   // Only for DEPARTMENT scope
  
  // Scope determines visibility and access
  // - USER scope: If organizationId=NULL, it's personal workspace workflow
  //               If organizationId!=NULL, it's employee personal workflow
  // - DEPARTMENT: Requires departmentId, shared within department
  // - ORGANIZATION: Shared across entire organization
  scope            WorkflowScope    @default(USER)
  
  // ... rest of workflow fields
}
```

### Scope Logic

```typescript
// Determine workflow context
function getWorkflowContext(workflow: Workflow) {
  if (!workflow.organizationId) {
    // PERSONAL WORKSPACE - user's own workflows
    return {
      context: 'PERSONAL_WORKSPACE',
      owner: workflow.userId,
      visibility: 'SELF_ONLY',
    };
  }
  
  // ORGANIZATION CONTEXT
  switch (workflow.scope) {
    case 'USER':
      return {
        context: 'ORG_PERSONAL',
        owner: workflow.userId,
        visibility: 'SELF_AND_MANAGERS',
      };
    case 'DEPARTMENT':
      return {
        context: 'ORG_DEPARTMENT',
        owner: workflow.departmentId,
        visibility: 'DEPARTMENT_MEMBERS',
      };
    case 'ORGANIZATION':
      return {
        context: 'ORG_WIDE',
        owner: workflow.organizationId,
        visibility: 'ALL_MEMBERS',
      };
  }
}
```

### Scope Access Rules

```
┌────────────────────┬──────────────────┬─────────────────┬────────────────┐
│     User Role      │   ORGANIZATION   │   DEPARTMENT    │    PERSONAL    │
├────────────────────┼──────────────────┼─────────────────┼────────────────┤
│ Owner              │ Create/Edit/Run  │ Create/Edit/Run │ View only      │
│ Department Manager │ Run only         │ Create/Edit/Run │ View dept only │
│ Member/Employee    │ Run only         │ Run only        │ Own only       │
└────────────────────┴──────────────────┴─────────────────┴────────────────┘
```

### Resource Limits by Scope

```
┌────────────────────┬───────────────┬───────────────┬───────────────────────┐
│     Resource       │   PERSONAL    │  DEPARTMENT   │    ORGANIZATION       │
├────────────────────┼───────────────┼───────────────┼───────────────────────┤
│ Timeout (per run)  │     15s       │      30s      │         60s           │
│ Memory limit       │    64 MB      │    128 MB     │        256 MB         │
│ Max steps          │      5        │      15       │         30            │
│ Max workflows      │   5/employee  │   20/dept     │   Unlimited (plan)    │
│ Execution priority │     Low       │    Medium     │         High          │
└────────────────────┴───────────────┴───────────────┴───────────────────────┘
```

### Workflow Chain Prevention

To prevent cascade failures and infinite loops:

```typescript
// FORBIDDEN: Workflows cannot trigger other workflows
// A workflow step CANNOT:
// - Trigger another workflow
// - Call another workflow's webhook
// - Send messages that trigger other workflows

// ALLOWED: Direct plugin execution only
// - Call AI gateway
// - Call Telegram gateway  
// - Execute built-in plugins
// - Call external APIs (with timeout)

// WHY?
// 1. Prevents infinite loops
// 2. Prevents cascade failures
// 3. Keeps resource usage predictable
// 4. Easier to debug and monitor
```

### Cross-Department Data Sharing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   SAFE DATA SHARING PATTERNS                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Option A: Shared Database (Recommended)                                │
│  ─────────────────────────────────────────                              │
│  Department A workflow → writes to shared table                         │
│  Department B workflow → reads from shared table (triggered by cron)    │
│                                                                         │
│  Option B: Organization Gateway                                         │
│  ──────────────────────────────────                                     │
│  Department A → sends to org Telegram channel                           │
│  Department B → listens to org Telegram channel                         │
│                                                                         │
│  ❌ NOT ALLOWED:                                                        │
│  Department A workflow → calls Department B workflow directly           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Workflow Architecture

### Visual Representation

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW BUILDER UI                          │
│                                                                 │
│  ┌──────────────┐                                               │
│  │   TRIGGER    │  Telegram Message / Schedule / Webhook        │
│  │   (Entry)    │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │   STEP 1     │  │ Plugin: Extract Text                    │  │
│  │              │──│ Input: {{ trigger.message.text }}       │  │
│  │              │  │ Output: { text: "Hello" }               │  │
│  └──────┬───────┘  └─────────────────────────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │   STEP 2     │  │ Plugin: AI Process                      │  │
│  │   (AI)       │──│ Input: {{ steps[0].text }}              │  │
│  │              │  │ Output: { reply: "Hi there!" }          │  │
│  └──────┬───────┘  └─────────────────────────────────────────┘  │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐  ┌─────────────────────────────────────────┐  │
│  │   STEP 3     │  │ Plugin: Send Reply                      │  │
│  │   (Reply)    │──│ Input: {{ steps[1].reply }}             │  │
│  │              │  │ Action: telegram.sendMessage            │  │
│  └──────────────┘  └─────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Trigger    │────▶│   Executor   │────▶│   Step 1     │
│ (Telegram)   │     │              │     │  (Plugin)    │
└──────────────┘     │              │     └──────┬───────┘
                     │              │            │
                     │              │            ▼
                     │              │     ┌──────────────┐
                     │              │────▶│   Step 2     │
                     │              │     │  (Plugin)    │
                     │              │     └──────┬───────┘
                     │              │            │
                     │              │            ▼
                     │              │     ┌──────────────┐
                     │              │────▶│   Step 3     │
                     │              │     │  (Plugin)    │
                     └──────────────┘     └──────────────┘
```

---

## 📝 Detailed Tasks

---

### Task 10.1.1: Create Workflow Service

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Workflow models from Phase 3

#### Deliverables:
- [ ] src/modules/workflow/workflow.service.ts

#### Methods:
```typescript
import { ServiceContext } from '@/shared/types/context';

class WorkflowService {
  // ===== Workflow CRUD =====
  async createWorkflow(
    ctx: ServiceContext, 
    data: CreateWorkflowRequest
  ): Promise<WorkflowDefinition>
  
  async getWorkflow(
    ctx: ServiceContext, 
    workflowId: string
  ): Promise<WorkflowDefinition>
  
  async getUserWorkflows(
    ctx: ServiceContext,
    options?: { status?: WorkflowStatus }
  ): Promise<WorkflowListItem[]>
  
  async updateWorkflow(
    ctx: ServiceContext,
    workflowId: string,
    data: UpdateWorkflowRequest
  ): Promise<WorkflowDefinition>
  
  async deleteWorkflow(
    ctx: ServiceContext,
    workflowId: string
  ): Promise<void>
  
  // ===== Step Management =====
  async addStep(
    ctx: ServiceContext,
    workflowId: string,
    step: CreateWorkflowStepRequest
  ): Promise<WorkflowStepDefinition>
  
  async updateStep(
    ctx: ServiceContext,
    workflowId: string,
    stepId: string,
    data: UpdateWorkflowStepRequest
  ): Promise<WorkflowStepDefinition>
  
  async deleteStep(
    ctx: ServiceContext,
    workflowId: string,
    stepId: string
  ): Promise<void>
  
  async reorderSteps(
    ctx: ServiceContext,
    workflowId: string,
    stepIds: string[]
  ): Promise<void>
  
  // ===== Workflow Control =====
  async activateWorkflow(ctx: ServiceContext, workflowId: string): Promise<void>
  async pauseWorkflow(ctx: ServiceContext, workflowId: string): Promise<void>
  async archiveWorkflow(ctx: ServiceContext, workflowId: string): Promise<void>
  
  // ===== Validation =====
  async validateWorkflow(
    ctx: ServiceContext,
    workflowId: string
  ): Promise<ValidationResult>
  
  // ===== Internal =====
  private checkOwnership(ctx: ServiceContext, workflow: Workflow): void
  private validateStepConnections(steps: WorkflowStep[]): ValidationError[]
}
```

#### Done Criteria:
- [ ] Full CRUD for workflows
- [ ] Step management working
- [ ] Ownership checks
- [ ] Validation system

---

### Task 10.1.2: Create Workflow API Endpoints

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.1.1 complete

#### Deliverables:
- [ ] src/server/routes/workflow.ts

#### Endpoints:
```typescript
// ===== Workflow CRUD =====
GET    /api/workflows              - List user's workflows
POST   /api/workflows              - Create workflow
GET    /api/workflows/:id          - Get workflow details
PUT    /api/workflows/:id          - Update workflow
DELETE /api/workflows/:id          - Delete workflow

// ===== Workflow Control =====
POST   /api/workflows/:id/activate - Activate workflow
POST   /api/workflows/:id/pause    - Pause workflow
POST   /api/workflows/:id/archive  - Archive workflow
POST   /api/workflows/:id/validate - Validate workflow

// ===== Step Management =====
POST   /api/workflows/:id/steps    - Add step
PUT    /api/workflows/:id/steps/:stepId - Update step
DELETE /api/workflows/:id/steps/:stepId - Delete step
POST   /api/workflows/:id/steps/reorder - Reorder steps

// ===== Execution =====
POST   /api/workflows/:id/run      - Manual trigger
GET    /api/workflows/:id/runs     - Get run history
GET    /api/workflows/:id/runs/:runId - Get run details
POST   /api/workflows/:id/runs/:runId/replay - Replay run
```

#### Done Criteria:
- [ ] All endpoints implemented
- [ ] Auth middleware applied
- [ ] Validation working

---

### Task 10.1.3: Create Template Engine

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 10.1.2 complete

#### Deliverables:
- [ ] src/modules/workflow/template.engine.ts

#### Implementation:
```typescript
/**
 * Template syntax:
 * {{ trigger.message.text }}      - Access trigger data
 * {{ prev.output.text }}          - Previous step output
 * {{ steps[0].text }}             - Specific step output
 * {{ env.API_KEY }}               - Environment variable
 * {{ ctx.userId }}                - Execution context
 * 
 * Filters (optional):
 * {{ trigger.message.text | upper }}
 * {{ prev.count | default(0) }}
 */

class TemplateEngine {
  // Resolve all templates in an object
  resolve<T>(template: T, context: TemplateContext): T
  
  // Resolve a single string template
  resolveString(template: string, context: TemplateContext): string
  
  // Extract variable references from template
  extractVariables(template: string): VariableReference[]
  
  // Validate template syntax
  validate(template: string): ValidationResult
  
  // Get available variables for autocomplete
  getAvailableVariables(context: PartialTemplateContext): VariableSuggestion[]
}

interface VariableReference {
  path: string;           // "trigger.message.text"
  fullMatch: string;      // "{{ trigger.message.text }}"
  filters?: string[];     // ["upper", "trim"]
}

interface VariableSuggestion {
  path: string;
  type: string;
  description: string;
  example?: unknown;
}
```

#### Template Resolution Example:
```typescript
const context: TemplateContext = {
  trigger: {
    type: "TELEGRAM_MESSAGE",
    data: { message: { text: "Hello", from: { id: 123 } } }
  },
  prev: { sentiment: "positive", reply: "Hi there!" },
  steps: {
    0: { text: "Hello" },
    1: { sentiment: "positive", reply: "Hi there!" }
  },
  env: { OPENAI_KEY: "sk-..." },
  ctx: { userId: "user123", workflowId: "wf123", runId: "run123" }
};

const input = {
  text: "{{ trigger.data.message.text }}",
  replyTo: "{{ trigger.data.message.from.id }}",
  aiReply: "{{ prev.reply }}"
};

const resolved = templateEngine.resolve(input, context);
// { text: "Hello", replyTo: 123, aiReply: "Hi there!" }
```

#### Done Criteria:
- [ ] Template parsing working
- [ ] Variable resolution working
- [ ] Nested path access working
- [ ] Filter support (optional)
- [ ] Validation and error messages

---

### Task 10.1.4: Implement Workflow Scopes

**Session Type:** Backend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 10.1.1 complete, Phase 4 (Organizations) complete

#### Deliverables:
- [ ] Update src/modules/workflow/workflow.service.ts with scope support
- [ ] src/modules/workflow/scope.service.ts

#### Implementation:
```typescript
// Workflow scope enum
enum WorkflowScope {
  USER           // Personal workspace OR employee personal in org
  DEPARTMENT     // Shared within department (org only)
  ORGANIZATION   // Company-wide automation (org only)
}

// Scope-aware queries
class WorkflowScopeService {
  /**
   * Get workflows visible to user based on their context
   */
  async getAccessibleWorkflows(ctx: ServiceContext): Promise<Workflow[]> {
    const { userId, organizationId, departmentId, orgRole } = ctx;
    
    // ============================================
    // PERSONAL WORKSPACE (No Organization)
    // ============================================
    if (!organizationId) {
      // User only sees their own workflows
      return prisma.workflow.findMany({
        where: { 
          userId, 
          organizationId: null,
          scope: 'USER'  // Only USER scope allowed
        }
      });
    }
    
    // ============================================
    // ORGANIZATION WORKSPACE
    // ============================================
    const conditions: Prisma.WorkflowWhereInput[] = [];
    
    // Everyone can see organization-level workflows
    conditions.push({
      organizationId,
      scope: 'ORGANIZATION'
    });
    
    // Department members can see their department workflows
    if (departmentId) {
      conditions.push({
        departmentId,
        scope: 'DEPARTMENT'
      });
    }
    
    // Managers can see employee personal workflows in their dept
    if (orgRole === 'MANAGER' && departmentId) {
      const deptMembers = await prisma.departmentMember.findMany({
        where: { departmentId },
        select: { userId: true }
      });
      conditions.push({
        userId: { in: deptMembers.map(m => m.userId) },
        scope: 'USER'
      });
    }
    
    // Owners can see all workflows in org
    if (orgRole === 'OWNER') {
      conditions.push({
        organizationId,
        scope: 'USER'
      });
    }
    
    // Everyone can see their own personal workflows
    conditions.push({
      userId,
      scope: 'USER'
    });
    
    return prisma.workflow.findMany({
      where: { OR: conditions }
    });
  }
  
  /**
   * Check if user can create workflow with given scope
   */
  async canCreateWithScope(
    ctx: ServiceContext, 
    scope: WorkflowScope,
    departmentId?: string
  ): Promise<boolean> {
    // Personal workspace - only USER scope allowed
    if (!ctx.organizationId) {
      return scope === 'USER';
    }
    
    // Organization context
    switch (scope) {
      case 'ORGANIZATION':
        return ctx.orgRole === 'OWNER';
      case 'DEPARTMENT':
        return ['OWNER', 'MANAGER'].includes(ctx.orgRole!);
      case 'USER':
        return true; // Any member can create personal workflows
    }
  }
  
  /**
   * Check if user can edit workflow
   */
  async canEditWorkflow(
    ctx: ServiceContext,
    workflow: Workflow
  ): Promise<boolean> {
    // Personal workspace - user owns all their workflows
    if (!ctx.organizationId && !workflow.organizationId) {
      return workflow.userId === ctx.userId;
    }
    
    // Creator can always edit their own
    if (workflow.userId === ctx.userId) return true;
    
    // Owner can edit all org workflows
    if (ctx.orgRole === 'OWNER' && workflow.organizationId === ctx.organizationId) {
      return true;
    }
    
    // Manager can edit department workflows
    if (ctx.orgRole === 'MANAGER' && workflow.departmentId === ctx.departmentId) {
      return workflow.scope !== 'ORGANIZATION';
    }
    
    return false;
  }
}
```

#### Done Criteria:
- [ ] WorkflowScope enum added to schema
- [ ] Scope-based query filtering
- [ ] canCreateWithScope validation
- [ ] canEditWorkflow validation
- [ ] Integration with WorkflowService

---

### Task 10.1.5: Create Scope-Based Access Control

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.1.4 complete

#### Deliverables:
- [ ] Update workflow API endpoints with scope checks
- [ ] Add middleware for scope validation

#### Implementation:
```typescript
// Middleware for scope-based access
async function requireWorkflowAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ctx = getServiceContext(req);
  const workflowId = req.params.workflowId || req.params.id;
  
  if (!workflowId) {
    return next();
  }
  
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId }
  });
  
  if (!workflow) {
    throw new NotFoundError('Workflow not found');
  }
  
  const canAccess = await scopeService.canAccessWorkflow(ctx, workflow);
  if (!canAccess) {
    throw new ForbiddenError('No access to this workflow');
  }
  
  req.workflow = workflow;
  next();
}

// Apply to routes
router.get('/workflows/:id', requireWorkflowAccess, getWorkflow);
router.put('/workflows/:id', requireWorkflowAccess, requireEditAccess, updateWorkflow);
router.post('/workflows/:id/run', requireWorkflowAccess, requireRunAccess, runWorkflow);
```

#### Access Matrix:
```typescript
const ACCESS_MATRIX = {
  // [scope][action] = required roles
  ORGANIZATION: {
    view: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'],
    run: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'],
    edit: ['OWNER'],
    delete: ['OWNER'],
  },
  DEPARTMENT: {
    view: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'], // Same dept only for MEMBER
    run: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'],   // Same dept only
    edit: ['OWNER', 'MANAGER'],  // Manager of same dept
    delete: ['OWNER', 'MANAGER'],
  },
  PERSONAL: {
    view: ['OWNER', 'MANAGER', 'MEMBER'],  // MEMBER = self only
    run: ['MEMBER'],  // Self only
    edit: ['MEMBER'], // Self only
    delete: ['MEMBER'],
  },
};
```

#### Done Criteria:
- [ ] Access middleware working
- [ ] View access by scope
- [ ] Run access by scope
- [ ] Edit access by scope
- [ ] Delete access by scope

---

### Task 10.1.6: Create Scope Selection UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.1.5 complete

#### Deliverables:
- [ ] src/components/workflow/scope-selector.tsx
- [ ] Update create workflow modal

#### Implementation:
```tsx
interface ScopeSelectorProps {
  value: WorkflowScope;
  onChange: (scope: WorkflowScope, deptId?: string) => void;
  canCreateOrg: boolean;    // Owner only
  canCreateDept: boolean;   // Owner or Manager
  departments: Department[]; // Available departments
}

export function ScopeSelector({ 
  value, 
  onChange, 
  canCreateOrg,
  canCreateDept,
  departments 
}: ScopeSelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Workflow Scope</Label>
      
      <RadioGroup value={value} onValueChange={onChange}>
        {/* USER scope - always available */}
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="USER" id="user" />
          <Label htmlFor="user" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal
            <span className="text-muted-foreground text-sm">
              Only you can use this workflow
            </span>
          </Label>
        </div>
        
        {/* Department - Owner or Manager (org context only) */}
        {canCreateDept && (
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="DEPARTMENT" id="department" />
            <Label htmlFor="department" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Department
              <span className="text-muted-foreground text-sm">
                All department members can use
              </span>
            </Label>
          </div>
        )}
        
        {/* Organization - Owner only (org context only) */}
        {canCreateOrg && (
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="ORGANIZATION" id="organization" />
            <Label htmlFor="organization" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organization
              <span className="text-muted-foreground text-sm">
                Everyone in the organization can use
              </span>
            </Label>
          </div>
        )}
      </RadioGroup>
      
      {/* Department selector (if DEPARTMENT scope) */}
      {value === 'DEPARTMENT' && (
        <Select onValueChange={(deptId) => onChange('DEPARTMENT', deptId)}>
          <SelectTrigger>
            <SelectValue placeholder="Select department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map(dept => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// Usage in Create Workflow Modal
function CreateWorkflowModal() {
  const { context } = useAuth();
  const isOrgContext = context.type === 'organization';
  
  // Personal workspace: only USER scope available
  // Org context: all scopes based on role
  const canCreateOrg = isOrgContext && context.orgRole === 'OWNER';
  const canCreateDept = isOrgContext && ['OWNER', 'MANAGER'].includes(context.orgRole!);
  
  return (
    <Dialog>
      <DialogContent>
        {/* Personal workspace - no scope selector needed */}
        {!isOrgContext && (
          <p className="text-muted-foreground">
            This workflow will be private to you.
          </p>
        )}
        
        {/* Organization context - show scope selector */}
        {isOrgContext && (
          <ScopeSelector
            value={scope}
            onChange={setScope}
            canCreateOrg={canCreateOrg}
            canCreateDept={canCreateDept}
            departments={departments}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

#### Done Criteria:
- [ ] Personal workspace: no scope selector (auto USER)
- [ ] Organization context: scope selector visible
- [ ] Department selector (when applicable)
- [ ] Permission-based option visibility
- [ ] Clear descriptions for each scope

---

### Task 10.2.1: Create Workflow Executor

**Session Type:** Backend
**Estimated Time:** 45 minutes
**Prerequisites:** Task 10.1.3 complete

#### Deliverables:
- [ ] src/modules/workflow/workflow.executor.ts

#### Implementation:
```typescript
class WorkflowExecutor {
  constructor(
    private templateEngine: TemplateEngine,
    private pluginExecutor: PluginExecutor
  ) {}
  
  /**
   * Execute a workflow from trigger to completion
   */
  async execute(
    workflow: Workflow,
    trigger: WorkflowTrigger
  ): Promise<WorkflowRunResult> {
    // 1. Create run record
    const run = await this.createRun(workflow, trigger);
    
    // 2. Build initial context
    const context = this.buildContext(workflow, trigger, run);
    
    try {
      // 3. Execute each step in order
      for (const step of workflow.steps) {
        const stepResult = await this.executeStep(step, context);
        
        // Update context with step output
        context.steps[step.order] = stepResult.output;
        context.prev = stepResult.output;
        
        // Check for failure
        if (!stepResult.success) {
          if (step.onError === 'stop') {
            throw new StepExecutionError(step, stepResult.error);
          }
          // 'continue' - move to next step
          // 'retry' - handled in executeStep
        }
      }
      
      // 4. Mark run as completed
      await this.completeRun(run.id, context);
      
      return { success: true, runId: run.id, output: context.prev };
      
    } catch (error) {
      await this.failRun(run.id, error);
      return { success: false, runId: run.id, error: error.message };
    }
  }
  
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepResult> {
    // 1. Check condition
    if (step.condition) {
      const shouldRun = this.evaluateCondition(step.condition, context);
      if (!shouldRun) {
        return { success: true, skipped: true };
      }
    }
    
    // 2. Resolve input mapping
    const input = this.templateEngine.resolve(step.inputMapping, context);
    
    // 3. Execute plugin
    const result = await this.pluginExecutor.execute(
      step.pluginId,
      input,
      step.config,
      step.gatewayId || context.workflowGatewayId
    );
    
    // 4. Record step run
    await this.recordStepRun(context.runId, step.order, input, result);
    
    return result;
  }
}
```

#### Done Criteria:
- [ ] Sequential step execution
- [ ] Context propagation
- [ ] Error handling per step
- [ ] Run history recording

---

### Task 10.2.2: Create Trigger Handlers

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 10.2.1 complete

#### Deliverables:
- [ ] src/modules/workflow/triggers/index.ts
- [ ] src/modules/workflow/triggers/telegram.trigger.ts
- [ ] src/modules/workflow/triggers/schedule.trigger.ts
- [ ] src/modules/workflow/triggers/webhook.trigger.ts

#### Implementation:
```typescript
// Base trigger interface
interface TriggerHandler {
  type: WorkflowTriggerType;
  
  // Register workflow with trigger system
  register(workflow: Workflow): Promise<void>;
  
  // Unregister workflow
  unregister(workflowId: string): Promise<void>;
  
  // Check if incoming event matches workflow trigger config
  matches(workflow: Workflow, event: unknown): boolean;
  
  // Build trigger data from event
  buildTriggerData(workflow: Workflow, event: unknown): WorkflowTrigger;
}

// Telegram trigger
class TelegramTriggerHandler implements TriggerHandler {
  type = WorkflowTriggerType.TELEGRAM_MESSAGE;
  
  matches(workflow: Workflow, event: TelegramUpdate): boolean {
    const config = workflow.triggerConfig as TelegramMessageTriggerConfig;
    
    // Check filter type
    if (config.filterType === 'command') {
      return event.message?.text?.startsWith(config.commandPrefix || '/');
    }
    if (config.filterType === 'text') {
      return !!event.message?.text;
    }
    // etc...
    
    return true; // 'all'
  }
}

// Schedule trigger (cron-based)
class ScheduleTriggerHandler implements TriggerHandler {
  private scheduler: CronScheduler;
  
  async register(workflow: Workflow): Promise<void> {
    const config = workflow.triggerConfig as ScheduleTriggerConfig;
    this.scheduler.add(workflow.id, config.cron, () => {
      workflowExecutor.execute(workflow, {
        type: 'SCHEDULE',
        data: { scheduledAt: new Date() }
      });
    });
  }
}
```

#### Done Criteria:
- [ ] Telegram trigger matching
- [ ] Schedule trigger with cron
- [ ] Webhook trigger with validation
- [ ] Manual trigger support

---

### Task 10.2.3: Create Step Executor

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.2.2 complete

#### Deliverables:
- [ ] src/modules/workflow/step.executor.ts

#### Implementation:
```typescript
class StepExecutor {
  constructor(private pluginExecutor: PluginExecutor) {}
  
  async execute(
    step: WorkflowStep,
    input: Record<string, unknown>,
    gatewayId?: string
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Get plugin handler
      const plugin = await pluginService.getPluginById(step.pluginId);
      
      // Merge step config with resolved input
      const fullInput = {
        ...step.config,
        ...input
      };
      
      // Execute plugin
      const result = await this.pluginExecutor.execute(
        plugin.slug,
        fullInput,
        { gatewayId }
      );
      
      return {
        success: true,
        output: result.output,
        durationMs: Date.now() - startTime,
        metrics: result.metrics
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime
      };
    }
  }
}
```

#### Done Criteria:
- [ ] Plugin execution working
- [ ] Input/config merging
- [ ] Metrics collection
- [ ] Error capture

---

### Task 10.2.4: Create Error Handler

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 10.2.3 complete

#### Deliverables:
- [ ] src/modules/workflow/error.handler.ts

#### Implementation:
```typescript
class WorkflowErrorHandler {
  async handleStepError(
    step: WorkflowStep,
    error: Error,
    context: WorkflowExecutionContext
  ): Promise<ErrorHandlingResult> {
    switch (step.onError) {
      case 'stop':
        return { action: 'stop', error };
        
      case 'continue':
        await this.logError(context.runId, step.order, error);
        return { action: 'continue' };
        
      case 'retry':
        return this.handleRetry(step, error, context);
        
      default:
        return { action: 'stop', error };
    }
  }
  
  private async handleRetry(
    step: WorkflowStep,
    error: Error,
    context: WorkflowExecutionContext
  ): Promise<ErrorHandlingResult> {
    const retryCount = context.retries[step.order] || 0;
    
    if (retryCount < step.maxRetries) {
      context.retries[step.order] = retryCount + 1;
      await this.delay(this.getBackoffMs(retryCount));
      return { action: 'retry' };
    }
    
    return { action: 'stop', error };
  }
  
  private getBackoffMs(retryCount: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s...
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }
}
```

#### Done Criteria:
- [ ] Stop handling
- [ ] Continue handling
- [ ] Retry with backoff
- [ ] Error logging

---

### Task 10.2.5: Implement Workflow Resource Limits

**Session Type:** Backend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 10.2.1 complete

#### Deliverables:
- [ ] src/modules/workflow/resource-limiter.ts

#### Resource Limits by Scope:
```typescript
const SCOPE_LIMITS: Record<WorkflowScope, ResourceLimits> = {
  PERSONAL: {
    timeoutMs: 15_000,       // 15 seconds max
    memoryMB: 64,            // 64 MB
    maxSteps: 5,             // 5 steps max
    maxParallel: 1,          // No parallel execution
    priority: 'LOW',
  },
  DEPARTMENT: {
    timeoutMs: 30_000,       // 30 seconds max
    memoryMB: 128,           // 128 MB
    maxSteps: 15,            // 15 steps max
    maxParallel: 3,          // 3 parallel runs
    priority: 'MEDIUM',
  },
  ORGANIZATION: {
    timeoutMs: 60_000,       // 60 seconds max
    memoryMB: 256,           // 256 MB
    maxSteps: 30,            // 30 steps max
    maxParallel: 10,         // 10 parallel runs
    priority: 'HIGH',
  },
};
```

#### Implementation:
```typescript
class WorkflowResourceLimiter {
  /**
   * Get resource limits for workflow
   */
  getLimits(workflow: Workflow): ResourceLimits {
    const baseLimits = SCOPE_LIMITS[workflow.scope];
    
    // Organization can override via settings
    if (workflow.organizationId) {
      const orgLimits = await this.getOrgLimits(workflow.organizationId);
      return { ...baseLimits, ...orgLimits };
    }
    
    return baseLimits;
  }
  
  /**
   * Enforce timeout during execution
   */
  async executeWithTimeout<T>(
    workflow: Workflow,
    fn: () => Promise<T>
  ): Promise<T> {
    const limits = this.getLimits(workflow);
    
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => 
        setTimeout(
          () => reject(new WorkflowTimeoutError(limits.timeoutMs)),
          limits.timeoutMs
        )
      )
    ]);
  }
  
  /**
   * Check if workflow can start (parallel limit)
   */
  async canStartExecution(workflow: Workflow): Promise<boolean> {
    const limits = this.getLimits(workflow);
    
    const runningCount = await prisma.workflowRun.count({
      where: {
        workflowId: workflow.id,
        status: 'RUNNING'
      }
    });
    
    return runningCount < limits.maxParallel;
  }
  
  /**
   * Validate workflow doesn't exceed step limit
   */
  validateStepCount(workflow: Workflow): void {
    const limits = this.getLimits(workflow);
    
    if (workflow.steps.length > limits.maxSteps) {
      throw new ValidationError(
        `Workflow exceeds maximum steps (${limits.maxSteps}) for ${workflow.scope} scope`
      );
    }
  }
}

class WorkflowTimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Workflow execution timed out after ${timeoutMs}ms`);
  }
}
```

#### Done Criteria:
- [ ] Timeout enforcement working
- [ ] Memory limits checked
- [ ] Step count validation
- [ ] Parallel execution limits
- [ ] Priority queue integration

---

### Task 10.2.6: Implement Rate Limiting

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.2.5 complete

#### Deliverables:
- [ ] src/modules/workflow/rate-limiter.ts

#### Implementation:
```typescript
interface RateLimitConfig {
  // Runs per time window
  maxRuns: number;
  windowMs: number;
}

const RATE_LIMITS: Record<WorkflowScope, RateLimitConfig> = {
  PERSONAL: {
    maxRuns: 100,        // 100 runs per hour
    windowMs: 60 * 60 * 1000,
  },
  DEPARTMENT: {
    maxRuns: 500,        // 500 runs per hour
    windowMs: 60 * 60 * 1000,
  },
  ORGANIZATION: {
    maxRuns: 2000,       // 2000 runs per hour
    windowMs: 60 * 60 * 1000,
  },
};

class WorkflowRateLimiter {
  private redis: Redis;
  
  /**
   * Check and increment rate limit
   */
  async checkAndIncrement(workflow: Workflow): Promise<void> {
    const key = this.getRateLimitKey(workflow);
    const config = RATE_LIMITS[workflow.scope];
    
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      // First request in window, set expiry
      await this.redis.pexpire(key, config.windowMs);
    }
    
    if (current > config.maxRuns) {
      throw new RateLimitExceededError(
        workflow.scope,
        config.maxRuns,
        config.windowMs
      );
    }
  }
  
  /**
   * Get rate limit key based on scope
   */
  private getRateLimitKey(workflow: Workflow): string {
    switch (workflow.scope) {
      case 'PERSONAL':
        return `ratelimit:workflow:user:${workflow.userId}`;
      case 'DEPARTMENT':
        return `ratelimit:workflow:dept:${workflow.departmentId}`;
      case 'ORGANIZATION':
        return `ratelimit:workflow:org:${workflow.organizationId}`;
    }
  }
  
  /**
   * Get remaining quota
   */
  async getRemaining(workflow: Workflow): Promise<RateLimitStatus> {
    const key = this.getRateLimitKey(workflow);
    const config = RATE_LIMITS[workflow.scope];
    
    const current = parseInt(await this.redis.get(key) || '0');
    const ttl = await this.redis.pttl(key);
    
    return {
      remaining: Math.max(0, config.maxRuns - current),
      limit: config.maxRuns,
      resetsInMs: ttl > 0 ? ttl : config.windowMs,
    };
  }
}

class RateLimitExceededError extends Error {
  constructor(
    public scope: WorkflowScope,
    public limit: number,
    public windowMs: number
  ) {
    super(`Rate limit exceeded for ${scope} workflows: ${limit} per ${windowMs / 1000}s`);
  }
}
```

#### Done Criteria:
- [ ] Per-user rate limiting (personal)
- [ ] Per-department rate limiting
- [ ] Per-organization rate limiting
- [ ] Redis-based tracking
- [ ] Rate limit headers in response

---

### Task 10.2.7: Add Quota Checks to Workflow Creation

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Phase 4 (Resource Quotas), Task 10.2.6 complete

#### Deliverables:
- [ ] Update workflow.service.ts with quota integration

#### Implementation:
```typescript
// In workflow.service.ts

async createWorkflow(ctx: ServiceContext, data: CreateWorkflowInput): Promise<Workflow> {
  // 1. Validate scope permissions
  const canCreate = await scopeService.canCreateWithScope(ctx, data.scope, data.departmentId);
  if (!canCreate) {
    throw new ForbiddenError(`Cannot create ${data.scope} workflows`);
  }
  
  // 2. Check quota based on scope
  await this.checkWorkflowQuota(ctx, data.scope, data.departmentId);
  
  // 3. Validate step count against scope limits
  resourceLimiter.validateStepCount({
    scope: data.scope,
    steps: data.steps || []
  });
  
  // 4. Create workflow
  const workflow = await prisma.workflow.create({ ... });
  
  // 5. Increment usage counter
  await quotaService.incrementUsage(ctx, ResourceType.WORKFLOW);
  
  return workflow;
}

private async checkWorkflowQuota(
  ctx: ServiceContext,
  scope: WorkflowScope,
  departmentId?: string
): Promise<void> {
  switch (scope) {
    case 'PERSONAL':
      // Check employee personal workflow quota
      const personalCount = await prisma.workflow.count({
        where: { userId: ctx.userId, scope: 'PERSONAL' }
      });
      const personalLimit = await quotaService.getEmployeeLimit(ctx.userId, 'workflows');
      if (personalCount >= personalLimit) {
        throw new QuotaExceededError(
          ResourceType.WORKFLOW,
          personalCount,
          personalLimit
        );
      }
      break;
      
    case 'DEPARTMENT':
      // Check department workflow quota
      const deptCount = await prisma.workflow.count({
        where: { departmentId, scope: 'DEPARTMENT' }
      });
      const deptLimit = await quotaService.getDepartmentLimit(departmentId!, 'workflows');
      if (deptCount >= deptLimit) {
        throw new QuotaExceededError(ResourceType.WORKFLOW, deptCount, deptLimit);
      }
      break;
      
    case 'ORGANIZATION':
      // Check organization workflow quota (usually unlimited or very high)
      await quotaService.checkQuota(ctx, ResourceType.WORKFLOW);
      break;
  }
}
```

#### Done Criteria:
- [ ] Personal workflow quota checked
- [ ] Department workflow quota checked
- [ ] Organization workflow quota checked
- [ ] Step limit validation
- [ ] Clear error messages

---

### Task 10.3.1: Implement Telegram Triggers

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.2.4 complete

#### Deliverables:
- [ ] Update webhook handler to route to workflows
- [ ] Telegram message trigger
- [ ] Telegram callback trigger

#### Implementation:
```typescript
// In webhook.routes.ts
router.post('/webhooks/telegram/:gatewayId', async (req, res) => {
  const update = req.body;
  const gatewayId = req.params.gatewayId;
  
  // Get gateway to find owner context
  const gateway = await gatewayService.getGatewayById(gatewayId);
  const ctx = createServiceContext({ userId: gateway.userId, ... });
  
  // Route to plugins (existing)
  await pluginEventRouter.routeTelegramMessage(ctx, gatewayId, update);
  
  // Route to workflows (NEW)
  await workflowTriggerRouter.handleTelegramUpdate(ctx, gatewayId, update);
  
  res.sendStatus(200);
});

// workflowTriggerRouter.ts
class WorkflowTriggerRouter {
  async handleTelegramUpdate(
    ctx: ServiceContext,
    gatewayId: string,
    update: TelegramUpdate
  ): Promise<void> {
    // Find workflows for this gateway
    const workflows = await workflowService.getActiveWorkflowsForGateway(
      ctx,
      gatewayId,
      ['TELEGRAM_MESSAGE', 'TELEGRAM_CALLBACK']
    );
    
    for (const workflow of workflows) {
      if (this.telegramTrigger.matches(workflow, update)) {
        const trigger = this.telegramTrigger.buildTriggerData(workflow, update);
        await this.executor.execute(workflow, trigger);
      }
    }
  }
}
```

#### Done Criteria:
- [ ] Message trigger working
- [ ] Callback trigger working
- [ ] Filter matching working
- [ ] Command prefix support

---

### Task 10.3.2: Implement Schedule Triggers

**Session Type:** Backend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.3.1 complete

#### Deliverables:
- [ ] src/modules/workflow/triggers/schedule.trigger.ts
- [ ] Cron scheduler setup

#### Implementation:
```typescript
import cron from 'node-cron';

class ScheduleTriggerManager {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  
  async initialize(): Promise<void> {
    // Load all active scheduled workflows
    const workflows = await prisma.workflow.findMany({
      where: {
        status: 'ACTIVE',
        isEnabled: true,
        triggerType: 'SCHEDULE'
      }
    });
    
    for (const workflow of workflows) {
      await this.register(workflow);
    }
  }
  
  async register(workflow: Workflow): Promise<void> {
    const config = workflow.triggerConfig as ScheduleTriggerConfig;
    
    // Validate cron expression
    if (!cron.validate(config.cron)) {
      throw new ValidationError('Invalid cron expression');
    }
    
    // Create job
    const job = cron.schedule(config.cron, async () => {
      const ctx = createServiceContext({ userId: workflow.userId, ... });
      
      await workflowExecutor.execute(workflow, {
        type: 'SCHEDULE',
        data: { scheduledAt: new Date(), cron: config.cron }
      });
    }, {
      timezone: config.timezone || 'UTC'
    });
    
    this.jobs.set(workflow.id, job);
  }
  
  async unregister(workflowId: string): Promise<void> {
    const job = this.jobs.get(workflowId);
    if (job) {
      job.stop();
      this.jobs.delete(workflowId);
    }
  }
}
```

#### Done Criteria:
- [ ] Cron scheduling working
- [ ] Timezone support
- [ ] Job persistence across restarts
- [ ] Register/unregister working

---

### Task 10.3.3: Implement Webhook Triggers

**Session Type:** Backend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 10.3.2 complete

#### Deliverables:
- [ ] src/server/routes/workflow-webhook.ts

#### Implementation:
```typescript
// Dedicated webhook endpoint for workflows
// POST /api/workflows/:id/webhook

router.post('/workflows/:id/webhook', async (req, res) => {
  const workflowId = req.params.id;
  
  // Get workflow
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId }
  });
  
  if (!workflow || workflow.triggerType !== 'WEBHOOK') {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  
  if (!workflow.isEnabled || workflow.status !== 'ACTIVE') {
    return res.status(400).json({ error: 'Workflow is not active' });
  }
  
  // Validate secret if configured
  const config = workflow.triggerConfig as WebhookTriggerConfig;
  if (config.secret) {
    const providedSecret = req.headers['x-webhook-secret'];
    if (providedSecret !== config.secret) {
      return res.status(401).json({ error: 'Invalid secret' });
    }
  }
  
  // Check allowed methods
  if (config.methods && !config.methods.includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Execute workflow
  const result = await workflowExecutor.execute(workflow, {
    type: 'WEBHOOK',
    data: {
      method: req.method,
      headers: req.headers,
      body: req.body,
      query: req.query
    }
  });
  
  res.json({ success: true, runId: result.runId });
});
```

#### Done Criteria:
- [ ] Webhook endpoint working
- [ ] Secret validation
- [ ] Method filtering
- [ ] Async execution

---

### Task 10.3.4: Implement Manual Triggers

**Session Type:** Backend
**Estimated Time:** 15 minutes
**Prerequisites:** Task 10.3.3 complete

#### Implementation:
```typescript
// POST /api/workflows/:id/run

router.post('/workflows/:id/run', requireAuth, async (req, res) => {
  const ctx = getServiceContext(req);
  const workflowId = req.params.id;
  
  // Get workflow (with ownership check)
  const workflow = await workflowService.getWorkflow(ctx, workflowId);
  
  // Execute with manual trigger
  const result = await workflowExecutor.execute(workflow, {
    type: 'MANUAL',
    data: {
      triggeredBy: ctx.userId,
      input: req.body.input || {}
    }
  });
  
  res.json({ success: true, runId: result.runId });
});
```

#### Done Criteria:
- [ ] Manual trigger working
- [ ] Custom input support
- [ ] Auth required

---

### Task 10.4.1: Create Workflow List Page

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.1.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/workflows/page.tsx

#### Features:
```
- List all workflows
- Status badges (Draft, Active, Paused)
- Enable/disable toggle
- Quick actions (Edit, Run, Delete)
- Empty state with CTA
```

#### Done Criteria:
- [ ] List view working
- [ ] Status filtering
- [ ] Quick actions
- [ ] Create button

---

### Task 10.4.2: Create Visual Workflow Builder

**Session Type:** Frontend
**Estimated Time:** 60 minutes
**Prerequisites:** Task 10.4.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/workflows/[id]/edit/page.tsx
- [ ] src/components/workflow/workflow-canvas.tsx
- [ ] src/components/workflow/workflow-node.tsx
- [ ] src/components/workflow/workflow-connection.tsx

#### Tech Options:
```
Option A: React Flow (recommended)
  - Full-featured flow diagram library
  - Drag and drop nodes
  - Custom node types
  - npm install reactflow

Option B: Custom canvas
  - More control but more work
  - SVG-based connections
```

#### Implementation:
```tsx
import ReactFlow, { 
  Node, 
  Edge, 
  Background, 
  Controls,
  MiniMap 
} from 'reactflow';

// Custom node types
const nodeTypes = {
  trigger: TriggerNode,
  step: StepNode,
};

export function WorkflowCanvas({ workflow, onUpdate }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  
  // Convert workflow to nodes/edges
  useEffect(() => {
    const triggerNode = {
      id: 'trigger',
      type: 'trigger',
      position: { x: 250, y: 0 },
      data: { triggerType: workflow.triggerType, config: workflow.triggerConfig }
    };
    
    const stepNodes = workflow.steps.map((step, i) => ({
      id: `step-${step.order}`,
      type: 'step',
      position: { x: 250, y: 150 + i * 150 },
      data: { step }
    }));
    
    setNodes([triggerNode, ...stepNodes]);
    
    // Create edges
    const stepEdges = stepNodes.map((node, i) => ({
      id: `e-${i}`,
      source: i === 0 ? 'trigger' : `step-${i - 1}`,
      target: node.id
    }));
    
    setEdges(stepEdges);
  }, [workflow]);
  
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={...}
      onEdgesChange={...}
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
```

#### Done Criteria:
- [ ] Canvas rendering
- [ ] Trigger node
- [ ] Step nodes
- [ ] Connections visible
- [ ] Add step button

---

### Task 10.4.3: Create Step Configuration Panel

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 10.4.2 complete

#### Deliverables:
- [ ] src/components/workflow/step-config-panel.tsx

#### Features:
```
- Plugin selector dropdown
- Plugin configuration form
- Input mapping editor
- Condition builder
- Error handling options
```

#### Done Criteria:
- [ ] Plugin selection
- [ ] Config form (from configSchema)
- [ ] Input mapping UI
- [ ] Save/cancel buttons

---

### Task 10.4.4: Create Input Mapping UI

**Session Type:** Frontend
**Estimated Time:** 40 minutes
**Prerequisites:** Task 10.4.3 complete

#### Deliverables:
- [ ] src/components/workflow/input-mapper.tsx
- [ ] src/components/workflow/variable-picker.tsx

#### Features:
```
- Visual field mapping
- Variable autocomplete
- Drag from available variables
- Preview resolved values
```

#### Implementation:
```tsx
export function InputMapper({ step, context, onChange }) {
  const availableVars = templateEngine.getAvailableVariables(context);
  
  return (
    <div className="space-y-4">
      {Object.entries(step.plugin.inputSchema.properties).map(([field, schema]) => (
        <div key={field} className="flex items-center gap-4">
          <Label className="w-32">{schema.title || field}</Label>
          <div className="flex-1 relative">
            <Input
              value={step.inputMapping[field] || ''}
              onChange={(e) => onChange({ ...step.inputMapping, [field]: e.target.value })}
              placeholder={`{{ trigger.data... }}`}
            />
            <VariablePicker
              variables={availableVars}
              onSelect={(path) => onChange({ 
                ...step.inputMapping, 
                [field]: `{{ ${path} }}` 
              })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### Done Criteria:
- [ ] Field mapping UI
- [ ] Variable picker dropdown
- [ ] Template syntax help
- [ ] Validation feedback

---

### Task 10.4.5: Create Workflow Test/Run UI

**Session Type:** Frontend
**Estimated Time:** 30 minutes
**Prerequisites:** Task 10.4.4 complete

#### Deliverables:
- [ ] src/components/workflow/workflow-test-panel.tsx

#### Features:
```
- Test trigger input
- Run workflow button
- Live execution display
- Step-by-step progress
- Output preview
```

#### Done Criteria:
- [ ] Test input form
- [ ] Run button
- [ ] Live progress
- [ ] Result display

---

### Task 10.5.1: Create Run History Page

**Session Type:** Frontend
**Estimated Time:** 25 minutes
**Prerequisites:** Task 10.1.2 complete

#### Deliverables:
- [ ] src/app/(dashboard)/workflows/[id]/runs/page.tsx

#### Features:
```
- List all runs
- Status badges (Running, Completed, Failed)
- Duration and timestamp
- Filter by status
- Click to view details
```

#### Done Criteria:
- [ ] Run list working
- [ ] Status badges
- [ ] Pagination
- [ ] Filter/search

---

### Task 10.5.2: Create Run Detail View

**Session Type:** Frontend
**Estimated Time:** 35 minutes
**Prerequisites:** Task 10.5.1 complete

#### Deliverables:
- [ ] src/app/(dashboard)/workflows/[id]/runs/[runId]/page.tsx

#### Features:
```
- Run summary (trigger, duration, status)
- Step-by-step timeline
- Each step shows:
  - Input (resolved)
  - Output
  - Duration
  - Error (if any)
- Expand/collapse step details
```

#### Done Criteria:
- [ ] Run summary
- [ ] Step timeline
- [ ] Input/output display
- [ ] Error highlighting

---

### Task 10.5.3: Create Run Replay

**Session Type:** Frontend/Backend
**Estimated Time:** 20 minutes
**Prerequisites:** Task 10.5.2 complete

#### Implementation:
```typescript
// Backend
router.post('/workflows/:id/runs/:runId/replay', requireAuth, async (req, res) => {
  const ctx = getServiceContext(req);
  const { runId } = req.params;
  
  // Get original run
  const originalRun = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { workflow: true }
  });
  
  // Re-execute with same trigger data
  const result = await workflowExecutor.execute(originalRun.workflow, {
    type: originalRun.triggeredBy as WorkflowTriggerType,
    data: originalRun.triggerData,
    isReplay: true,
    originalRunId: runId
  });
  
  res.json({ success: true, runId: result.runId });
});
```

#### Done Criteria:
- [ ] Replay button
- [ ] Uses original trigger data
- [ ] Links to original run

---

## ✅ Phase 10 Completion Checklist

### Workflow Service
- [ ] CRUD operations
- [ ] Step management
- [ ] Template engine
- [ ] Validation

### Workflow Scopes
- [ ] WorkflowScope enum added (USER, DEPARTMENT, ORGANIZATION)
- [ ] Personal workspace workflows working (no org)
- [ ] Scope-based query filtering working
- [ ] canCreateWithScope validation
- [ ] canEditWorkflow validation
- [ ] Scope selection UI working (context-aware)
- [ ] Permission checks enforced

### Workflow Execution
- [ ] Sequential execution
- [ ] Context propagation
- [ ] Error handling
- [ ] Run history

### Resource Limits
- [ ] Timeout enforcement by scope
- [ ] Memory limits by scope
- [ ] Step count validation by scope
- [ ] Parallel execution limits
- [ ] Rate limiting (per user/dept/org)
- [ ] Quota integration working

### Triggers
- [ ] Telegram message/callback
- [ ] Schedule (cron)
- [ ] Webhook
- [ ] Manual

### Workflow UI
- [ ] List page (with scope filter)
- [ ] Visual builder (React Flow)
- [ ] Step configuration
- [ ] Input mapping
- [ ] Test/run panel
- [ ] Scope selector

### Run History
- [ ] Run list
- [ ] Run detail view
- [ ] Run replay

### Security & Isolation
- [ ] Workflow chains prevented (cannot trigger other workflows)
- [ ] Personal workflows isolated
- [ ] Department workflows restricted to members
- [ ] Cross-department data sharing via shared resources only

---

## 📊 Task Summary

| Section | Tasks | Estimated Time |
|---------|-------|----------------|
| Workflow Service | 3 (10.1.1-10.1.3) | 110 min |
| Workflow Scopes | 3 (10.1.4-10.1.6) | 100 min |
| Workflow Execution | 4 (10.2.1-10.2.4) | 135 min |
| Resource Limits | 3 (10.2.5-10.2.7) | 90 min |
| Triggers | 4 (10.3.1-10.3.4) | 100 min |
| Workflow UI | 5 (10.4.1-10.4.5) | 195 min |
| Run History | 3 (10.5.1-10.5.3) | 80 min |
| **Total** | **25** | **~13-15 hours** |

---

**When complete:** Update CURRENT-STATE.md and proceed to Phase 11 (Developer Dashboard)
---

## 📌 Architecture Notes

### DataClient Integration

Phase 10 should use DataClient (from Phase 1.5.5) for all database operations:

```typescript
// WorkflowService using DataClient
class WorkflowService {
  async getAccessibleWorkflows(ctx: ServiceContext): Promise<Workflow[]> {
    const db = getDataClient(ctx);
    
    // DataClient automatically applies tenant filter
    // No need for manual WHERE organizationId = ctx.organizationId
    return db.workflow.findMany({
      where: { status: { not: 'ARCHIVED' } },
      include: { steps: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
  
  async createWorkflow(ctx: ServiceContext, data: CreateWorkflowInput): Promise<Workflow> {
    const db = getDataClient(ctx);
    
    // DataClient automatically sets userId and organizationId
    return db.workflow.create({
      data: {
        name: data.name,
        scope: data.scope,
        departmentId: data.departmentId,
        // userId and organizationId auto-set by DataClient
      },
    });
  }
}
```

### Database Isolation Benefits for Workflows

Workflow execution data (WorkflowRun, WorkflowStepRun) can be very high volume:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 WORKFLOW DATA VOLUME EXAMPLE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Enterprise Org with 50 employees:                                      │
│  • 200 active workflows                                                 │
│  • 1000 runs/day × 5 steps/run = 5,000 step runs/day                    │
│  • 150,000 step runs/month per org                                      │
│                                                                         │
│  Platform with 100 enterprise orgs:                                     │
│  • 15,000,000 step runs/month in shared DB!                             │
│                                                                         │
│  With Isolated DBs:                                                     │
│  • Each org's DB has only 150K rows                                     │
│  • 100x smaller tables = 100x faster queries                            │
│  • No cross-org query interference                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Scope + Isolation Matrix

```
┌──────────────────────────────────────────────────────────────────┐
│              WORKFLOW SCOPE + DB ISOLATION                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Personal User (no org):                                         │
│  ├── Scope: USER only                                            │
│  ├── DB: Shared (FREE/PRO) or User-Isolated (future Pro add-on)  │
│  └── Filter: userId + organizationId=NULL                        │
│                                                                  │
│  Organization (Free/Pro/Business):                               │
│  ├── Scopes: USER, DEPARTMENT, ORGANIZATION                      │
│  ├── DB: Shared                                                  │
│  └── Filter: organizationId (+ departmentId for DEPARTMENT)      │
│                                                                  │
│  Organization (Enterprise):                                      │
│  ├── Scopes: USER, DEPARTMENT, ORGANIZATION                      │
│  ├── DB: Dedicated (isolated)                                    │
│  └── Filter: None needed (entire DB is theirs!)                  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

The DataClient handles this automatically - services don't need to know about isolation level.