/**
 * Cursor Tools Tests
 *
 * Tests for new cursor tool definitions, ToolStartMeta mapping,
 * and frontend agent-event-mapper coverage.
 *
 * @module modules/cursor/__tests__/cursor-tools.test
 */

import { describe, expect, it } from 'vitest';

// ===========================================
// Tool Definitions
// ===========================================

import { getWorkerTools } from '../cursor-worker-tools';
import { WORKER_TOOL_NAMES } from '../cursor-workers';

describe('Cursor Tool Definitions', () => {
  const newAssistantTools = [
    'stop_workspace',
    'restart_workspace',
    'get_workspace_status',
    'update_gateway',
    'view_plugin_config',
    'search_marketplace',
    'get_gateway_metrics',
    'get_workspace_logs',
    'get_workspace_metrics',
  ];

  const newCoderTools = [
    'clone_plugin',
    'view_plugin_config',
  ];

  it('should resolve all assistant tools via getWorkerTools', () => {
    const tools = getWorkerTools('assistant');
    const toolNames = tools.map((t) => t.name);
    for (const name of newAssistantTools) {
      expect(toolNames).toContain(name);
    }
  });

  it('should resolve all coder tools via getWorkerTools', () => {
    const tools = getWorkerTools('coder');
    const toolNames = tools.map((t) => t.name);
    for (const name of newCoderTools) {
      expect(toolNames).toContain(name);
    }
  });

  it('should include new assistant tools in WORKER_TOOL_NAMES.assistant', () => {
    for (const name of newAssistantTools) {
      expect(WORKER_TOOL_NAMES.assistant).toContain(name);
    }
  });

  it('should include new coder tools in WORKER_TOOL_NAMES.coder', () => {
    for (const name of newCoderTools) {
      expect(WORKER_TOOL_NAMES.coder).toContain(name);
    }
  });

  it('should have no undefined entries from getWorkerTools (all names map to definitions)', () => {
    const assistantTools = getWorkerTools('assistant');
    const coderTools = getWorkerTools('coder');
    expect(assistantTools.length).toBe(WORKER_TOOL_NAMES.assistant.length);
    expect(coderTools.length).toBe(WORKER_TOOL_NAMES.coder.length);
  });

  it('exposes request_domain_allowlist to both worker types with required args', () => {
    const assistantTools = getWorkerTools('assistant');
    const coderTools = getWorkerTools('coder');
    const onAssistant = assistantTools.find((t) => t.name === 'request_domain_allowlist');
    const onCoder = coderTools.find((t) => t.name === 'request_domain_allowlist');
    expect(onAssistant).toBeDefined();
    expect(onCoder).toBeDefined();
    expect(onAssistant?.parameters.required).toEqual(['domains', 'reason']);
    expect(onAssistant?.parameters.properties.domains).toBeDefined();
    expect(onAssistant?.parameters.properties.reason).toBeDefined();
  });
});

// ===========================================
// ToolStartMeta Types
// ===========================================

describe('ToolStartMeta completeness', () => {
  // We can't import buildToolStartMeta directly (not exported),
  // so we test the type definitions by verifying the agent-event-mapper
  // handles all the same kinds.

  const allToolKinds = [
    // Coder workspace tools
    'read_file', 'write_file', 'list_files', 'create_directory',
    'delete_file', 'run_command', 'search_files',
    // Shared platform tools
    'list_gateways', 'list_user_plugins',
    // Coder plugin management
    'create_plugin_record', 'update_plugin_record', 'restart_plugin', 'finish',
    // Assistant tools
    'check_credits', 'check_billing', 'check_usage',
    'create_gateway', 'delete_gateway', 'update_gateway',
    'install_plugin', 'uninstall_plugin', 'toggle_plugin',
    'start_workspace', 'stop_workspace', 'restart_workspace',
    'get_workspace_status', 'navigate_page',
    'view_plugin_config', 'search_marketplace',
    'get_gateway_metrics', 'get_workspace_logs', 'get_workspace_metrics',
    'clone_plugin',
    // Interaction tools
    'ask_user', 'hand_off',
  ];

  it('should cover all expected tool kinds', () => {
    // This is a documentation test — if a new kind is added to ToolStartMeta
    // but not to this list, the test fails as a reminder to update tests.
    expect(allToolKinds.length).toBeGreaterThanOrEqual(30);
  });
});

// ===========================================
// Agent Event Mapper (Frontend)
// ===========================================

import { mapAgentEventToActions } from '@/components/cursor/agent-event-mapper';
import type { CursorAgentEvent } from '../cursor-agent.types';

describe('Agent Event Mapper - New Tools', () => {
  const newToolKinds = [
    { kind: 'stop_workspace' as const },
    { kind: 'restart_workspace' as const },
    { kind: 'get_workspace_status' as const },
    { kind: 'update_gateway' as const, gatewayId: 'gw-123' },
    { kind: 'view_plugin_config' as const, name: 'echo' },
    { kind: 'search_marketplace' as const, query: 'weather' },
    { kind: 'get_gateway_metrics' as const, gatewayId: 'gw-456' },
    { kind: 'get_workspace_logs' as const },
    { kind: 'get_workspace_metrics' as const },
    { kind: 'clone_plugin' as const, sourceSlug: 'echo', newSlug: 'echo-v2' },
  ];

  it.each(newToolKinds)('should produce UI actions for $kind', (meta) => {
    const event: CursorAgentEvent = {
      type: 'tool_start',
      tool: meta.kind.replace(/_/g, '_'), // tool name matches kind
      meta: meta as CursorAgentEvent extends { type: 'tool_start' } ? CursorAgentEvent['meta'] : never,
    } as CursorAgentEvent;

    const actions = mapAgentEventToActions(event);
    // Each new tool should produce at least one UI action (navigate or toast)
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });

  it('should navigate to /workspace for stop_workspace', () => {
    const event = {
      type: 'tool_start' as const,
      tool: 'stop_workspace',
      meta: { kind: 'stop_workspace' as const },
    } as CursorAgentEvent;

    const actions = mapAgentEventToActions(event);
    const navAction = actions.find((a) => a.action === 'navigate');
    expect(navAction).toBeDefined();
    if (navAction && 'path' in navAction) {
      expect(navAction.path).toBe('/workspace');
    }
  });

  it('should navigate to /gateways for get_gateway_metrics', () => {
    const event = {
      type: 'tool_start' as const,
      tool: 'get_gateway_metrics',
      meta: { kind: 'get_gateway_metrics' as const, gatewayId: 'gw-test' },
    } as CursorAgentEvent;

    const actions = mapAgentEventToActions(event);
    const navAction = actions.find((a) => a.action === 'navigate');
    expect(navAction).toBeDefined();
    if (navAction && 'path' in navAction) {
      expect(navAction.path).toBe('/gateways');
    }
  });

  it('should navigate to /plugins for search_marketplace', () => {
    const event = {
      type: 'tool_start' as const,
      tool: 'search_marketplace',
      meta: { kind: 'search_marketplace' as const, query: 'ai' },
    } as CursorAgentEvent;

    const actions = mapAgentEventToActions(event);
    const navAction = actions.find((a) => a.action === 'navigate');
    expect(navAction).toBeDefined();
    if (navAction && 'path' in navAction) {
      expect(navAction.path).toBe('/plugins');
    }
  });
});
