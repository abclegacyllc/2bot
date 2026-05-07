/**
 * Project Topology Service
 *
 * Aggregates a Project's full architecture into a graph payload
 * (`{ nodes, edges }`) for the Architecture Canvas UI.
 *
 * Nodes represent the things a Project owns:
 *  - GATEWAY            (a Gateway row + its paired ProjectResource)
 *  - WORKFLOW           (a Workflow row)
 *  - PLUGIN             (a UserPlugin install)
 *  - HTTP_ROUTE         (a ProjectResource of kind HTTP_ROUTE)
 *  - SCHEDULE           (a ProjectResource of kind SCHEDULE)
 *  - SECRET             (a ProjectResource of kind SECRET)
 *  - EXTERNAL_API       (a ProjectResource of kind EXTERNAL_API)
 *  - DATABASE           (a ProjectResource of kind DATABASE)
 *
 * Edges represent declared relationships (no runtime stats here):
 *  - HTTP_ROUTE   → WORKFLOW   (HttpRoute.targetWorkflowId)
 *  - HTTP_ROUTE   → PLUGIN     (HttpRoute.targetUserPluginId)
 *  - SCHEDULE     → WORKFLOW   (Schedule.targetWorkflowId)
 *  - WORKFLOW     → GATEWAY    (WorkflowGateway link)
 *  - WORKFLOW     → PLUGIN     (WorkflowStep.userPluginId)
 *  - PLUGIN       → GATEWAY    (UserPlugin.gatewayId)
 *
 * No secret / credential fields are returned. Encrypted columns are never
 * loaded by the queries below.
 *
 * @module modules/project-resource/project-topology.service
 */

import type {
    GatewayStatus,
    GatewayType,
    HttpMethod,
    ProjectKind,
    ProjectResourceKind,
    ProjectResourceStatus,
    ProjectStatus,
    WorkflowStatus,
    WorkflowTriggerType,
} from "@prisma/client";

import { prismaReplica } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/shared/errors";

import type { ProjectResourceOwnerFilter } from "./project-resource.types";

// Topology assembly is purely read-only — we route through the replica
// proxy, which transparently uses a Postgres read replica when one is
// configured (DATABASE_URL_REPLICA) and falls back to the primary
// otherwise. See `lib/prisma.ts`.
const prisma = prismaReplica;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type TopologyNodeKind =
  | "GATEWAY"
  | "WORKFLOW"
  | "PLUGIN"
  | "HTTP_ROUTE"
  | "SCHEDULE"
  | "SECRET"
  | "EXTERNAL_API"
  | "DATABASE";

export type TopologyEdgeKind =
  | "ROUTE_TO_WORKFLOW"
  | "ROUTE_TO_PLUGIN"
  | "SCHEDULE_TO_WORKFLOW"
  | "WORKFLOW_TO_GATEWAY"
  | "WORKFLOW_TO_PLUGIN"
  | "PLUGIN_TO_GATEWAY";

interface BaseNode {
  /** Stable canvas id, e.g. `gateway:abc123`. */
  id: string;
  kind: TopologyNodeKind;
  /** Display name. */
  label: string;
  /** Underlying database id (Gateway.id, Workflow.id, UserPlugin.id, ProjectResource.id). */
  refId: string;
}

export interface GatewayNode extends BaseNode {
  kind: "GATEWAY";
  data: {
    type: GatewayType;
    status: GatewayStatus;
    /** Paired ProjectResource id when one exists. */
    resourceId: string | null;
  };
}

export interface WorkflowNode extends BaseNode {
  kind: "WORKFLOW";
  data: {
    triggerType: WorkflowTriggerType;
    status: WorkflowStatus;
    isEnabled: boolean;
    slug: string;
  };
}

export interface PluginNode extends BaseNode {
  kind: "PLUGIN";
  data: {
    pluginSlug: string;
    pluginName: string;
    isEnabled: boolean;
    gatewayId: string | null;
  };
}

export interface HttpRouteNode extends BaseNode {
  kind: "HTTP_ROUTE";
  data: {
    status: ProjectResourceStatus;
    method: HttpMethod;
    path: string;
    targetWorkflowId: string | null;
    targetUserPluginId: string | null;
  };
}

export interface ScheduleNode extends BaseNode {
  kind: "SCHEDULE";
  data: {
    status: ProjectResourceStatus;
    cron: string;
    timezone: string | null;
    enabled: boolean;
    targetWorkflowId: string | null;
  };
}

export interface SecretNode extends BaseNode {
  kind: "SECRET";
  data: {
    status: ProjectResourceStatus;
    /** Logical key, e.g. `OPENAI_API_KEY`. Plaintext value never returned. */
    key: string;
  };
}

export interface ExternalApiNode extends BaseNode {
  kind: "EXTERNAL_API";
  data: {
    status: ProjectResourceStatus;
    baseUrl: string;
    authMode: string;
  };
}

export interface DatabaseNode extends BaseNode {
  kind: "DATABASE";
  data: {
    status: ProjectResourceStatus;
    driver: string;
    host: string;
    database: string;
  };
}

export type TopologyNode =
  | GatewayNode
  | WorkflowNode
  | PluginNode
  | HttpRouteNode
  | ScheduleNode
  | SecretNode
  | ExternalApiNode
  | DatabaseNode;

export interface TopologyEdge {
  id: string;
  kind: TopologyEdgeKind;
  /** Canvas node id (matches `TopologyNode.id`). */
  source: string;
  /** Canvas node id (matches `TopologyNode.id`). */
  target: string;
  /** Optional label, e.g. workflow-gateway role ("trigger"). */
  label?: string;
}

export interface TopologyProjectMeta {
  id: string;
  name: string;
  slug: string;
  kind: ProjectKind;
  status: ProjectStatus;
}

export interface ProjectTopology {
  project: TopologyProjectMeta;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  /** Counts, useful for headers / badges. */
  counts: {
    nodes: number;
    edges: number;
    byKind: Record<TopologyNodeKind, number>;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const RESOURCE_KIND_TO_NODE: Partial<
  Record<ProjectResourceKind, TopologyNodeKind>
> = {
  HTTP_ROUTE: "HTTP_ROUTE",
  SCHEDULE: "SCHEDULE",
  SECRET: "SECRET",
  EXTERNAL_API: "EXTERNAL_API",
  DATABASE: "DATABASE",
};

function gwNodeId(id: string): string {
  return `gateway:${id}`;
}
function wfNodeId(id: string): string {
  return `workflow:${id}`;
}
function pluginNodeId(id: string): string {
  return `plugin:${id}`;
}
function resourceNodeId(id: string): string {
  return `resource:${id}`;
}

function emptyByKind(): Record<TopologyNodeKind, number> {
  return {
    GATEWAY: 0,
    WORKFLOW: 0,
    PLUGIN: 0,
    HTTP_ROUTE: 0,
    SCHEDULE: 0,
    SECRET: 0,
    EXTERNAL_API: 0,
    DATABASE: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the full topology graph for a project.
 *
 * Caller must own the project (same userId + organizationId scope as the
 * other ProjectResource APIs). Throws NotFoundError / ForbiddenError on
 * mismatch.
 *
 * Encrypted fields (Secret.valueEnc, ExternalApi.authConfigEnc,
 * DatabaseConnection.passwordEnc) are NEVER selected.
 */
export async function getProjectTopology(
  owner: ProjectResourceOwnerFilter,
  projectId: string,
): Promise<ProjectTopology> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      name: true,
      slug: true,
      kind: true,
      status: true,
    },
  });

  if (!project) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }
  if (project.userId !== owner.userId) {
    throw new ForbiddenError("You do not have access to this project");
  }
  const projectOrg = project.organizationId ?? null;
  const ownerOrg = owner.organizationId ?? null;
  if (projectOrg !== ownerOrg) {
    throw new ForbiddenError("Project belongs to a different organization");
  }

  // Run the four reads in parallel — none depend on each other.
  const [gateways, workflows, userPlugins, resources] = await Promise.all([
    prisma.gateway.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        projectResource: { select: { id: true } },
      },
    }),
    prisma.workflow.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        slug: true,
        triggerType: true,
        status: true,
        isEnabled: true,
        workflowGateways: {
          select: { gatewayId: true, role: true },
        },
        steps: {
          where: { userPluginId: { not: null } },
          select: { userPluginId: true },
        },
      },
    }),
    prisma.userPlugin.findMany({
      where: { projectId },
      select: {
        id: true,
        gatewayId: true,
        isEnabled: true,
        plugin: { select: { slug: true, name: true } },
      },
    }),
    prisma.projectResource.findMany({
      where: {
        projectId,
        kind: {
          in: ["HTTP_ROUTE", "SCHEDULE", "SECRET", "EXTERNAL_API", "DATABASE"],
        },
      },
      select: {
        id: true,
        kind: true,
        name: true,
        slug: true,
        status: true,
        httpRoute: {
          select: {
            method: true,
            path: true,
            targetWorkflowId: true,
            targetUserPluginId: true,
          },
        },
        schedule: {
          select: {
            cron: true,
            timezone: true,
            enabled: true,
            targetWorkflowId: true,
          },
        },
        secret: {
          select: { key: true },
        },
        externalApi: {
          select: { baseUrl: true, authMode: true },
        },
        database: {
          select: { driver: true, host: true, database: true },
        },
      },
    }),
  ]);

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const byKind = emptyByKind();

  // Gateways
  for (const gw of gateways) {
    const node: GatewayNode = {
      id: gwNodeId(gw.id),
      kind: "GATEWAY",
      label: gw.name,
      refId: gw.id,
      data: {
        type: gw.type,
        status: gw.status,
        resourceId: gw.projectResource?.id ?? null,
      },
    };
    nodes.push(node);
    byKind.GATEWAY += 1;
  }

  // Workflows
  for (const wf of workflows) {
    const node: WorkflowNode = {
      id: wfNodeId(wf.id),
      kind: "WORKFLOW",
      label: wf.name,
      refId: wf.id,
      data: {
        triggerType: wf.triggerType,
        status: wf.status,
        isEnabled: wf.isEnabled,
        slug: wf.slug,
      },
    };
    nodes.push(node);
    byKind.WORKFLOW += 1;
  }

  // Plugins
  for (const up of userPlugins) {
    const node: PluginNode = {
      id: pluginNodeId(up.id),
      kind: "PLUGIN",
      label: up.plugin.name,
      refId: up.id,
      data: {
        pluginSlug: up.plugin.slug,
        pluginName: up.plugin.name,
        isEnabled: up.isEnabled,
        gatewayId: up.gatewayId,
      },
    };
    nodes.push(node);
    byKind.PLUGIN += 1;
  }

  // ProjectResources (non-gateway kinds)
  for (const res of resources) {
    const nodeKind = RESOURCE_KIND_TO_NODE[res.kind];
    if (!nodeKind) continue;

    const baseId = resourceNodeId(res.id);
    if (nodeKind === "HTTP_ROUTE" && res.httpRoute) {
      nodes.push({
        id: baseId,
        kind: "HTTP_ROUTE",
        label: res.name,
        refId: res.id,
        data: {
          status: res.status,
          method: res.httpRoute.method,
          path: res.httpRoute.path,
          targetWorkflowId: res.httpRoute.targetWorkflowId,
          targetUserPluginId: res.httpRoute.targetUserPluginId,
        },
      });
      byKind.HTTP_ROUTE += 1;
    } else if (nodeKind === "SCHEDULE" && res.schedule) {
      nodes.push({
        id: baseId,
        kind: "SCHEDULE",
        label: res.name,
        refId: res.id,
        data: {
          status: res.status,
          cron: res.schedule.cron,
          timezone: res.schedule.timezone,
          enabled: res.schedule.enabled,
          targetWorkflowId: res.schedule.targetWorkflowId,
        },
      });
      byKind.SCHEDULE += 1;
    } else if (nodeKind === "SECRET" && res.secret) {
      nodes.push({
        id: baseId,
        kind: "SECRET",
        label: res.name,
        refId: res.id,
        data: { status: res.status, key: res.secret.key },
      });
      byKind.SECRET += 1;
    } else if (nodeKind === "EXTERNAL_API" && res.externalApi) {
      nodes.push({
        id: baseId,
        kind: "EXTERNAL_API",
        label: res.name,
        refId: res.id,
        data: {
          status: res.status,
          baseUrl: res.externalApi.baseUrl,
          authMode: res.externalApi.authMode,
        },
      });
      byKind.EXTERNAL_API += 1;
    } else if (nodeKind === "DATABASE" && res.database) {
      nodes.push({
        id: baseId,
        kind: "DATABASE",
        label: res.name,
        refId: res.id,
        data: {
          status: res.status,
          driver: res.database.driver,
          host: res.database.host,
          database: res.database.database,
        },
      });
      byKind.DATABASE += 1;
    }
  }

  // Build a lookup so edge-target ids exist before we wire them.
  const workflowIds = new Set(workflows.map((w) => w.id));
  const pluginIds = new Set(userPlugins.map((p) => p.id));
  const gatewayIds = new Set(gateways.map((g) => g.id));

  // Edges: HttpRoute → Workflow / Plugin
  for (const res of resources) {
    if (res.kind !== "HTTP_ROUTE" || !res.httpRoute) continue;
    const src = resourceNodeId(res.id);
    if (
      res.httpRoute.targetWorkflowId &&
      workflowIds.has(res.httpRoute.targetWorkflowId)
    ) {
      edges.push({
        id: `${src}->wf:${res.httpRoute.targetWorkflowId}`,
        kind: "ROUTE_TO_WORKFLOW",
        source: src,
        target: wfNodeId(res.httpRoute.targetWorkflowId),
      });
    }
    if (
      res.httpRoute.targetUserPluginId &&
      pluginIds.has(res.httpRoute.targetUserPluginId)
    ) {
      edges.push({
        id: `${src}->pl:${res.httpRoute.targetUserPluginId}`,
        kind: "ROUTE_TO_PLUGIN",
        source: src,
        target: pluginNodeId(res.httpRoute.targetUserPluginId),
      });
    }
  }

  // Edges: Schedule → Workflow
  for (const res of resources) {
    if (res.kind !== "SCHEDULE" || !res.schedule) continue;
    if (
      res.schedule.targetWorkflowId &&
      workflowIds.has(res.schedule.targetWorkflowId)
    ) {
      const src = resourceNodeId(res.id);
      edges.push({
        id: `${src}->wf:${res.schedule.targetWorkflowId}`,
        kind: "SCHEDULE_TO_WORKFLOW",
        source: src,
        target: wfNodeId(res.schedule.targetWorkflowId),
      });
    }
  }

  // Edges: Workflow → Gateway (via WorkflowGateway link table) and
  // Workflow → Plugin (via WorkflowStep.userPluginId).
  for (const wf of workflows) {
    const src = wfNodeId(wf.id);
    for (const link of wf.workflowGateways) {
      if (!gatewayIds.has(link.gatewayId)) continue;
      edges.push({
        id: `${src}->gw:${link.gatewayId}:${link.role}`,
        kind: "WORKFLOW_TO_GATEWAY",
        source: src,
        target: gwNodeId(link.gatewayId),
        label: link.role,
      });
    }
    // Dedupe step→plugin edges so a workflow with N steps on the same plugin
    // only produces one edge.
    const seenPlugins = new Set<string>();
    for (const step of wf.steps) {
      const pluginId = step.userPluginId;
      if (!pluginId || !pluginIds.has(pluginId)) continue;
      if (seenPlugins.has(pluginId)) continue;
      seenPlugins.add(pluginId);
      edges.push({
        id: `${src}->pl:${pluginId}`,
        kind: "WORKFLOW_TO_PLUGIN",
        source: src,
        target: pluginNodeId(pluginId),
      });
    }
  }

  // Edges: Plugin → Gateway
  for (const up of userPlugins) {
    if (!up.gatewayId || !gatewayIds.has(up.gatewayId)) continue;
    const src = pluginNodeId(up.id);
    edges.push({
      id: `${src}->gw:${up.gatewayId}`,
      kind: "PLUGIN_TO_GATEWAY",
      source: src,
      target: gwNodeId(up.gatewayId),
    });
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      kind: project.kind,
      status: project.status,
    },
    nodes,
    edges,
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      byKind,
    },
  };
}
