/**
 * Cursor Service
 *
 * Executes real platform actions on behalf of the visual cursor.
 * Each action corresponds to a cursor-brain intent (frontend) that
 * translates to a platform operation (create gateway, install plugin, etc.).
 *
 * Extracted from the 2bot-ai route to be a proper module service.
 *
 * @module modules/cursor/cursor.service
 */

import { logger } from "@/lib/logger";
import { twoBotAIProvider } from "@/modules/2bot-ai-provider";
import { BadRequestError } from "@/shared/errors";
import type { ApiResponse } from "@/shared/types";
import type { ServiceContext } from "@/shared/types/context";

import { restartPluginAfterAgent, runAgentLoop } from "./cursor-agent.service";
import { FALLBACK_PLUGIN_CODE, generateMultiFilePlugin, generatePluginCode } from "./cursor-codegen.service";
import { editPluginCode } from "./cursor-edit.service";
import type { CursorActionBody } from "./cursor.types";

const cursorLog = logger.child({ module: "cursor" });

/**
 * Execute a cursor action (the main switch dispatcher).
 *
 * This is the core of the cursor module — it receives a classified intent
 * from the frontend and orchestrates the real platform operation.
 */
async function executeAction(ctx: ServiceContext, body: CursorActionBody): Promise<ApiResponse> {
  const { action, secrets = {} } = body;
  const userId = ctx.userId;

  if (!action) throw new BadRequestError("action is required");

  // Lazy imports to avoid circular deps
  const { gatewayService } = await import("@/modules/gateway");
  const { pluginService } = await import("@/modules/plugin");

  cursorLog.info({ userId, action, name: body.name }, "Cursor action");

  const actionStartMs = Date.now();
  let responseData: ApiResponse;

  switch (action) {
    case "create_gateway": {
      const gwName = body.name ?? "My Bot";
      const gwType = (body.type ?? "TELEGRAM_BOT") as "TELEGRAM_BOT" | "DISCORD_BOT" | "SLACK_BOT" | "WHATSAPP_BOT";

      // Build credentials from secrets — cast to the correct type
      type CredentialTypes = import("@/modules/gateway/gateway.types").GatewayCredentials; // eslint-disable-line @typescript-eslint/consistent-type-imports
      let credentials: CredentialTypes;
      if (gwType === "TELEGRAM_BOT") {
        const botToken = secrets.botToken;
        if (!botToken) throw new BadRequestError("botToken secret is required for Telegram gateways");
        credentials = { botToken };
      } else {
        throw new BadRequestError(`Unknown gateway type: ${gwType}`);
      }

      const gateway = await gatewayService.create(ctx, {
        name: gwName,
        type: gwType,
        credentials,
      });

      responseData = {
        success: true,
        data: {
          message: `Gateway "${gateway.name}" (${gateway.type}) created successfully!`,
          gateway: {
            id: gateway.id,
            name: gateway.name,
            type: gateway.type,
            status: gateway.status,
          },
        },
      };
      break;
    }

    case "delete_gateway": {
      const gatewayId = body.gatewayId;
      if (!gatewayId) {
        // Try to find by name
        const gwNameQuery = body.name;
        if (gwNameQuery) {
          const gateways = await gatewayService.findByUser(ctx);
          const match = gateways.find(
            (g) => g.name.toLowerCase().includes(gwNameQuery.toLowerCase()),
          );
          if (!match) throw new BadRequestError(`No gateway found matching "${gwNameQuery}"`);
          await gatewayService.delete(ctx, match.id);
          responseData = {
            success: true,
            data: { message: `Gateway "${match.name}" deleted.` },
          };
        } else {
          throw new BadRequestError("gatewayId or name is required");
        }
      } else {
        await gatewayService.delete(ctx, gatewayId);
        responseData = {
          success: true,
          data: { message: "Gateway deleted." },
        };
      }
      break;
    }

    case "create_plugin": {
      const pluginName = body.name ?? "New Plugin";
      const slug = pluginName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const pluginDescription = (body.description as string) || "";
      const richSpec = (body.spec as string) || undefined;
      const wantMultiFile = body.multiFile === true;

      // ── Auto-link to user's gateway ──────────────────────────
      let autoGatewayId: string | undefined;
      try {
        const userGateways = await gatewayService.findByUser(ctx);
        if (userGateways.length > 0) {
          const telegram = userGateways.find((g) => g.type === "TELEGRAM_BOT" && g.status === "CONNECTED")
            || userGateways.find((g) => g.type === "TELEGRAM_BOT")
            || userGateways[0];
          if (telegram) {
            autoGatewayId = telegram.id;
            cursorLog.info({ userId, pluginName, gatewayId: telegram.id }, "Auto-linking plugin to gateway");
          }
        }
      } catch (gwErr) {
        cursorLog.warn({ userId, error: gwErr }, "Gateway lookup failed (non-critical)");
      }

      // ── Multi-file plugin creation ───────────────────────────
      if (wantMultiFile && (pluginDescription || richSpec)) {
        try {
          const generated = await generateMultiFilePlugin(pluginName, pluginDescription, userId, richSpec);
          cursorLog.info(
            { userId, pluginName, fileCount: Object.keys(generated.files).length, entry: generated.entry },
            "AI generated multi-file plugin",
          );

          const plugin = await pluginService.createCustomPlugin(ctx, {
            slug,
            name: pluginName,
            description: pluginDescription || "Created by Cursor",
            files: generated.files,
            entry: generated.entry,
            category: (body.category as "general") || "general",
            requiredGateways: ["TELEGRAM_BOT"],
            gatewayId: autoGatewayId,
            configSchema: Object.keys(generated.configSchema).length > 0 ? generated.configSchema : undefined,
            config: Object.keys(generated.configDefaults).length > 0 ? generated.configDefaults : undefined,
          });

          responseData = {
            success: true,
            data: {
              message: `Plugin "${plugin.pluginName}" created as a multi-file plugin!`,
              plugin: {
                id: plugin.id,
                slug: plugin.pluginSlug,
                name: plugin.pluginName,
              },
              multiFile: true,
              fileCount: Object.keys(generated.files).length,
            },
          };
          break;
        } catch (multiFileErr) {
          cursorLog.warn({ userId, pluginName, error: multiFileErr }, "Multi-file generation failed — falling back to single-file");
          // Fall through to single-file path
        }
      }

      // ── Single-file plugin creation (default path) ──────────
      let pluginCode: string | undefined = body.code as string | undefined;
      let pluginConfigSchema: Record<string, unknown> = {};
      let pluginConfigDefaults: Record<string, unknown> = {};

      if (!pluginCode && (pluginDescription || richSpec)) {
        try {
          const generated = await generatePluginCode(pluginName, pluginDescription, userId, richSpec);
          pluginCode = generated.code;
          pluginConfigSchema = generated.configSchema;
          pluginConfigDefaults = generated.configDefaults;
          cursorLog.info(
            { userId, pluginName, hasSchema: Object.keys(pluginConfigSchema).length > 0 },
            "AI generated plugin code + configSchema",
          );
        } catch (codeGenErr) {
          cursorLog.warn({ userId, pluginName, error: codeGenErr }, "AI code generation failed — using template");
        }
      }
      if (!pluginCode) {
        pluginCode = FALLBACK_PLUGIN_CODE;
      }

      const plugin = await pluginService.createCustomPlugin(ctx, {
        slug,
        name: pluginName,
        description: pluginDescription || "Created by Cursor",
        code: pluginCode,
        category: (body.category as "general") || "general",
        requiredGateways: ["TELEGRAM_BOT"],
        gatewayId: autoGatewayId,
        configSchema: Object.keys(pluginConfigSchema).length > 0 ? pluginConfigSchema : undefined,
        config: Object.keys(pluginConfigDefaults).length > 0 ? pluginConfigDefaults : undefined,
      });

      responseData = {
        success: true,
        data: {
          message: `Plugin "${plugin.pluginName}" created!`,
          plugin: {
            id: plugin.id,
            slug: plugin.pluginSlug,
            name: plugin.pluginName,
          },
        },
      };
      break;
    }

    case "edit_plugin": {
      // Edit existing plugin code using AI.
      // 1. Resolve plugin by name
      // 2. Detect if directory plugin → route to agent loop
      // 3. Otherwise: read code → LLM edit → write back
      const editName = body.name as string | undefined;
      const editInstruction = (body.instruction as string) || (body.description as string) || "";
      if (!editInstruction) throw new BadRequestError("instruction is required for edit_plugin");

      // Resolve plugin by fuzzy name match
      const userPlugins = await pluginService.getUserPlugins(ctx);
      if (userPlugins.length === 0) {
        responseData = {
          success: false,
          error: { code: "NO_PLUGINS", message: "You don't have any plugins to edit. Create one first!" },
        };
        break;
      }

      // Find the best match
      let matchedPlugin = userPlugins[0]!;
      if (editName) {
        const normalizedInput = editName.toLowerCase().replace(/\s+/g, "-");
        const exactMatch = userPlugins.find(
          (p) => p.pluginSlug === normalizedInput || p.pluginName.toLowerCase() === editName.toLowerCase(),
        );
        if (exactMatch) {
          matchedPlugin = exactMatch;
        } else {
          // Fuzzy: find plugin whose name/slug contains the search term
          const fuzzyMatch = userPlugins.find(
            (p) =>
              p.pluginSlug.includes(normalizedInput) ||
              p.pluginName.toLowerCase().includes(editName.toLowerCase()),
          );
          if (fuzzyMatch) matchedPlugin = fuzzyMatch;
        }
      }

      // ── Auto-detect directory plugins → route to agent loop ──
      // Directory plugins have entryFile like "plugins/slug/index.js" (3+ path segments).
      // Single-file plugins have "plugins/slug.js" (2 segments).
      const entryParts = (matchedPlugin.entryFile ?? "").split("/");
      const isDirectoryPlugin = entryParts.length >= 3; // e.g. ["plugins", "slug", "index.js"]

      if (isDirectoryPlugin) {
        cursorLog.info(
          { userId, pluginName: matchedPlugin.pluginName, entryFile: matchedPlugin.entryFile },
          "Directory plugin detected — routing to agent loop for edit",
        );

        const orgId = ctx.organizationId ?? null;
        const agentResult = await runAgentLoop(
          matchedPlugin.pluginSlug,
          editInstruction,
          userId,
          orgId,
          true, // isEdit
        );

        if (agentResult.success) {
          await restartPluginAfterAgent(
            matchedPlugin.pluginSlug,
            agentResult.entry,
            userId,
            orgId,
          );

          responseData = {
            success: true,
            data: {
              message: `Plugin "${matchedPlugin.pluginName}" updated! ${agentResult.summary}`,
              plugin: {
                id: matchedPlugin.pluginId,
                userPluginId: matchedPlugin.id,
                slug: matchedPlugin.pluginSlug,
                name: matchedPlugin.pluginName,
              },
              summary: agentResult.summary,
              fileCount: Object.keys(agentResult.files).length,
              filesChanged: Object.keys(agentResult.files),
            },
          };
        } else {
          responseData = {
            success: false,
            error: {
              code: "EDIT_FAILED",
              message: agentResult.summary || "Agent failed to edit the plugin. Try a more specific instruction.",
            },
          };
        }
        break;
      }

      // ── Single-file edit path ────────────────────────────────
      // Read current code from workspace
      let currentCode: string | null = null;
      try {
        const pluginData = await pluginService.getCustomPlugin(ctx, matchedPlugin.pluginId);
        currentCode = pluginData.code || null;
      } catch (readErr) {
        cursorLog.warn(
          { userId, pluginName: matchedPlugin.pluginName, error: readErr },
          "Failed to read current plugin code",
        );
      }

      if (!currentCode) {
        responseData = {
          success: false,
          error: {
            code: "CODE_NOT_FOUND",
            message: `Could not read the current code for "${matchedPlugin.pluginName}". Make sure your workspace is running.`,
          },
        };
        break;
      }

      // AI edit: send current code + instruction to LLM
      const editResult = await editPluginCode(
        currentCode,
        editInstruction,
        matchedPlugin.pluginName,
        userId,
      );

      // If the code didn't change (edit failed), return a message
      if (editResult.code === currentCode) {
        responseData = {
          success: false,
          error: {
            code: "EDIT_FAILED",
            message: editResult.summary || "Could not apply the edit. Try a more specific instruction.",
          },
        };
        break;
      }

      // Write the updated code back via updateCustomPlugin
      try {
        await pluginService.updateCustomPlugin(ctx, matchedPlugin.pluginId, {
          code: editResult.code,
          ...(editResult.configSchema ? { configSchema: editResult.configSchema } : {}),
        });
      } catch (updateErr) {
        cursorLog.error(
          { userId, pluginName: matchedPlugin.pluginName, error: updateErr },
          "Failed to write updated plugin code",
        );
        responseData = {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: `Code was generated but failed to save: ${(updateErr as Error).message}`,
          },
        };
        break;
      }

      cursorLog.info(
        { userId, pluginName: matchedPlugin.pluginName, summary: editResult.summary },
        "Plugin code edited via AI",
      );

      responseData = {
        success: true,
        data: {
          message: `Plugin "${matchedPlugin.pluginName}" updated! ${editResult.summary}`,
          plugin: {
            id: matchedPlugin.pluginId,
            userPluginId: matchedPlugin.id,
            slug: matchedPlugin.pluginSlug,
            name: matchedPlugin.pluginName,
          },
          summary: editResult.summary,
          previousCode: currentCode,
          codePreview: editResult.code.slice(0, 200) + (editResult.code.length > 200 ? "..." : ""),
        },
      };
      break;
    }

    case "generate_plugin_code": {
      // Generate code only — no DB creation. Used by the visual cursor
      // to get AI-generated code before filling the create form.
      const genName = (body.name as string) || "My Plugin";
      const genDescription = (body.description as string) || "";
      if (!genDescription) throw new BadRequestError("description is required for code generation");

      let generated: { code: string; configSchema: Record<string, unknown>; configDefaults: Record<string, unknown> };
      try {
        generated = await generatePluginCode(genName, genDescription, userId);
      } catch {
        generated = { code: FALLBACK_PLUGIN_CODE, configSchema: {}, configDefaults: {} };
      }

      responseData = {
        success: true,
        data: {
          message: "Code generated",
          code: generated.code,
          configSchema: generated.configSchema,
          configDefaults: generated.configDefaults,
          name: genName,
          description: genDescription,
        },
      };
      break;
    }

    case "install_plugin": {
      const rawSlug = body.slug || body.name;
      if (!rawSlug) throw new BadRequestError("slug or name is required");

      // N2: Fuzzy search — try exact slug first, then search for close matches
      let resolvedSlug = String(rawSlug);
      let fuzzyNote = "";
      {
        const searchResults = await pluginService.getAvailablePlugins({ search: resolvedSlug, userId: ctx.userId });
        const exactSlugMatch = searchResults.find((p) => p.slug === resolvedSlug);
        if (!exactSlugMatch && searchResults.length > 0) {
          // No exact slug → fuzzy pick from search results
          const normalizedInput = resolvedSlug.toLowerCase().replace(/\s+/g, "-");
          const nameMatch = searchResults.find(
            (p) => p.name.toLowerCase() === resolvedSlug.toLowerCase()
              || p.slug === normalizedInput,
          );
          if (nameMatch) {
            resolvedSlug = nameMatch.slug;
            fuzzyNote = ` (matched "${nameMatch.name}")`;
          } else {
            resolvedSlug = searchResults[0]!.slug;
            fuzzyNote = searchResults.length === 1
              ? ` (matched "${searchResults[0]!.name}")`
              : ` (best match: "${searchResults[0]!.name}")`;
          }
        }
        // 0 results → let installPlugin throw NotFoundError as before
      }

      // N3: Auto-select gateway if none provided
      let gatewayId = body.gatewayId as string | undefined;
      if (!gatewayId) {
        const userGateways = await gatewayService.findByUser(ctx);
        if (userGateways.length === 1) {
          gatewayId = userGateways[0]!.id;
        } else if (userGateways.length > 1) {
          const active = userGateways.filter((g) => g.status === "CONNECTED");
          const telegram = active.find((g) => g.type === "TELEGRAM_BOT");
          gatewayId = telegram?.id ?? active[0]?.id ?? userGateways[0]!.id;
        }
      }

      const installed = await pluginService.installPlugin(ctx, {
        slug: resolvedSlug,
        gatewayId,
      });

      const gwNote = gatewayId && !body.gatewayId
        ? " (auto-linked to gateway)"
        : "";
      responseData = {
        success: true,
        data: {
          message: `Plugin "${installed.pluginName}" installed!${fuzzyNote}${gwNote}`,
          plugin: {
            id: installed.id,
            slug: installed.pluginSlug,
            name: installed.pluginName,
          },
        },
      };
      break;
    }

    case "delete_plugin": {
      let deletePluginId = body.pluginId;
      if (!deletePluginId) {
        // Try to find by name — look up user's plugins and match
        const delNameQuery = body.name;
        if (delNameQuery) {
          const userPlugins = await pluginService.getUserPlugins(ctx);
          const match = userPlugins.find(
            (up) => up.pluginName.toLowerCase().includes(delNameQuery.toLowerCase())
              || up.pluginSlug.toLowerCase() === delNameQuery.toLowerCase().replace(/\s+/g, "-"),
          );
          if (!match) throw new BadRequestError(`No plugin found matching "${delNameQuery}"`);
          deletePluginId = match.pluginId;
        } else {
          throw new BadRequestError("pluginId or name is required");
        }
      }
      await pluginService.deleteCustomPlugin(ctx, deletePluginId);
      responseData = {
        success: true,
        data: { message: `Plugin "${body.name || "plugin"}" deleted.` },
      };
      break;
    }

    case "start_plugin": {
      // Find the user's plugin by name, then enable it (toggle on)
      const startNameQuery = body.name;
      if (!startNameQuery) throw new BadRequestError("Plugin name is required for start_plugin");
      const userPluginsForStart = await pluginService.getUserPlugins(ctx);
      const pluginToStart = userPluginsForStart.find(
        (up) => up.pluginName.toLowerCase().includes(startNameQuery.toLowerCase())
          || up.pluginSlug.toLowerCase() === startNameQuery.toLowerCase().replace(/\s+/g, "-"),
      );
      if (!pluginToStart) throw new BadRequestError(`No plugin found matching "${body.name}"`);

      if (pluginToStart.isEnabled) {
        responseData = {
          success: true,
          data: { message: `Plugin "${pluginToStart.pluginName}" is already running.` },
        };
      } else {
        await pluginService.togglePlugin(ctx, pluginToStart.id, true);
        responseData = {
          success: true,
          data: { message: `Plugin "${pluginToStart.pluginName}" started!` },
        };
      }
      break;
    }

    // N5: Stop plugin (used by undo)
    case "stop_plugin": {
      const stopNameQuery = body.name;
      if (!stopNameQuery) throw new BadRequestError("Plugin name is required for stop_plugin");
      const userPluginsForStop = await pluginService.getUserPlugins(ctx);
      const pluginToStop = userPluginsForStop.find(
        (up) => up.pluginName.toLowerCase().includes(stopNameQuery.toLowerCase())
          || up.pluginSlug.toLowerCase() === stopNameQuery.toLowerCase().replace(/\s+/g, "-"),
      );
      if (!pluginToStop) throw new BadRequestError(`No plugin found matching "${body.name}"`);

      if (!pluginToStop.isEnabled) {
        responseData = {
          success: true,
          data: { message: `Plugin "${pluginToStop.pluginName}" is already stopped.` },
        };
      } else {
        await pluginService.togglePlugin(ctx, pluginToStop.id, false);
        responseData = {
          success: true,
          data: { message: `Plugin "${pluginToStop.pluginName}" stopped.` },
        };
      }
      break;
    }

    case "start_workspace": {
      const { workspaceService } = await import("@/modules/workspace");

      // Find user's workspace
      const wsStatus = await workspaceService.getStatus(ctx);

      if (!wsStatus) {
        // No workspace exists — create one
        const result = await workspaceService.createWorkspace(ctx);
        responseData = {
          success: true,
          data: {
            message: result.success
              ? "Workspace created and starting!"
              : `Workspace creation issue: ${result.message}`,
            containerId: result.containerId,
            status: result.status,
          },
        };
      } else if (wsStatus.status === "RUNNING") {
        responseData = {
          success: true,
          data: { message: "Workspace is already running.", status: wsStatus.status },
        };
      } else {
        // Workspace exists but is stopped — start it
        const result = await workspaceService.startWorkspace(ctx, wsStatus.id);
        responseData = {
          success: true,
          data: {
            message: result.success
              ? "Workspace started!"
              : `Workspace start issue: ${result.message}`,
            containerId: result.containerId,
            status: result.status,
          },
        };
      }
      break;
    }

    // ── Edit Design Conversation ────────────────────────
    // Multi-turn LLM conversation to refine a complex edit before
    // applying it. The LLM can see the current code and asks smart
    // questions about what should change. Frontend calls this in a
    // loop until status === "ready", then runs edit_plugin with the
    // refined instruction.
    case "design_edit": {
      const editDesignMessages = body.messages || [];
      const editPluginName = (body.name as string) || "My Plugin";
      let currentCode = (body.code as string) || "";

      // Auto-fetch plugin code from the workspace if not provided
      if (!currentCode) {
        try {
          const allPlugins = await pluginService.getUserPlugins(ctx);
          const normalizedQuery = editPluginName.toLowerCase().replace(/\s+/g, "-");
          const matchedPlugin = allPlugins.find(
            (p) =>
              p.pluginSlug === normalizedQuery ||
              p.pluginName.toLowerCase() === editPluginName.toLowerCase() ||
              p.pluginSlug.includes(normalizedQuery) ||
              p.pluginName.toLowerCase().includes(editPluginName.toLowerCase()),
          );
          if (matchedPlugin) {
            const detail = await pluginService.getCustomPlugin(ctx, matchedPlugin.pluginId);
            currentCode = detail.code || "";
          }
        } catch {
          // If we can't fetch code, the LLM will just ask without seeing it
          cursorLog.warn({ userId, pluginName: editPluginName }, "Could not fetch plugin code for design_edit");
        }
      }

      const editDesignSystemPrompt = `You are a senior plugin editor for the 2Bot platform. The user wants to modify an existing plugin. Your job is to understand the edit requirement and produce a precise edit instruction.

## Current Plugin: "${editPluginName}"

## Current Source Code
\`\`\`javascript
${currentCode || "(no code available — the plugin may be new or empty)"}
\`\`\`

## Your Goal
Produce a clear, detailed edit instruction. You CAN SEE the current code — use it to understand the context and provide precise instructions.

## Key Principles
1. **Analyze FIRST** — Before asking questions, study the code. Reference what you see (e.g. "I see you have a /start command that sends a greeting...")
2. **Don't ask what you can infer** — If the code makes the answer obvious, don't ask. For example, if the user says "fix the error handling" and you can SEE there's no try/catch, just propose fixing it.
3. **For broad requests** (improve, check, audit, make better): Do NOT ask what to improve. Analyze the code yourself and immediately produce ==\=EDIT_READY=== with a comprehensive improvement plan.
4. **For specific but clear requests** (add a /reset command): Proceed to ===EDIT_READY=== immediately if you have enough context from the code.
5. **Only ask questions for genuinely ambiguous specifics** — e.g. "change the language" (which language?), "update the model" (which model?). Limit to 1-2 focused questions max.

## What You Should Consider
1. **Scope** — Is this a small tweak or a feature addition?
2. **Specifics** — Which part of the code needs to change?
3. **Behavior** — What should the new behavior be?
4. **Side Effects** — Config changes? Storage schema? Gateway bindings?
5. **Preservation** — What existing features must NOT change?

## Conversation Rules
- You CAN SEE the current code — reference it directly
- If the request is already clear enough, proceed to ===EDIT_READY=== immediately in your FIRST response
- Ask at most 1-2 focused questions if genuinely needed — never overwhelm
- Be concise and helpful — you're a co-worker reviewing a change request

## Output Format
When you have enough information (ideally immediately), your message MUST start with exactly:
\`\`\`
===EDIT_READY===
\`\`\`
Followed by a clear, detailed natural-language instruction describing the exact changes to make:
\`\`\`
===EDIT_READY===
<detailed edit instruction that another AI can follow to rewrite the code>
\`\`\`

If you genuinely need clarification, respond naturally as a conversation with 1-2 questions. But prefer analyzing the code and acting over asking.`;

      const editDesignConversation: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: editDesignSystemPrompt },
        ...editDesignMessages,
      ];

      try {
        const response = await twoBotAIProvider.textGeneration({
          messages: editDesignConversation,
          model: "auto",
          temperature: 0.7,
          maxTokens: 1500,
          stream: false,
          userId,
          feature: "cursor",
        });

        const content = response.content.trim();
        const isReady = content.includes("===EDIT_READY===");

        let editInstruction: string | undefined;
        let cleanContent = content;
        if (isReady) {
          const instrStart = content.indexOf("===EDIT_READY===");
          editInstruction = content.slice(instrStart + "===EDIT_READY===".length).trim();
          cleanContent = "Got it — I know exactly what to change. Let me apply the edit now.";
        }

        responseData = {
          success: true,
          data: {
            message: cleanContent,
            status: isReady ? "ready" : "asking",
            editInstruction: editInstruction || undefined,
          },
        };
      } catch (editDesignErr) {
        cursorLog.warn({ userId, error: editDesignErr }, "Edit design conversation failed");
        responseData = {
          success: false,
          error: { code: "DESIGN_EDIT_FAILED", message: "I had trouble thinking about that edit. Let's try again." },
        };
      }
      break;
    }

    // ── Agent-Based Multi-File Edit ─────────────────────
    // Uses the LLM agent loop with file tools to read, modify,
    // and write multiple files in a directory plugin.
    case "agent_edit": {
      const agentPluginName = (body.name as string) || "";
      const agentInstruction = (body.instruction as string) || "";
      if (!agentInstruction) throw new BadRequestError("instruction is required for agent_edit");

      // Resolve plugin
      const agentUserPlugins = await pluginService.getUserPlugins(ctx);
      if (agentUserPlugins.length === 0) {
        responseData = {
          success: false,
          error: { code: "NO_PLUGINS", message: "You don't have any plugins to edit." },
        };
        break;
      }

      let agentMatchedPlugin = agentUserPlugins[0]!;
      if (agentPluginName) {
        const normalizedInput = agentPluginName.toLowerCase().replace(/\s+/g, "-");
        const exactMatch = agentUserPlugins.find(
          (p) => p.pluginSlug === normalizedInput || p.pluginName.toLowerCase() === agentPluginName.toLowerCase(),
        );
        if (exactMatch) {
          agentMatchedPlugin = exactMatch;
        } else {
          const fuzzyMatch = agentUserPlugins.find(
            (p) =>
              p.pluginSlug.includes(normalizedInput) ||
              p.pluginName.toLowerCase().includes(agentPluginName.toLowerCase()),
          );
          if (fuzzyMatch) agentMatchedPlugin = fuzzyMatch;
        }
      }

      // Extract slug from pluginSlug (remove the custom-{userId8}- prefix)
      const agentSlug = agentMatchedPlugin.pluginSlug;
      const orgId = ctx.organizationId ?? null;

      // Run the agent loop
      const agentResult = await runAgentLoop(
        agentSlug,
        agentInstruction,
        userId,
        orgId,
        true, // isEdit
      );

      if (agentResult.success) {
        // Restart the plugin with the updated files
        await restartPluginAfterAgent(
          agentSlug,
          agentResult.entry,
          userId,
          orgId,
        );

        responseData = {
          success: true,
          data: {
            message: `Plugin "${agentMatchedPlugin.pluginName}" updated via agent!`,
            plugin: {
              id: agentMatchedPlugin.id,
              slug: agentMatchedPlugin.pluginSlug,
              name: agentMatchedPlugin.pluginName,
            },
            summary: agentResult.summary,
            fileCount: Object.keys(agentResult.files).length,
            filesChanged: Object.keys(agentResult.files),
          },
        };
      } else {
        responseData = {
          success: false,
          error: {
            code: "AGENT_EDIT_FAILED",
            message: agentResult.summary || "Agent failed to edit the plugin.",
          },
        };
      }
      break;
    }

    // ── Agent-Based Multi-File Create ───────────────────
    // Uses the LLM agent loop with file tools to create a
    // multi-file plugin from scratch, with iterative file creation.
    case "agent_create": {
      const agentCreateName = body.name ?? "New Plugin";
      const agentCreateSlug = agentCreateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const agentCreateDesc = (body.description as string) || "";
      const agentCreateSpec = (body.spec as string) || undefined;
      const agentCreateTask = agentCreateSpec
        ? `Create a plugin called "${agentCreateName}". Specification:\n${agentCreateSpec}`
        : `Create a plugin called "${agentCreateName}" that does: ${agentCreateDesc}`;

      const orgId2 = ctx.organizationId ?? null;

      const agentCreateResult = await runAgentLoop(
        agentCreateSlug,
        agentCreateTask,
        userId,
        orgId2,
        false, // isEdit = false
      );

      if (agentCreateResult.success && Object.keys(agentCreateResult.files).length > 0) {
        // Auto-link to user's gateway
        let agentGatewayId: string | undefined;
        try {
          const userGateways = await gatewayService.findByUser(ctx);
          const telegram = userGateways.find((g) => g.type === "TELEGRAM_BOT" && g.status === "CONNECTED")
            || userGateways.find((g) => g.type === "TELEGRAM_BOT");
          if (telegram) agentGatewayId = telegram.id;
        } catch { /* non-critical */ }

        const agentPlugin = await pluginService.createCustomPlugin(ctx, {
          slug: agentCreateSlug,
          name: agentCreateName,
          description: agentCreateDesc || "Created by Cursor Agent",
          files: agentCreateResult.files,
          entry: agentCreateResult.entry,
          category: (body.category as "general") || "general",
          requiredGateways: ["TELEGRAM_BOT"],
          gatewayId: agentGatewayId,
          configSchema: Object.keys(agentCreateResult.configSchema).length > 0 ? agentCreateResult.configSchema : undefined,
          config: Object.keys(agentCreateResult.configDefaults).length > 0 ? agentCreateResult.configDefaults : undefined,
        });

        responseData = {
          success: true,
          data: {
            message: `Plugin "${agentPlugin.pluginName}" created via agent!`,
            plugin: {
              id: agentPlugin.id,
              slug: agentPlugin.pluginSlug,
              name: agentPlugin.pluginName,
            },
            multiFile: true,
            fileCount: Object.keys(agentCreateResult.files).length,
            summary: agentCreateResult.summary,
          },
        };
      } else {
        responseData = {
          success: false,
          error: {
            code: "AGENT_CREATE_FAILED",
            message: agentCreateResult.summary || "Agent failed to create the plugin.",
          },
        };
      }
      break;
    }

    // ── Plugin Design Conversation ──────────────────────
    // Multi-turn LLM conversation to build a rich plugin spec.
    // The frontend calls this repeatedly until status === "ready".
    case "design_plugin": {
      const designMessages = body.messages || [];
      const pluginName = (body.name as string) || "My Plugin";

      // System prompt that guides the LLM to be a thoughtful plugin architect
      const designSystemPrompt = `You are a senior plugin architect for the 2Bot platform. Your job is to have a conversation with the user to design their plugin perfectly before any code is written.

## Your Goal
Understand EXACTLY what the user wants their Telegram bot plugin to do, then produce a complete specification. Ask smart follow-up questions — don't generate code yet.

## What You Must Determine
1. **Core Purpose** — What is the main function of this plugin?
2. **Commands** — What /commands should the bot respond to? (e.g. /start, /help, /reset, custom commands)
3. **Message Handling** — Should it respond to every message, or only commands/specific triggers?
4. **AI Usage** — Does it need AI capabilities? If yes:
   - What should the AI system prompt/persona be?
   - Should it maintain conversation memory?
   - Text generation, image generation, or speech?
   - What AI model tier? (free/lite/pro/ultra)
5. **Data Storage** — Does it need to remember anything between messages? Per-user state? Per-chat state?
6. **User Interaction** — Does it need inline keyboard buttons? Multi-step flows?
7. **Configuration** — What should the user be able to configure? (e.g. language, response style, custom prompts)
8. **Error Handling** — How should errors be communicated to the user?

## 2Bot Platform Context
- Plugins run in isolated Docker containers
- They receive Telegram events (messages, callbacks, inline queries)
- They can send messages via sdk.gateway.execute()
- They can use AI via sdk.ai.chat(), sdk.ai.generateImage(), sdk.ai.speak()
- They have persistent key-value storage via sdk.storage
- They can read user config via sdk.config
- Available AI models: text (free/lite/pro/ultra), code (free/lite/pro/ultra), reasoning (pro/ultra), image (pro/ultra), voice (pro/ultra)

## Conversation Rules
- Ask 2-3 focused questions at a time — don't overwhelm
- After the user answers, build on their responses with smarter follow-ups
- When you have enough information (typically 2-4 exchanges), produce the final spec
- Be friendly and helpful — you're a co-worker, not a form

## Output Format
While gathering info, respond naturally as a conversation.

When you have enough information to generate the plugin, your FINAL message MUST start with exactly:
\`\`\`
===SPEC_READY===
\`\`\`
Followed by a structured specification:
\`\`\`
Plugin Name: <name>
Purpose: <one paragraph description>
Commands: <list of /commands with descriptions>
Message Handling: <how non-command messages are handled>
AI Usage: <model, system prompt, conversation memory yes/no>
Storage: <what data is persisted and how>
Buttons/UI: <any inline keyboards or interactions>
Config Options: <what users can configure>
Error Handling: <strategy>
Special Notes: <any additional requirements>
\`\`\`

Current plugin name: "${pluginName}"`;

      const designConversation: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: designSystemPrompt },
        ...designMessages,
      ];

      try {
        const response = await twoBotAIProvider.textGeneration({
          messages: designConversation,
          model: "auto",
          temperature: 0.7,
          maxTokens: 1500,
          stream: false,
          userId,
          feature: "cursor",
        });

        const content = response.content.trim();
        const isReady = content.includes("===SPEC_READY===");

        // Extract the spec if ready
        let spec: string | undefined;
        let cleanContent = content;
        if (isReady) {
          const specStart = content.indexOf("===SPEC_READY===");
          spec = content.slice(specStart + "===SPEC_READY===".length).trim();
          // Show the user a clean message without the marker
          cleanContent = "I've gathered all the details. Here's what I'll build:\n\n" + spec;
        }

        responseData = {
          success: true,
          data: {
            message: cleanContent,
            status: isReady ? "ready" : "asking",
            spec: spec || undefined,
          },
        };
      } catch (designErr) {
        cursorLog.warn({ userId, error: designErr }, "Plugin design conversation failed");
        responseData = {
          success: false,
          error: { code: "DESIGN_FAILED", message: "I had trouble thinking about that. Let's try again." },
        };
      }
      break;
    }

    // ── Conversational Chat ────────────────────────────
    // General conversation when the cursor doesn't match a specific action.
    // Makes the cursor feel like a real co-worker instead of "I don't understand".
    case "chat_with_cursor": {
      const chatText = body.text as string;
      if (!chatText) throw new BadRequestError("text is required for chat_with_cursor");

      const chatSystemPrompt = `You are Cursor — a friendly AI assistant on the 2Bot platform (a Telegram bot management dashboard). The user said something that didn't match a specific command, so just have a helpful conversation with them.

## What you can help with:
- Creating Telegram bots (gateways) — "create a telegram bot"
- Creating custom plugins — "create a plugin that does X"
- Installing existing plugins — "install echo-bot"
- Managing plugins — "start/stop/delete plugin"
- Starting the development workspace — "start workspace"
- Checking credits and usage — "check credits" / "view usage"
- Checking billing and subscription — "check billing" / "show subscription"

## Platform Context:
- 2Bot lets users connect Telegram bots and extend them with plugins
- Plugins can use AI (text generation, image generation, TTS) via the sdk.ai API
- Users have credits that are consumed when using AI features
- Plugins run in isolated Docker containers with the 2Bot Plugin SDK

## Conversation Rules:
- Be concise and helpful (2-4 sentences max)
- If the user seems to want to create something, guide them — suggest the right command
- If they're confused, explain what you can do
- If they're describing a plugin idea, encourage them to say "create a plugin that [description]"
- If the user's input looks like a misspelled or incomplete command, suggest the correct one (e.g. "billin" → "Did you mean 'check billing'?")
- Be warm and friendly — you're a co-worker, not a machine
- NEVER say "I can't do that" — always suggest what you CAN do instead

Respond naturally as a helpful assistant.`;

      try {
        const response = await twoBotAIProvider.textGeneration({
          messages: [
            { role: "system", content: chatSystemPrompt },
            { role: "user", content: chatText },
          ],
          model: "auto",
          temperature: 0.7,
          maxTokens: 300,
          stream: false,
          userId,
          feature: "cursor",
        });

        responseData = {
          success: true,
          data: {
            message: response.content.trim(),
            type: "conversation",
          },
        };
      } catch (chatErr) {
        cursorLog.warn({ userId, error: chatErr }, "Cursor chat failed");
        responseData = {
          success: true,
          data: {
            message: "I'm having a bit of trouble thinking right now. Try telling me what you'd like to do — like \"create a plugin\" or \"check credits\".",
            type: "conversation",
          },
        };
      }
      break;
    }

    // ── LLM-First: Primary intent classifier ─────────────
    case "classify_intent": {
      const rawText = body.text as string;
      if (!rawText) throw new BadRequestError("text is required for classify_intent");

      const systemPrompt = `You are the AI brain behind the Cursor on the 2Bot platform — a bot management dashboard. Users speak to you naturally - your job is to understand what they want and classify their intent so the cursor can act.

## Available Actions

| intent | description | parameters |
|--------|-------------|------------|
| create_gateway | Create a new bot/gateway for messaging | name (string, optional), gatewayType ("TELEGRAM_BOT", "DISCORD_BOT", "SLACK_BOT", or "WHATSAPP_BOT") |
| delete_gateway | Delete/remove/disconnect a bot/gateway | name (string - which gateway) |
| list_gateways | Show/browse the user's gateways | (none) |
| create_plugin | Create a brand-new custom plugin from scratch | name (string, optional), description (string - FULL description of what user wants, preserve ALL details) |
| edit_plugin | Edit/modify/change/update/fix an existing user plugin | name (string - which plugin to edit), description (string - FULL description of what to change, the edit instruction) |
| install_plugin | Install an existing plugin from the store | name (string - plugin name or slug) |
| delete_plugin | Remove/uninstall a plugin | name (string - which plugin) |
| start_plugin | Start/enable/activate a stopped plugin | name (string - which plugin) |
| stop_plugin | Stop/disable/deactivate a running plugin | name (string - which plugin) |
| start_workspace | Start/launch/boot the development workspace | (none) |
| check_credits | Check credit balance/remaining credits | (none) |
| check_billing | Check billing, subscription, plan details, or invoices | (none) |
| view_usage | View usage statistics/consumption | (none) |
| browse_plugins | Browse or list available plugins in the store | (none) |
| help | User needs help, guidance, or doesn't know what to do | (none) |
| undo | Undo/revert the last action | (none) |
| unknown | Cannot determine intent from the input | (none) |

## Rules
- Classify into EXACTLY ONE intent
- Extract parameters when present (name, gatewayType, description)
- "bot" usually means gateway (Telegram bot). "Plugin" is a software extension.
- "check my billing" or "show subscription" or "view my plan" → check_billing
- If user says something like "set up a bot" or "connect telegram" → create_gateway
- "add echo-bot" or "install the weather plugin" → install_plugin
- "what plugins are available" or "show me plugins" → browse_plugins
- For ambiguous inputs, pick the most likely intent
- A slug is the hyphenated lowercase version of a name: "Echo Bot" → "echo-bot"
- CRITICAL for create_plugin: When the user describes what they want built, preserve the FULL description in the "description" field. Include ALL details about features, behavior, domain (e.g. "AI chat bot that advises about semi truck fleet management, maintenance, routes"). Do NOT summarize or truncate.
- If the user describes a plugin idea without explicitly saying "create plugin", still classify as create_plugin if they clearly want something built
- CRITICAL for edit_plugin: When the user wants to CHANGE/MODIFY/UPDATE/FIX an EXISTING plugin, classify as edit_plugin (NOT create_plugin). Put the edit instruction in "description". Examples:
  - "change my echo bot to respond in Spanish" → edit_plugin, name="echo bot", description="respond in Spanish"
  - "add a /reset command to fleet advisor" → edit_plugin, name="fleet advisor", description="add a /reset command"
  - "fix the error in my weather plugin" → edit_plugin, name="weather", description="fix the error"
  - "update my AI chat to use ultra model" → edit_plugin, name="AI chat", description="use ultra model"

## Output
Respond with ONLY valid JSON, no markdown, no explanation:
{"type":"<intent>","name":"<extracted_name_or_null>","slug":"<slug_or_null>","gatewayType":"<type_or_null>","description":"<full_description_or_null>","confidence":<0.0_to_1.0>}

The "confidence" field is a float from 0.0 to 1.0 indicating how confident you are:
- 0.9-1.0: Very clear and unambiguous intent
- 0.7-0.89: Likely correct but slightly ambiguous
- 0.5-0.69: Uncertain, could be multiple things
- Below 0.5: Very unsure, treat as unknown`;

      try {
        const response = await twoBotAIProvider.textGeneration({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: rawText },
          ],
          model: "auto",
          temperature: 0,
          maxTokens: 300,
          stream: false,
          userId,
          feature: "cursor",
        });

        // Parse the JSON response — strip markdown fences if LLM adds them
        let text = response.content.trim();
        if (text.startsWith("```")) {
          text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        }
        const parsed = JSON.parse(text) as {
          type: string;
          name?: string | null;
          slug?: string | null;
          gatewayType?: string | null;
          description?: string | null;
          confidence?: number | null;
        };

        const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.8;

        cursorLog.info(
          { userId, rawText, classified: parsed.type, name: parsed.name, confidence },
          "LLM intent classification",
        );

        responseData = {
          success: true,
          data: {
            message: `Classified as: ${parsed.type}`,
            intent: {
              type: parsed.type,
              name: parsed.name || undefined,
              slug: parsed.slug || undefined,
              gatewayType: parsed.gatewayType || undefined,
              description: parsed.description || undefined,
            },
            confidence,
          },
        };
      } catch (llmErr) {
        cursorLog.warn({ userId, rawText, error: llmErr }, "LLM classification failed");
        responseData = {
          success: false,
          error: { code: "CLASSIFICATION_FAILED", message: "Could not understand the command" },
        };
      }
      break;
    }

    // ── Restore Plugin Code (Undo Edit) ──────────────
    // Restores a plugin's code to a previous version.
    // Used by the frontend undo system after an edit_plugin action.
    case "restore_plugin_code": {
      const restorePluginId = body.pluginId as string | undefined;
      const restoreCode = body.code as string | undefined;
      if (!restorePluginId || !restoreCode) {
        throw new BadRequestError("pluginId and code are required for restore_plugin_code");
      }

      try {
        await pluginService.updateCustomPlugin(ctx, restorePluginId, {
          code: restoreCode,
        });
      } catch (restoreErr) {
        cursorLog.error(
          { userId, pluginId: restorePluginId, error: restoreErr },
          "Failed to restore plugin code",
        );
        responseData = {
          success: false,
          error: {
            code: "RESTORE_FAILED",
            message: `Could not restore the plugin code: ${(restoreErr as Error).message}`,
          },
        };
        break;
      }

      cursorLog.info({ userId, pluginId: restorePluginId }, "Plugin code restored (undo)");

      responseData = {
        success: true,
        data: {
          message: "Plugin code restored to previous version.",
          pluginId: restorePluginId,
        },
      };
      break;
    }

    default:
      throw new BadRequestError(`Unknown cursor action: "${action}"`);
  }

  const durationMs = Date.now() - actionStartMs;
  cursorLog.info(
    { userId, action, name: body.name, success: responseData.success, durationMs },
    "Cursor action completed",
  );

  return responseData;
}

export const cursorService = {
  executeAction,
};
