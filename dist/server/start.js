#!/usr/bin/env tsx
"use strict";
/**
 * Standalone Express server entry point
 * Run with: npx tsx src/server/start.ts
 * Or via npm: npm run server
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from .env.local and .env
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env.local") });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env") });
const app_1 = require("./app");
const init_providers_1 = require("./init-providers");
// Initialize gateway providers before starting server
(0, init_providers_1.initializeGatewayProviders)();
const app = (0, app_1.createApp)();
(0, app_1.startServer)(app);
//# sourceMappingURL=start.js.map