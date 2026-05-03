/**
 * MCP (Model Context Protocol) Routes
 *
 * REST API for managing per-user MCP server configurations.
 * Configs are stored encrypted in the database and spawned at session time.
 *
 * Routes:
 *   GET    /api/mcp/servers          — list all configured servers (decrypted for owner)
 *   POST   /api/mcp/servers          — add a new server config
 *   PATCH  /api/mcp/servers/:id      — update name / config / enabled flag
 *   DELETE /api/mcp/servers/:id      — remove a server config
 *
 * @module server/routes/mcp
 */

import {
    createMCPServer,
    deleteMCPServer,
    listMCPServers,
    updateMCPServer,
    type CreateMCPServerInput,
    type MCPTransportConfig,
    type UpdateMCPServerInput,
} from "@/modules/mcp/mcp-config.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/error-handler";

export const mcpRouter = Router();

// All MCP routes require authentication
mcpRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/mcp/servers
// ---------------------------------------------------------------------------
mcpRouter.get(
  "/servers",
  asyncHandler(async (req: Request, res: Response<ApiResponse<unknown>>) => {
    const userId = req.user!.id;
    const orgId = typeof req.query.organizationId === "string" ? req.query.organizationId : null;

    const servers = await listMCPServers(userId, orgId);

    res.json({ success: true, data: servers });
  }),
);

// ---------------------------------------------------------------------------
// POST /api/mcp/servers
// ---------------------------------------------------------------------------
mcpRouter.post(
  "/servers",
  asyncHandler(async (req: Request, res: Response<ApiResponse<unknown>>) => {
    const userId = req.user!.id;
    const { name, config, isEnabled, organizationId } = req.body as {
      name?: unknown;
      config?: unknown;
      isEnabled?: unknown;
      organizationId?: unknown;
    };

    if (typeof name !== "string" || name.trim().length === 0) {
      throw new BadRequestError("name is required");
    }
    if (name.trim().length > 100) {
      throw new BadRequestError("name must be 100 characters or fewer");
    }

    if (!config || typeof config !== "object") {
      throw new BadRequestError("config is required");
    }

    const typedConfig = config as Record<string, unknown>;
    const transportType = typedConfig.transportType;

    if (transportType === "stdio") {
      if (typeof typedConfig.command !== "string" || !typedConfig.command.trim()) {
        throw new BadRequestError("config.command is required for stdio transport");
      }
      if (!Array.isArray(typedConfig.args)) {
        throw new BadRequestError("config.args must be an array for stdio transport");
      }
    } else if (transportType === "sse") {
      if (typeof typedConfig.url !== "string" || !typedConfig.url.trim()) {
        throw new BadRequestError("config.url is required for sse transport");
      }
    } else {
      throw new BadRequestError("config.transportType must be 'stdio' or 'sse'");
    }

    const input: CreateMCPServerInput = {
      name: name.trim(),
      config: typedConfig as unknown as MCPTransportConfig,
      isEnabled: typeof isEnabled === "boolean" ? isEnabled : true,
      organizationId: typeof organizationId === "string" ? organizationId : null,
    };

    const created = await createMCPServer(userId, input);
    res.status(201).json({ success: true, data: created });
  }),
);

// ---------------------------------------------------------------------------
// PATCH /api/mcp/servers/:id
// ---------------------------------------------------------------------------
mcpRouter.patch(
  "/servers/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse<unknown>>) => {
    const userId = req.user!.id;
    const { id } = req.params as { id: string };
    const { name, config, isEnabled } = req.body as {
      name?: unknown;
      config?: unknown;
      isEnabled?: unknown;
    };

    const input: UpdateMCPServerInput = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new BadRequestError("name must be a non-empty string");
      }
      if (name.trim().length > 100) {
        throw new BadRequestError("name must be 100 characters or fewer");
      }
      input.name = name.trim();
    }

    if (config !== undefined) {
      if (!config || typeof config !== "object") {
        throw new BadRequestError("config must be an object");
      }
      const typedConfig = config as Record<string, unknown>;
      const transportType = typedConfig.transportType;
      if (transportType !== "stdio" && transportType !== "sse") {
        throw new BadRequestError("config.transportType must be 'stdio' or 'sse'");
      }
      input.config = typedConfig as unknown as MCPTransportConfig;
    }

    if (isEnabled !== undefined) {
      if (typeof isEnabled !== "boolean") {
        throw new BadRequestError("isEnabled must be a boolean");
      }
      input.isEnabled = isEnabled;
    }

    const updated = await updateMCPServer(id, userId, input);
    if (!updated) {
      throw new NotFoundError("MCP server config not found");
    }

    res.json({ success: true, data: updated });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/mcp/servers/:id
// ---------------------------------------------------------------------------
mcpRouter.delete(
  "/servers/:id",
  asyncHandler(async (req: Request, res: Response<ApiResponse<unknown>>) => {
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const deleted = await deleteMCPServer(id, userId);
    if (!deleted) {
      throw new NotFoundError("MCP server config not found");
    }

    res.json({ success: true, data: { deleted: true } });
  }),
);
