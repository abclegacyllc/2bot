#!/usr/bin/env tsx
/**
 * Standalone Express server entry point
 * Run with: npx tsx src/server/start.ts
 * Or via npm: npm run server
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createApp, startServer } from "./app";
import { initializeGatewayProviders } from "./init-providers";

// Initialize gateway providers before starting server
initializeGatewayProviders();

const app = createApp();
startServer(app);
