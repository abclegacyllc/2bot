/**
 * Workflow Worker Entry Point (Phase 5.5)
 *
 * Dedicated process that consumes the BullMQ workflow queue and runs each
 * job through the existing workflow executor. Run alongside the API server,
 * scaled horizontally as throughput demands.
 *
 *   npm run worker:start
 *   docker-compose up --scale workflow-worker=N
 */

import { closeWorkflowQueue } from "@/modules/workflow/workflow-queue";
import { createWorkflowWorker } from "@/modules/workflow/workflow-worker";

import { logger } from "@/lib/logger";

const log = logger.child({ module: "workflow-worker-entrypoint" });

async function main(): Promise<void> {
  const worker = createWorkflowWorker();

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "Shutting down workflow worker");
    try {
      await worker.close();
      await closeWorkflowQueue();
    } catch (err) {
      log.error({ err }, "Error during workflow worker shutdown");
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  log.info("Workflow worker entry point ready");
}

main().catch((err) => {
  log.error({ err }, "Workflow worker entry point crashed");
  process.exit(1);
});
