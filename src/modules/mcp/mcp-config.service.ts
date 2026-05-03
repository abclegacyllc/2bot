/**
 * mcp-config.service.ts
 *
 * CRUD service for MCPServerConfig — stores per-user MCP server configurations.
 * Credentials/config JSON is AES-256-GCM encrypted at rest (same pattern as Gateway).
 */

import { decrypt, encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const mcpLog = logger.child({ module: "mcp", service: "config" });

// ---------------------------------------------------------------------------
// Public config shapes (decrypted, safe to pass around in server memory)
// ---------------------------------------------------------------------------

export interface MCPStdioConfig {
  transportType: "stdio";
  /** Command to run inside the workspace container (e.g. "npx") */
  command: string;
  /** Arguments passed to the command (e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]) */
  args: string[];
  /** Optional extra environment variables injected into the process */
  env?: Record<string, string>;
}

export interface MCPSSEConfig {
  transportType: "sse";
  /** Full URL of the SSE endpoint (e.g. "https://mcp.example.com/sse") */
  url: string;
  /** Optional HTTP headers sent with every request (e.g. { Authorization: "Bearer ..." }) */
  headers?: Record<string, string>;
}

export type MCPTransportConfig = MCPStdioConfig | MCPSSEConfig;

export interface MCPServerConfigRow {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  transportType: "stdio" | "sse";
  config: MCPTransportConfig;
  isEnabled: boolean;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function decryptConfig(configEnc: string): MCPTransportConfig {
  const raw = decrypt(configEnc);
  return JSON.parse(raw) as MCPTransportConfig;
}

function toRow(record: {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  transportType: string;
  configEnc: string;
  isEnabled: boolean;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MCPServerConfigRow {
  return {
    id: record.id,
    userId: record.userId,
    organizationId: record.organizationId,
    name: record.name,
    transportType: record.transportType as "stdio" | "sse",
    config: decryptConfig(record.configEnc),
    isEnabled: record.isEnabled,
    status: record.status,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all MCP server configs for a user (decrypted). */
export async function listMCPServers(
  userId: string,
  organizationId?: string | null,
): Promise<MCPServerConfigRow[]> {
  const where = organizationId
    ? { OR: [{ userId }, { organizationId }] }
    : { userId };

  const rows = await prisma.mCPServerConfig.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  return rows.map(toRow);
}

/** Get a single config by id — checks ownership. */
export async function getMCPServer(
  id: string,
  userId: string,
  organizationId?: string | null,
): Promise<MCPServerConfigRow | null> {
  const row = await prisma.mCPServerConfig.findUnique({ where: { id } });
  if (!row) return null;
  // Ownership check
  if (row.userId !== userId && row.organizationId !== (organizationId ?? null)) return null;
  return toRow(row);
}

export interface CreateMCPServerInput {
  name: string;
  config: MCPTransportConfig;
  isEnabled?: boolean;
  organizationId?: string | null;
}

/** Create a new MCP server config. */
export async function createMCPServer(
  userId: string,
  input: CreateMCPServerInput,
): Promise<MCPServerConfigRow> {
  const configEnc = encrypt(JSON.stringify(input.config));

  const row = await prisma.mCPServerConfig.create({
    data: {
      userId,
      organizationId: input.organizationId ?? null,
      name: input.name,
      transportType: input.config.transportType,
      configEnc,
      isEnabled: input.isEnabled ?? true,
      status: "disconnected",
    },
  });

  mcpLog.info({ id: row.id, userId, name: input.name }, "MCP server config created");
  return toRow(row);
}

export interface UpdateMCPServerInput {
  name?: string;
  config?: MCPTransportConfig;
  isEnabled?: boolean;
  status?: string;
  lastError?: string | null;
}

/** Update an existing MCP server config — checks ownership. */
export async function updateMCPServer(
  id: string,
  userId: string,
  input: UpdateMCPServerInput,
): Promise<MCPServerConfigRow | null> {
  const existing = await getMCPServer(id, userId);
  if (!existing) return null;

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
  if (input.status !== undefined) data.status = input.status;
  if (input.lastError !== undefined) data.lastError = input.lastError;
  if (input.config !== undefined) {
    data.configEnc = encrypt(JSON.stringify(input.config));
    data.transportType = input.config.transportType;
  }

  const updated = await prisma.mCPServerConfig.update({
    where: { id },
    data,
  });

  return toRow(updated);
}

/** Delete an MCP server config — checks ownership. */
export async function deleteMCPServer(
  id: string,
  userId: string,
): Promise<boolean> {
  const existing = await getMCPServer(id, userId);
  if (!existing) return false;

  await prisma.mCPServerConfig.delete({ where: { id } });
  mcpLog.info({ id, userId }, "MCP server config deleted");
  return true;
}

/** Get only enabled configs (used at agent session start). */
export async function getEnabledMCPServers(
  userId: string,
  organizationId?: string | null,
): Promise<MCPServerConfigRow[]> {
  const all = await listMCPServers(userId, organizationId);
  return all.filter((s) => s.isEnabled);
}

/** Persist connection status update (called after session connects/disconnects). */
export async function setMCPServerStatus(
  id: string,
  status: string,
  lastError?: string | null,
): Promise<void> {
  await prisma.mCPServerConfig.update({
    where: { id },
    data: {
      status,
      lastError: lastError ?? null,
    },
  });
}
