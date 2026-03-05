/**
 * Plugin IPC Service Tests
 *
 * Tests for IPC request handling including storage, gateway,
 * and AI operations from plugins running in workspace containers.
 *
 * @module modules/plugin/__tests__/plugin-ipc.service.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ===========================================
// Mock Dependencies
// ===========================================

const mockChildLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => mockChildLogger,
  },
  loggers: {
    server: mockChildLogger,
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    scan: vi.fn(async () => ['0', []]),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceContainer: {
      findUnique: vi.fn(),
    },
    userPlugin: {
      findFirst: vi.fn(),
    },
    gateway: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const { mockTextGeneration, mockImageGeneration, mockSpeechSynthesis } = vi.hoisted(() => ({
  mockTextGeneration: vi.fn(),
  mockImageGeneration: vi.fn(),
  mockSpeechSynthesis: vi.fn(),
}));

vi.mock('@/modules/2bot-ai-provider', () => ({
  twoBotAIProvider: {
    textGeneration: mockTextGeneration,
    imageGeneration: mockImageGeneration,
    speechSynthesis: mockSpeechSynthesis,
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
    get: vi.fn(async (key: string) => `value-${key}`),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(async () => true),
    increment: vi.fn(async () => 1),
  })),
}));

// Import after mocking
import { prisma } from '@/lib/prisma';
import type { PluginIpcRequest } from '../plugin-ipc.service';
import { pluginIpcService } from '../plugin-ipc.service';

// ===========================================
// Test Data
// ===========================================

const TEST_CONTAINER_ID = 'container-123';
const TEST_USER_ID = 'user-abc';
const TEST_ORG_ID = 'org-xyz';
const TEST_USER_PLUGIN_ID = 'up-456';

function setupContextMocks(): void {
  vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue({
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
  } as never);

  vi.mocked(prisma.userPlugin.findFirst).mockResolvedValue({
    id: TEST_USER_PLUGIN_ID,
  } as never);
}

function makeRequest(
  method: string,
  data: Record<string, unknown> = {},
): PluginIpcRequest {
  return {
    id: `req-${Date.now()}`,
    pluginFile: 'plugins/test-bot.js',
    method: method as PluginIpcRequest['method'],
    data,
  };
}

// ===========================================
// Tests
// ===========================================

describe('PluginIpcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginIpcService.clearCache();
    pluginIpcService.clearRateLimits();
    setupContextMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================
  // Context Resolution
  // ===========================================

  describe('context resolution', () => {
    it('should resolve plugin context from container and plugin file', async () => {
      const req = makeRequest('storage.get', { key: 'test' });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(true);
      expect(prisma.workspaceContainer.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_CONTAINER_ID },
        select: { userId: true, organizationId: true },
      });
    });

    it('should extract slug from plugin file path', async () => {
      const req = makeRequest('storage.get', { key: 'test' });
      req.pluginFile = 'plugins/my-cool-plugin.js';
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(prisma.userPlugin.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            plugin: { slug: 'my-cool-plugin' },
          }),
        }),
      );
    });

    it('should return error when container not found', async () => {
      vi.mocked(prisma.workspaceContainer.findUnique).mockResolvedValue(null);

      const req = makeRequest('storage.get', { key: 'test' });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Container not found');
    });

    it('should return error for unknown method', async () => {
      const req = makeRequest('unknown.method');
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown IPC method');
    });
  });

  // ===========================================
  // AI Chat (ai.chat)
  // ===========================================

  describe('ai.chat', () => {
    const validMessages = [
      { role: 'user' as const, content: 'Hello!' },
    ];

    it('should call textGeneration with correct parameters', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'Hi there!',
        model: 'gpt-4o-mini',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        creditsUsed: 0.5,
        newBalance: 99.5,
      });

      const req = makeRequest('ai.chat', {
        messages: validMessages,
        model: '2bot-ai-text-pro',
        temperature: 0.7,
      });

      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        content: 'Hi there!',
        model: 'gpt-4o-mini',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        creditsUsed: 0.5,
      });

      expect(mockTextGeneration).toHaveBeenCalledWith({
        messages: validMessages,
        model: '2bot-ai-text-pro',
        temperature: 0.7,
        maxTokens: 2048,
        userId: TEST_USER_ID,
        organizationId: TEST_ORG_ID,
        smartRouting: false,
        userPluginId: TEST_USER_PLUGIN_ID,
      });
    });

    it('should use default model when not specified', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'Response',
        model: 'model-xyz',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
        creditsUsed: 0.1,
        newBalance: 99.9,
      });

      const req = makeRequest('ai.chat', { messages: validMessages });
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(mockTextGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ model: '2bot-ai-text-lite' }),
      );
    });

    it('should cap maxTokens at 4096', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'Response',
        model: 'model-xyz',
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
        creditsUsed: 0.1,
        newBalance: 99.9,
      });

      const req = makeRequest('ai.chat', {
        messages: validMessages,
        maxTokens: 100000,
      });
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(mockTextGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 4096 }),
      );
    });

    it('should reject when messages is missing', async () => {
      const req = makeRequest('ai.chat', {});
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires "messages" array');
    });

    it('should reject when messages is empty', async () => {
      const req = makeRequest('ai.chat', { messages: [] });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires "messages" array');
    });

    it('should reject messages with invalid role', async () => {
      const req = makeRequest('ai.chat', {
        messages: [{ role: 'admin', content: 'hack' }],
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid message role');
    });

    it('should reject messages without content', async () => {
      const req = makeRequest('ai.chat', {
        messages: [{ role: 'user' }],
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('"role" and "content"');
    });

    it('should pass system and assistant messages', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'Response',
        model: 'model-xyz',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        creditsUsed: 0.3,
        newBalance: 99.7,
      });

      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Thanks' },
      ];
      const req = makeRequest('ai.chat', { messages });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(true);
      expect(mockTextGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ messages }),
      );
    });
  });

  // ===========================================
  // AI Image Generation (ai.generateImage)
  // ===========================================

  describe('ai.generateImage', () => {
    it('should call imageGeneration with correct parameters', async () => {
      mockImageGeneration.mockResolvedValue({
        images: [{ url: 'https://example.com/image.png' }],
        model: 'dall-e-3',
        creditsUsed: 5,
        newBalance: 95,
      });

      const req = makeRequest('ai.generateImage', {
        prompt: 'A sunset over the ocean',
        model: '2bot-ai-image-pro',
        size: '1024x1024',
      });

      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        images: [{ url: 'https://example.com/image.png' }],
        model: 'dall-e-3',
        creditsUsed: 5,
      });
    });

    it('should use default model when not specified', async () => {
      mockImageGeneration.mockResolvedValue({
        images: [{ url: 'https://example.com/image.png' }],
        model: 'dall-e-3',
        creditsUsed: 5,
        newBalance: 95,
      });

      const req = makeRequest('ai.generateImage', { prompt: 'A cat' });
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(mockImageGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ model: '2bot-ai-image-pro' }),
      );
    });

    it('should cap image count at 4', async () => {
      mockImageGeneration.mockResolvedValue({
        images: [],
        model: 'dall-e-3',
        creditsUsed: 20,
        newBalance: 80,
      });

      const req = makeRequest('ai.generateImage', { prompt: 'Many cats', n: 50 });
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(mockImageGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ n: 4 }),
      );
    });

    it('should reject when prompt is missing', async () => {
      const req = makeRequest('ai.generateImage', {});
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires "prompt" string');
    });

    it('should reject prompts exceeding 4000 chars', async () => {
      const req = makeRequest('ai.generateImage', {
        prompt: 'x'.repeat(4001),
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('4000 characters');
    });
  });

  // ===========================================
  // AI Speech Synthesis (ai.speak)
  // ===========================================

  describe('ai.speak', () => {
    it('should call speechSynthesis with correct parameters', async () => {
      mockSpeechSynthesis.mockResolvedValue({
        audioUrl: 'https://example.com/audio.mp3',
        audioBase64: 'base64data',
        format: 'mp3',
        characterCount: 20,
        creditsUsed: 1,
        newBalance: 99,
      });

      const req = makeRequest('ai.speak', {
        text: 'Hello from 2Bot!',
        voice: 'nova',
        format: 'opus',
      });

      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        audioUrl: 'https://example.com/audio.mp3',
        audioBase64: 'base64data',
        format: 'mp3',
        characterCount: 20,
        creditsUsed: 1,
      });
    });

    it('should use default model when not specified', async () => {
      mockSpeechSynthesis.mockResolvedValue({
        audioUrl: 'https://example.com/audio.mp3',
        format: 'mp3',
        characterCount: 5,
        creditsUsed: 0.5,
        newBalance: 99.5,
      });

      const req = makeRequest('ai.speak', { text: 'Hello' });
      await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(mockSpeechSynthesis).toHaveBeenCalledWith(
        expect.objectContaining({ model: '2bot-ai-voice-pro' }),
      );
    });

    it('should reject when text is missing', async () => {
      const req = makeRequest('ai.speak', {});
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires "text" string');
    });

    it('should reject text exceeding 4096 chars', async () => {
      const req = makeRequest('ai.speak', {
        text: 'x'.repeat(4097),
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('4096 characters');
    });
  });

  // ===========================================
  // AI Rate Limiting
  // ===========================================

  describe('AI rate limiting', () => {
    it('should allow requests within rate limit', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'OK',
        model: 'model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        creditsUsed: 0.01,
        newBalance: 99.99,
      });

      // Make several requests — should all succeed
      for (let i = 0; i < 5; i++) {
        const req = makeRequest('ai.chat', {
          messages: [{ role: 'user', content: `Msg ${i}` }],
        });
        const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);
        expect(result.success).toBe(true);
      }
    });

    it('should reject requests exceeding rate limit', async () => {
      mockTextGeneration.mockResolvedValue({
        content: 'OK',
        model: 'model',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        creditsUsed: 0.01,
        newBalance: 99.99,
      });

      // Make 30 requests (the limit)
      for (let i = 0; i < 30; i++) {
        const req = makeRequest('ai.chat', {
          messages: [{ role: 'user', content: `Msg ${i}` }],
        });
        const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);
        expect(result.success).toBe(true);
      }

      // The 31st should fail
      const req = makeRequest('ai.chat', {
        messages: [{ role: 'user', content: 'One too many' }],
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit exceeded');
    });
  });

  // ===========================================
  // AI Error Handling
  // ===========================================

  describe('AI error handling', () => {
    it('should return provider errors gracefully', async () => {
      mockTextGeneration.mockRejectedValue(new Error('Insufficient credits'));

      const req = makeRequest('ai.chat', {
        messages: [{ role: 'user', content: 'Hi' }],
      });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient credits');
    });

    it('should return image generation errors gracefully', async () => {
      mockImageGeneration.mockRejectedValue(new Error('Content filter triggered'));

      const req = makeRequest('ai.generateImage', { prompt: 'Something' });
      const result = await pluginIpcService.handleRequest(TEST_CONTAINER_ID, req);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Content filter triggered');
    });
  });
});
