/**
 * Integration test global setup.
 * Runs BEFORE any test file is imported so that DATABASE_URL and other env
 * vars are available when Prisma constructs its client.
 *
 * Loaded via `test.globalSetup` in `vitest.integration.config.ts`.
 */
import { config } from "dotenv";
import { resolve } from "path";

export function setup() {
  config({ path: resolve(process.cwd(), ".env.test") });
}
