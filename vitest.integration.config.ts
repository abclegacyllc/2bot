import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    testTimeout: 30000, // 30 seconds for DB operations
    hookTimeout: 30000,
    pool: 'forks', // Run tests in separate processes
    // Note: singleFork removed - not available in Vitest v4
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
