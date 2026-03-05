/**
 * Cursor Action Backend Tests
 *
 * Tests for the POST /cursor/action endpoint logic.
 * Validates all 8 cursor action types with mocked services.
 *
 * @module server/routes/__tests__/cursor-action.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ===========================================
// Mock Setup
// ===========================================

const mockGatewayService = {
  create: vi.fn(),
  delete: vi.fn(),
  findByUser: vi.fn(),
};

const mockPluginService = {
  installPlugin: vi.fn(),
  deleteCustomPlugin: vi.fn(),
  createCustomPlugin: vi.fn(),
  getUserPlugins: vi.fn(),
  togglePlugin: vi.fn(),
  getAvailablePlugins: vi.fn(),
  getCustomPlugin: vi.fn(),
  updateCustomPlugin: vi.fn(),
};

const mockWorkspaceService = {
  getStatus: vi.fn(),
  startWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
};

// Mock edit function
const mockEditPluginCode = vi.fn();

// Inline helper that mirrors the cursor-action switch logic
// This avoids needing a full Express server for unit tests.
async function executeCursorAction(
  body: Record<string, unknown>,
  secrets: Record<string, string> = {},
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const action = body.action as string;
  if (!action) throw new Error("action is required");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = { userId: "test-user-id", role: "USER", plan: "PRO" } as any;

  switch (action) {
    case "create_gateway": {
      const gwName = (body.name as string) ?? "My Bot";
      const gwType = (body.type as string) ?? "TELEGRAM_BOT";

      let credentials: Record<string, string>;
      if (gwType === "TELEGRAM_BOT") {
        const botToken = secrets.botToken;
        if (!botToken) throw new Error("botToken secret is required");
        credentials = { botToken };
      } else if (gwType === "AI") {
        const apiKey = secrets.apiKey;
        if (!apiKey) throw new Error("apiKey secret is required");
        credentials = { provider: (body.type as string) || "openai", apiKey };
      } else if (gwType === "CUSTOM_GATEWAY") {
        const url = secrets.url || (body.slug as string);
        if (!url) throw new Error("url is required for custom gateways");
        credentials = { url };
      } else {
        throw new Error(`Unknown gateway type: ${gwType}`);
      }

      const gateway = await mockGatewayService.create(ctx, {
        name: gwName,
        type: gwType,
        credentials,
      });

      return { success: true, data: { message: `Gateway "${gateway.name}" created!`, gateway } };
    }

    case "delete_gateway": {
      const gatewayId = body.gatewayId as string | undefined;
      if (!gatewayId) {
        const gwNameQuery = body.name as string | undefined;
        if (gwNameQuery) {
          const gateways = await mockGatewayService.findByUser(ctx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = gateways.find((g: any) =>
            g.name.toLowerCase().includes(gwNameQuery.toLowerCase()),
          );
          if (!match) throw new Error(`No gateway found matching "${gwNameQuery}"`);
          await mockGatewayService.delete(ctx, match.id);
          return { success: true, data: { message: `Gateway "${match.name}" deleted.` } };
        }
        throw new Error("gatewayId or name is required");
      }
      await mockGatewayService.delete(ctx, gatewayId);
      return { success: true, data: { message: "Gateway deleted." } };
    }

    case "install_plugin": {
      const rawSlug = (body.slug || body.name) as string;
      if (!rawSlug) throw new Error("slug or name is required");

      // N2: Fuzzy search
      let resolvedSlug = rawSlug;
      let fuzzyNote = "";
      const searchResults = await mockPluginService.getAvailablePlugins({ search: resolvedSlug });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exactSlugMatch = searchResults.find((p: any) => p.slug === resolvedSlug);
      if (!exactSlugMatch && searchResults.length > 0) {
        const normalizedInput = resolvedSlug.toLowerCase().replace(/\s+/g, "-");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameMatch = searchResults.find((p: any) =>
          p.name.toLowerCase() === resolvedSlug.toLowerCase()
          || p.slug === normalizedInput,
        );
        if (nameMatch) {
          resolvedSlug = nameMatch.slug;
          fuzzyNote = ` (matched "${nameMatch.name}")`;
        } else {
          resolvedSlug = searchResults[0].slug;
          fuzzyNote = searchResults.length === 1
            ? ` (matched "${searchResults[0].name}")`
            : ` (best match: "${searchResults[0].name}")`;
        }
      }

      // N3: Auto-select gateway
      let gatewayId = body.gatewayId as string | undefined;
      if (!gatewayId) {
        const userGateways = await mockGatewayService.findByUser(ctx);
        if (userGateways.length === 1) {
          gatewayId = userGateways[0].id;
        }
      }

      const installed = await mockPluginService.installPlugin(ctx, {
        slug: resolvedSlug,
        gatewayId,
      });
      const gwNote = gatewayId && !body.gatewayId ? " (auto-linked to gateway)" : "";
      return {
        success: true,
        data: {
          message: `Plugin "${installed.pluginName}" installed!${fuzzyNote}${gwNote}`,
          plugin: { id: installed.id, slug: installed.pluginSlug, name: installed.pluginName },
        },
      };
    }

    case "delete_plugin": {
      let deletePluginId = body.pluginId as string | undefined;
      if (!deletePluginId) {
        const delNameQuery = body.name as string | undefined;
        if (delNameQuery) {
          const userPlugins = await mockPluginService.getUserPlugins(ctx);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const match = userPlugins.find((up: any) =>
            up.pluginName.toLowerCase().includes(delNameQuery.toLowerCase())
            || up.pluginSlug.toLowerCase() === delNameQuery.toLowerCase().replace(/\s+/g, "-"),
          );
          if (!match) throw new Error(`No plugin found matching "${delNameQuery}"`);
          deletePluginId = match.pluginId;
        } else {
          throw new Error("pluginId or name is required");
        }
      }
      await mockPluginService.deleteCustomPlugin(ctx, deletePluginId);
      return { success: true, data: { message: `Plugin "${body.name || "plugin"}" deleted.` } };
    }

    case "start_plugin": {
      const startNameQuery = body.name as string;
      if (!startNameQuery) throw new Error("Plugin name is required for start_plugin");
      const userPlugins = await mockPluginService.getUserPlugins(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pluginToStart = userPlugins.find((up: any) =>
        up.pluginName.toLowerCase().includes(startNameQuery.toLowerCase())
        || up.pluginSlug.toLowerCase() === startNameQuery.toLowerCase().replace(/\s+/g, "-"),
      );
      if (!pluginToStart) throw new Error(`No plugin found matching "${body.name}"`);

      if (pluginToStart.isEnabled) {
        return { success: true, data: { message: `Plugin "${pluginToStart.pluginName}" is already running.` } };
      }
      await mockPluginService.togglePlugin(ctx, pluginToStart.id, true);
      return { success: true, data: { message: `Plugin "${pluginToStart.pluginName}" started!` } };
    }

    case "create_plugin": {
      const pluginName = (body.name as string) ?? "New Plugin";
      const slug = pluginName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const plugin = await mockPluginService.createCustomPlugin(ctx, {
        slug, name: pluginName,
        description: (body.description as string) || "Created by Cursor",
        code: (body.code as string) || "// Plugin code",
        category: "general",
      });
      return {
        success: true,
        data: {
          message: `Plugin "${plugin.pluginName}" created!`,
          plugin: { id: plugin.id, slug: plugin.pluginSlug, name: plugin.pluginName },
        },
      };
    }

    case "start_workspace": {
      const wsStatus = await mockWorkspaceService.getStatus(ctx);
      if (!wsStatus) {
        const ws = await mockWorkspaceService.createWorkspace(ctx, {});
        return { success: true, data: { message: `Workspace "${ws.name}" created and starting!` } };
      }
      if (wsStatus.status === "running") {
        return { success: true, data: { message: "Workspace is already running!" } };
      }
      const result = await mockWorkspaceService.startWorkspace(ctx, wsStatus.id);
      return { success: true, data: { message: result.success ? "Workspace started!" : `Issue: ${result.message}` } };
    }

    case "stop_plugin": {
      const stopNameQuery = body.name as string;
      if (!stopNameQuery) throw new Error("Plugin name is required for stop_plugin");
      const userPluginsForStop = await mockPluginService.getUserPlugins(ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pluginToStop = userPluginsForStop.find((up: any) =>
        up.pluginName.toLowerCase().includes(stopNameQuery.toLowerCase())
        || up.pluginSlug.toLowerCase() === stopNameQuery.toLowerCase().replace(/\s+/g, "-"),
      );
      if (!pluginToStop) throw new Error(`No plugin found matching "${body.name}"`);

      if (!pluginToStop.isEnabled) {
        return { success: true, data: { message: `Plugin "${pluginToStop.pluginName}" is already stopped.` } };
      }
      await mockPluginService.togglePlugin(ctx, pluginToStop.id, false);
      return { success: true, data: { message: `Plugin "${pluginToStop.pluginName}" stopped.` } };
    }

    case "edit_plugin": {
      const editName = body.name as string | undefined;
      const editInstruction = (body.instruction as string) || (body.description as string) || "";
      if (!editInstruction) throw new Error("instruction is required for edit_plugin");

      const userPluginsForEdit = await mockPluginService.getUserPlugins(ctx);
      if (userPluginsForEdit.length === 0) {
        return { success: false, error: { code: "NO_PLUGINS", message: "You don't have any plugins to edit." } };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let matchedPlugin: any = userPluginsForEdit[0];
      if (editName) {
        const normalizedInput = editName.toLowerCase().replace(/\s+/g, "-");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exactMatch = userPluginsForEdit.find((p: any) =>
          p.pluginSlug === normalizedInput || p.pluginName.toLowerCase() === editName.toLowerCase(),
        );
        if (exactMatch) matchedPlugin = exactMatch;
        else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fuzzyMatch = userPluginsForEdit.find((p: any) =>
            p.pluginSlug.includes(normalizedInput) ||
            p.pluginName.toLowerCase().includes(editName.toLowerCase()),
          );
          if (fuzzyMatch) matchedPlugin = fuzzyMatch;
        }
      }

      const pluginData = await mockPluginService.getCustomPlugin(ctx, matchedPlugin.pluginId);
      const currentCode = pluginData?.code || null;
      if (!currentCode) {
        return { success: false, error: { code: "CODE_NOT_FOUND", message: `Could not read current code.` } };
      }

      const editResult = await mockEditPluginCode(currentCode, editInstruction, matchedPlugin.pluginName);
      if (editResult.code === currentCode) {
        return { success: false, error: { code: "EDIT_FAILED", message: "Could not apply the edit." } };
      }

      await mockPluginService.updateCustomPlugin(ctx, matchedPlugin.pluginId, { code: editResult.code });

      return {
        success: true,
        data: {
          message: `Plugin "${matchedPlugin.pluginName}" updated! ${editResult.summary}`,
          plugin: { id: matchedPlugin.pluginId, slug: matchedPlugin.pluginSlug, name: matchedPlugin.pluginName },
          summary: editResult.summary,
          previousCode: currentCode,
        },
      };
    }

    case "restore_plugin_code": {
      const restorePluginId = body.pluginId as string | undefined;
      const restoreCode = body.code as string | undefined;
      if (!restorePluginId || !restoreCode) {
        throw new Error("pluginId and code are required for restore_plugin_code");
      }
      await mockPluginService.updateCustomPlugin(ctx, restorePluginId, { code: restoreCode });
      return { success: true, data: { message: "Plugin code restored to previous version." } };
    }

    default:
      throw new Error(`Unknown cursor action: "${action}"`);
  }
}

// ===========================================
// Tests
// ===========================================

describe("cursor-action endpoint logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGatewayService.findByUser.mockResolvedValue([]);
    mockPluginService.getAvailablePlugins.mockResolvedValue([]);
    mockPluginService.getUserPlugins.mockResolvedValue([]);
  });

  // ------------------------------------------
  // create_gateway
  // ------------------------------------------
  describe("create_gateway", () => {
    it("creates a Telegram gateway with botToken secret", async () => {
      mockGatewayService.create.mockResolvedValue({
        id: "gw-1", name: "MyBot", type: "TELEGRAM_BOT", status: "CONNECTED",
      });

      const result = await executeCursorAction(
        { action: "create_gateway", name: "MyBot", type: "TELEGRAM_BOT" },
        { botToken: "123:ABC" },
      );

      expect(result.success).toBe(true);
      expect(result.data.message).toContain("MyBot");
      expect(mockGatewayService.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "MyBot", type: "TELEGRAM_BOT", credentials: { botToken: "123:ABC" } }),
      );
    });

    it("throws when botToken is missing for Telegram", async () => {
      await expect(
        executeCursorAction({ action: "create_gateway", type: "TELEGRAM_BOT" }, {}),
      ).rejects.toThrow("botToken secret is required");
    });

    it("creates an AI gateway with apiKey secret", async () => {
      mockGatewayService.create.mockResolvedValue({
        id: "gw-2", name: "AI GW", type: "AI", status: "CONNECTED",
      });

      const result = await executeCursorAction(
        { action: "create_gateway", name: "AI GW", type: "AI" },
        { apiKey: "sk-xxx" },
      );
      expect(result.success).toBe(true);
    });

    it("uses default name of 'My Bot' when no name provided", async () => {
      mockGatewayService.create.mockResolvedValue({
        id: "gw-3", name: "My Bot", type: "TELEGRAM_BOT", status: "CONNECTED",
      });

      await executeCursorAction({ action: "create_gateway" }, { botToken: "tok" });

      expect(mockGatewayService.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "My Bot" }),
      );
    });
  });

  // ------------------------------------------
  // delete_gateway
  // ------------------------------------------
  describe("delete_gateway", () => {
    it("deletes a gateway by ID", async () => {
      mockGatewayService.delete.mockResolvedValue(undefined);

      const result = await executeCursorAction({ action: "delete_gateway", gatewayId: "gw-1" });
      expect(result.success).toBe(true);
      expect(mockGatewayService.delete).toHaveBeenCalledWith(expect.anything(), "gw-1");
    });

    it("deletes a gateway by name lookup", async () => {
      mockGatewayService.findByUser.mockResolvedValue([
        { id: "gw-2", name: "TestBot", type: "TELEGRAM_BOT" },
      ]);
      mockGatewayService.delete.mockResolvedValue(undefined);

      const result = await executeCursorAction({ action: "delete_gateway", name: "TestBot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("TestBot");
    });

    it("throws when no gateway matches the name", async () => {
      mockGatewayService.findByUser.mockResolvedValue([]);

      await expect(
        executeCursorAction({ action: "delete_gateway", name: "nonexistent" }),
      ).rejects.toThrow("No gateway found");
    });

    it("throws when neither gatewayId nor name provided", async () => {
      await expect(
        executeCursorAction({ action: "delete_gateway" }),
      ).rejects.toThrow("gatewayId or name is required");
    });
  });

  // ------------------------------------------
  // install_plugin
  // ------------------------------------------
  describe("install_plugin", () => {
    it("installs a plugin by exact slug", async () => {
      mockPluginService.getAvailablePlugins.mockResolvedValue([
        { slug: "echo-bot", name: "Echo Bot" },
      ]);
      mockPluginService.installPlugin.mockResolvedValue({
        id: "up-1", pluginSlug: "echo-bot", pluginName: "Echo Bot",
      });

      const result = await executeCursorAction({ action: "install_plugin", slug: "echo-bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("Echo Bot");
      expect(mockPluginService.installPlugin).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: "echo-bot" }),
      );
    });

    it("fuzzy matches when slug does not exactly match (N2)", async () => {
      mockPluginService.getAvailablePlugins.mockResolvedValue([
        { slug: "echo-bot", name: "Echo Bot" },
      ]);
      mockPluginService.installPlugin.mockResolvedValue({
        id: "up-1", pluginSlug: "echo-bot", pluginName: "Echo Bot",
      });

      const result = await executeCursorAction({ action: "install_plugin", slug: "echo" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("matched");
      expect(mockPluginService.installPlugin).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: "echo-bot" }),
      );
    });

    it("auto-selects gateway when user has exactly 1 (N3)", async () => {
      mockGatewayService.findByUser.mockResolvedValue([
        { id: "gw-auto", name: "MyGW", type: "TELEGRAM_BOT", status: "CONNECTED" },
      ]);
      mockPluginService.getAvailablePlugins.mockResolvedValue([
        { slug: "echo-bot", name: "Echo Bot" },
      ]);
      mockPluginService.installPlugin.mockResolvedValue({
        id: "up-1", pluginSlug: "echo-bot", pluginName: "Echo Bot",
      });

      const result = await executeCursorAction({ action: "install_plugin", slug: "echo-bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("auto-linked");
      expect(mockPluginService.installPlugin).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ gatewayId: "gw-auto" }),
      );
    });

    it("uses explicit gatewayId when provided (no auto-select)", async () => {
      mockPluginService.getAvailablePlugins.mockResolvedValue([
        { slug: "echo-bot", name: "Echo Bot" },
      ]);
      mockPluginService.installPlugin.mockResolvedValue({
        id: "up-1", pluginSlug: "echo-bot", pluginName: "Echo Bot",
      });

      const result = await executeCursorAction({
        action: "install_plugin", slug: "echo-bot", gatewayId: "gw-explicit",
      });
      expect(result.success).toBe(true);
      expect(result.data.message).not.toContain("auto-linked");
    });

    it("throws when slug is missing", async () => {
      await expect(
        executeCursorAction({ action: "install_plugin" }),
      ).rejects.toThrow("slug or name is required");
    });
  });

  // ------------------------------------------
  // delete_plugin
  // ------------------------------------------
  describe("delete_plugin", () => {
    it("deletes a plugin by name lookup", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([
        { pluginId: "p-1", pluginName: "Echo Bot", pluginSlug: "echo-bot" },
      ]);
      mockPluginService.deleteCustomPlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({ action: "delete_plugin", name: "echo bot" });
      expect(result.success).toBe(true);
      expect(mockPluginService.deleteCustomPlugin).toHaveBeenCalledWith(expect.anything(), "p-1");
    });

    it("throws when no plugin matches name", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([]);

      await expect(
        executeCursorAction({ action: "delete_plugin", name: "nonexistent" }),
      ).rejects.toThrow("No plugin found");
    });

    it("throws when name is not provided", async () => {
      await expect(
        executeCursorAction({ action: "delete_plugin" }),
      ).rejects.toThrow("pluginId or name is required");
    });
  });

  // ------------------------------------------
  // start_plugin
  // ------------------------------------------
  describe("start_plugin", () => {
    it("enables a stopped plugin", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([
        { id: "up-1", pluginName: "Echo Bot", pluginSlug: "echo-bot", isEnabled: false },
      ]);
      mockPluginService.togglePlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({ action: "start_plugin", name: "echo bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("started");
      expect(mockPluginService.togglePlugin).toHaveBeenCalledWith(expect.anything(), "up-1", true);
    });

    it("reports when plugin is already running", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([
        { id: "up-1", pluginName: "Echo Bot", pluginSlug: "echo-bot", isEnabled: true },
      ]);

      const result = await executeCursorAction({ action: "start_plugin", name: "echo bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("already running");
      expect(mockPluginService.togglePlugin).not.toHaveBeenCalled();
    });

    it("throws when plugin name is missing", async () => {
      await expect(
        executeCursorAction({ action: "start_plugin" }),
      ).rejects.toThrow("Plugin name is required");
    });

    it("throws when plugin is not found", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([]);

      await expect(
        executeCursorAction({ action: "start_plugin", name: "nonexistent" }),
      ).rejects.toThrow("No plugin found");
    });
  });

  // ------------------------------------------
  // create_plugin
  // ------------------------------------------
  describe("create_plugin", () => {
    it("creates a custom plugin with default name", async () => {
      mockPluginService.createCustomPlugin.mockResolvedValue({
        id: "p-new", pluginSlug: "new-plugin", pluginName: "New Plugin",
      });

      const result = await executeCursorAction({ action: "create_plugin" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("New Plugin");
    });

    it("creates a custom plugin with given name", async () => {
      mockPluginService.createCustomPlugin.mockResolvedValue({
        id: "p-custom", pluginSlug: "my-bot", pluginName: "My Bot",
      });

      const result = await executeCursorAction({ action: "create_plugin", name: "My Bot" });
      expect(result.success).toBe(true);
      expect(mockPluginService.createCustomPlugin).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: "My Bot", slug: "my-bot" }),
      );
    });
  });

  // ------------------------------------------
  // start_workspace
  // ------------------------------------------
  describe("start_workspace", () => {
    it("creates a workspace when none exists", async () => {
      mockWorkspaceService.getStatus.mockResolvedValue(null);
      mockWorkspaceService.createWorkspace.mockResolvedValue({
        id: "ws-1", name: "Development",
      });

      const result = await executeCursorAction({ action: "start_workspace" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("created");
    });

    it("reports when workspace is already running", async () => {
      mockWorkspaceService.getStatus.mockResolvedValue({
        id: "ws-1", status: "running",
      });

      const result = await executeCursorAction({ action: "start_workspace" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("already running");
    });

    it("starts a stopped workspace", async () => {
      mockWorkspaceService.getStatus.mockResolvedValue({
        id: "ws-1", status: "stopped",
      });
      mockWorkspaceService.startWorkspace.mockResolvedValue({
        success: true, containerId: "c-123", status: "running",
      });

      const result = await executeCursorAction({ action: "start_workspace" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("started");
    });
  });

  // ------------------------------------------
  // stop_plugin
  // ------------------------------------------
  describe("stop_plugin", () => {
    it("disables a running plugin", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([
        { id: "up-1", pluginName: "Echo Bot", pluginSlug: "echo-bot", isEnabled: true },
      ]);
      mockPluginService.togglePlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({ action: "stop_plugin", name: "echo bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("stopped");
      expect(mockPluginService.togglePlugin).toHaveBeenCalledWith(expect.anything(), "up-1", false);
    });

    it("reports when plugin is already stopped", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([
        { id: "up-1", pluginName: "Echo Bot", pluginSlug: "echo-bot", isEnabled: false },
      ]);

      const result = await executeCursorAction({ action: "stop_plugin", name: "echo bot" });
      expect(result.success).toBe(true);
      expect(result.data.message).toContain("already stopped");
      expect(mockPluginService.togglePlugin).not.toHaveBeenCalled();
    });

    it("throws when plugin name is missing", async () => {
      await expect(
        executeCursorAction({ action: "stop_plugin" }),
      ).rejects.toThrow("Plugin name is required");
    });

    it("throws when plugin is not found", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([]);

      await expect(
        executeCursorAction({ action: "stop_plugin", name: "nonexistent" }),
      ).rejects.toThrow("No plugin found");
    });
  });

  // ------------------------------------------
  // edit_plugin
  // ------------------------------------------
  describe("edit_plugin", () => {
    const mockPlugins = [
      { id: "up-1", pluginId: "p-1", pluginName: "Echo Bot", pluginSlug: "echo-bot", entryFile: "plugins/echo-bot.js" },
      { id: "up-2", pluginId: "p-2", pluginName: "Fleet Advisor", pluginSlug: "fleet-advisor", entryFile: "plugins/fleet-advisor.js" },
    ];

    it("edits a plugin by exact name match", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue(mockPlugins);
      mockPluginService.getCustomPlugin.mockResolvedValue({ code: "// old code" });
      mockEditPluginCode.mockResolvedValue({ code: "// new code", summary: "Added greeting" });
      mockPluginService.updateCustomPlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({
        action: "edit_plugin",
        name: "Echo Bot",
        instruction: "add a greeting",
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain("Echo Bot");
      expect(result.data.message).toContain("Added greeting");
      expect(result.data.previousCode).toBe("// old code");
      expect(mockPluginService.updateCustomPlugin).toHaveBeenCalledWith(
        expect.anything(),
        "p-1",
        expect.objectContaining({ code: "// new code" }),
      );
    });

    it("edits a plugin by fuzzy name match", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue(mockPlugins);
      mockPluginService.getCustomPlugin.mockResolvedValue({ code: "// fleet code" });
      mockEditPluginCode.mockResolvedValue({ code: "// fleet updated", summary: "Updated fleet" });
      mockPluginService.updateCustomPlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({
        action: "edit_plugin",
        name: "fleet",
        instruction: "add reset command",
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain("Fleet Advisor");
    });

    it("returns NO_PLUGINS when user has no plugins", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue([]);

      const result = await executeCursorAction({
        action: "edit_plugin",
        name: "anything",
        instruction: "do something",
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("NO_PLUGINS");
    });

    it("returns CODE_NOT_FOUND when code is null", async () => {
      mockPluginService.getUserPlugins.mockResolvedValue(mockPlugins);
      mockPluginService.getCustomPlugin.mockResolvedValue({ code: null });

      const result = await executeCursorAction({
        action: "edit_plugin",
        name: "Echo Bot",
        instruction: "change something",
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("CODE_NOT_FOUND");
    });

    it("returns EDIT_FAILED when code is unchanged", async () => {
      const originalCode = "// unchanged code";
      mockPluginService.getUserPlugins.mockResolvedValue(mockPlugins);
      mockPluginService.getCustomPlugin.mockResolvedValue({ code: originalCode });
      mockEditPluginCode.mockResolvedValue({ code: originalCode, summary: "" });

      const result = await executeCursorAction({
        action: "edit_plugin",
        name: "Echo Bot",
        instruction: "do nothing",
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe("EDIT_FAILED");
    });

    it("throws when instruction is missing", async () => {
      await expect(
        executeCursorAction({ action: "edit_plugin", name: "Echo Bot" }),
      ).rejects.toThrow("instruction is required");
    });
  });

  // ------------------------------------------
  // restore_plugin_code
  // ------------------------------------------
  describe("restore_plugin_code", () => {
    it("restores plugin code to a previous version", async () => {
      mockPluginService.updateCustomPlugin.mockResolvedValue(undefined);

      const result = await executeCursorAction({
        action: "restore_plugin_code",
        pluginId: "p-1",
        code: "// previous version",
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain("restored");
      expect(mockPluginService.updateCustomPlugin).toHaveBeenCalledWith(
        expect.anything(),
        "p-1",
        { code: "// previous version" },
      );
    });

    it("throws when pluginId is missing", async () => {
      await expect(
        executeCursorAction({ action: "restore_plugin_code", code: "// code" }),
      ).rejects.toThrow("pluginId and code are required");
    });

    it("throws when code is missing", async () => {
      await expect(
        executeCursorAction({ action: "restore_plugin_code", pluginId: "p-1" }),
      ).rejects.toThrow("pluginId and code are required");
    });
  });

  // ------------------------------------------
  // Unknown action
  // ------------------------------------------
  describe("unknown action", () => {
    it("throws for unknown actions", async () => {
      await expect(
        executeCursorAction({ action: "do_something_random" }),
      ).rejects.toThrow("Unknown cursor action");
    });

    it("throws when action is missing", async () => {
      await expect(executeCursorAction({})).rejects.toThrow("action is required");
    });
  });
});
