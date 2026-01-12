#!/usr/bin/env tsx
/**
 * Standalone Express server entry point
 * Run with: npx tsx src/server/start.ts
 * Or via npm: npm run server
 */

import { createApp, startServer } from "./app";

const app = createApp();
startServer(app);
