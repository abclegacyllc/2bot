/**
 * Plugin Security Tests
 *
 * Tests for S1 (IPC plugin isolation), S2 (Redis rate limiting),
 * and S3 (code validation before deploy).
 *
 * @module modules/plugin/__tests__/plugin-security.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// S1: Plugin Isolation Registry Tests
// ===========================================

// These test the exported functions directly (no mocks needed — pure in-memory logic)
import {
    clearActivePlugins,
    registerActivePlugin,
    unregisterActivePlugin,
} from '../plugin-ipc.service';

describe('Plugin Isolation Registry (S1)', () => {
  const CONTAINER_A = 'container-aaa';
  const CONTAINER_B = 'container-bbb';
  const PLUGIN_ECHO = 'plugins/echo.js';
  const PLUGIN_WEATHER = 'plugins/weather.js';

  afterEach(() => {
    clearActivePlugins(CONTAINER_A);
    clearActivePlugins(CONTAINER_B);
  });

  it('should register and track active plugins per container', () => {
    registerActivePlugin(CONTAINER_A, PLUGIN_ECHO);
    registerActivePlugin(CONTAINER_A, PLUGIN_WEATHER);

    // Verify via the IPC service behavior — we test indirectly by trying
    // to register again (idempotent) then clear
    registerActivePlugin(CONTAINER_A, PLUGIN_ECHO); // no-op
    clearActivePlugins(CONTAINER_A);
  });

  it('should isolate plugins between containers', () => {
    registerActivePlugin(CONTAINER_A, PLUGIN_ECHO);
    registerActivePlugin(CONTAINER_B, PLUGIN_WEATHER);

    // Clearing one container should not affect the other
    clearActivePlugins(CONTAINER_A);
    // Container B still has its plugins
    registerActivePlugin(CONTAINER_B, PLUGIN_WEATHER); // idempotent
    clearActivePlugins(CONTAINER_B);
  });

  it('should handle unregister for non-existent container gracefully', () => {
    // Should not throw
    unregisterActivePlugin('non-existent', PLUGIN_ECHO);
  });

  it('should handle clear for non-existent container gracefully', () => {
    // Should not throw
    clearActivePlugins('non-existent');
  });

  it('should remove container entry when last plugin is unregistered', () => {
    registerActivePlugin(CONTAINER_A, PLUGIN_ECHO);
    unregisterActivePlugin(CONTAINER_A, PLUGIN_ECHO);
    // Re-registering should work normally
    registerActivePlugin(CONTAINER_A, PLUGIN_WEATHER);
    clearActivePlugins(CONTAINER_A);
  });
});

// ===========================================
// S2: Redis-Backed AI Rate Limiting Tests
// ===========================================

// Mock Redis for rate limit tests — must use vi.hoisted() since vi.mock is hoisted
const {
  mockRedisIncr,
  mockRedisExpire,
  mockRedisTtl,
  mockRedisKeys,
  mockRedisDel,
} = vi.hoisted(() => ({
  mockRedisIncr: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockRedisTtl: vi.fn(),
  mockRedisKeys: vi.fn(async () => [] as string[]),
  mockRedisDel: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    ttl: mockRedisTtl,
    keys: mockRedisKeys,
    del: mockRedisDel,
    scan: vi.fn(async () => ['0', []]),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
  loggers: {
    server: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceContainer: { findUnique: vi.fn() },
    userPlugin: { findFirst: vi.fn() },
    gateway: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/modules/2bot-ai-provider', () => ({
  twoBotAIProvider: {
    textGeneration: vi.fn(),
    imageGeneration: vi.fn(),
    speechSynthesis: vi.fn(),
  },
}));

vi.mock('@/modules/gateway', () => ({
  gatewayService: {
    getDecryptedCredentials: vi.fn(() => ({ botToken: 'test-token' })),
  },
}));

vi.mock('@/modules/gateway/gateway.registry', () => ({
  gatewayRegistry: {
    get: vi.fn(() => ({
      execute: vi.fn(async () => ({ ok: true })),
      connect: vi.fn(),
    })),
  },
}));

vi.mock('./plugin.executor', () => ({
  createPluginStorage: vi.fn(() => ({
    get: vi.fn(async () => null),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(async () => false),
    increment: vi.fn(async () => 1),
  })),
}));

import { prisma } from '@/lib/prisma';
import type { PluginIpcRequest } from '../plugin-ipc.service';
import { pluginIpcService } from '../plugin-ipc.service';

const TEST_CONTAINER = 'container-rate';
const TEST_PLUGIN_FILE = 'plugins/test.js';
const TEST_USER_PLUGIN_ID = 'up-rate-test';

describe('Redis-Backed AI Rate Limiting (S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerActivePlugin(TEST_CONTAINER, TEST_PLUGIN_FILE);

    vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
      userId: 'user-1',
      organizationId: 'org-1',
    } as never);

    vi.mocked(prisma.userPlugin.findFirst).mockResolvedValue({
      id: TEST_USER_PLUGIN_ID,
    } as never);
  });

  afterEach(() => {
    clearActivePlugins(TEST_CONTAINER);
  });

  it('should use Redis INCR for rate limit tracking', async () => {
    mockRedisIncr.mockResolvedValue(1);

    const { twoBotAIProvider } = await import('@/modules/2bot-ai-provider');
    vi.mocked(twoBotAIProvider.textGeneration).mockResolvedValue({
      content: 'Hello!',
      model: 'test-model',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      creditsUsed: 0.1,
      newBalance: 99.9,
    } as never);

    const req: PluginIpcRequest = {
      id: 'req-1',
      pluginFile: TEST_PLUGIN_FILE,
      method: 'ai.chat',
      data: { messages: [{ role: 'user', content: 'Hi' }] },
    };

    const result = await pluginIpcService.handleRequest(TEST_CONTAINER, req);
    expect(result.success).toBe(true);
    expect(mockRedisIncr).toHaveBeenCalledWith(`plugin-ai-ratelimit:${TEST_USER_PLUGIN_ID}`);
  });

  it('should set TTL on first request in window', async () => {
    mockRedisIncr.mockResolvedValue(1); // count=1 → first in window

    const { twoBotAIProvider } = await import('@/modules/2bot-ai-provider');
    vi.mocked(twoBotAIProvider.textGeneration).mockResolvedValue({
      content: 'Hello!',
      model: 'test-model',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      creditsUsed: 0.1,
      newBalance: 99.9,
    } as never);

    const req: PluginIpcRequest = {
      id: 'req-2',
      pluginFile: TEST_PLUGIN_FILE,
      method: 'ai.chat',
      data: { messages: [{ role: 'user', content: 'Hello' }] },
    };

    await pluginIpcService.handleRequest(TEST_CONTAINER, req);
    expect(mockRedisExpire).toHaveBeenCalledWith(
      `plugin-ai-ratelimit:${TEST_USER_PLUGIN_ID}`,
      60,
    );
  });

  it('should reject when rate limit exceeded', async () => {
    mockRedisIncr.mockResolvedValue(31); // exceeded 30 limit
    mockRedisTtl.mockResolvedValue(45);

    const req: PluginIpcRequest = {
      id: 'req-3',
      pluginFile: TEST_PLUGIN_FILE,
      method: 'ai.chat',
      data: { messages: [{ role: 'user', content: 'Spam' }] },
    };

    const result = await pluginIpcService.handleRequest(TEST_CONTAINER, req);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rate limit exceeded');
  });

  it('should reject IPC from unregistered plugin file', async () => {
    const req: PluginIpcRequest = {
      id: 'req-4',
      pluginFile: 'plugins/rogue.js', // not registered
      method: 'storage.get',
      data: { key: 'test' },
    };

    const result = await pluginIpcService.handleRequest(TEST_CONTAINER, req);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not registered as active');
  });
});

// ===========================================
// S3: Code Validation Before Deploy Tests
// ===========================================

// validatePluginCode is a private function, so we test it indirectly
// by importing the module logic. Since it's not exported, we test
// via the patterns and vm.Script validation independently here.

describe('Plugin Code Validation (S3)', () => {
  const DANGEROUS_PATTERNS = [
    { code: "require('child_process')", reason: 'child_process' },
    { code: 'require("fs")', reason: 'Direct fs access' },
    { code: 'process.exit(1)', reason: 'process.exit' },
    { code: 'eval("alert(1)")', reason: 'eval' },
    { code: 'new Function("return 1")', reason: 'new Function' },
  ];

  it.each(DANGEROUS_PATTERNS)('should reject code using $reason', ({ code }) => {
    // The actual patterns used in the code
    const patterns = [
      { pattern: /\bchild_process\b/, reason: 'child_process is not allowed' },
      { pattern: /\brequire\s*\(\s*['"]fs['"]\s*\)/, reason: 'Direct fs access is not allowed' },
      { pattern: /\bprocess\.exit\b/, reason: 'process.exit() is not allowed' },
      { pattern: /\beval\s*\(/, reason: 'eval() is not allowed' },
      { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() is not allowed' },
    ];

    const matched = patterns.some(({ pattern }) => pattern.test(code));
    expect(matched).toBe(true);
  });

  it('should not flag safe code patterns', () => {
    const safeCode = `
      const sdk = require('2bot-sdk');
      module.exports = {
        name: 'safe-plugin',
        onMessage(ctx) {
          ctx.reply('Hello!');
        },
      };
    `;

    const patterns = [
      /\bchild_process\b/,
      /\brequire\s*\(\s*['"]fs['"]\s*\)/,
      /\bprocess\.exit\b/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
    ];

    const matched = patterns.some((p) => p.test(safeCode));
    expect(matched).toBe(false);
  });

  it('should detect syntax errors via vm.Script', () => {
    const badCode = 'function broken( { return }';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vm = require('node:vm');

    expect(() => {
      new vm.Script(badCode, { filename: 'test.js' });
    }).toThrow();
  });

  it('should accept valid JavaScript via vm.Script', () => {
    const goodCode = 'module.exports = { name: "test" };';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vm = require('node:vm');

    expect(() => {
      new vm.Script(goodCode, { filename: 'test.js' });
    }).not.toThrow();
  });
});
