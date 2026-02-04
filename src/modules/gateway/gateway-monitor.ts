/**
 * Gateway Health Monitor
 *
 * Background service that periodically tests gateway connections
 * to ensure they remain functional and updates their status.
 *
 * Runs:
 * - On gateway creation (first test)
 * - Daily for all gateways
 * - On-demand via API
 *
 * @module modules/gateway/gateway-monitor
 */

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { Gateway } from "@prisma/client";
import { gatewayRegistry } from "./gateway.registry";
import { gatewayService } from "./gateway.service";

const monitorLogger = logger.child({ module: "gateway-monitor" });

/**
 * Health check result for a gateway
 */
interface GatewayHealthResult {
  gatewayId: string;
  gatewayName: string;
  type: string;
  previousStatus: string;
  newStatus: string;
  healthy: boolean;
  latency?: number;
  error?: string;
  testedAt: Date;
}

/**
 * Gateway Health Monitor Service
 */
class GatewayHealthMonitor {
  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  /**
   * Test a single gateway's health
   */
  async testGateway(gateway: Gateway): Promise<GatewayHealthResult> {
    const startTime = Date.now();

    try {
      // Get decrypted credentials
      const credentials = gatewayService.getDecryptedCredentials(gateway);

      // Get provider
      const provider = gatewayRegistry.get(gateway.type);
      if (!provider) {
        monitorLogger.warn(
          { gatewayId: gateway.id, type: gateway.type },
          "Provider not registered for gateway type"
        );
        return {
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          type: gateway.type,
          previousStatus: gateway.status,
          newStatus: "ERROR",
          healthy: false,
          error: "Provider not registered",
          testedAt: new Date(),
        };
      }

      // Run health check with real API call
      const healthResult = await provider.checkHealth(gateway.id, credentials);
      const latency = Date.now() - startTime;

      // Determine new status
      const newStatus = healthResult.healthy ? "CONNECTED" : "ERROR";

      // Update gateway status in database
      await gatewayService.updateStatus(
        gateway.id,
        newStatus,
        healthResult.error
      );

      return {
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        type: gateway.type,
        previousStatus: gateway.status,
        newStatus,
        healthy: healthResult.healthy,
        latency: healthResult.latency ?? latency,
        error: healthResult.error,
        testedAt: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Update to ERROR status
      await gatewayService.updateStatus(gateway.id, "ERROR", errorMessage);

      return {
        gatewayId: gateway.id,
        gatewayName: gateway.name,
        type: gateway.type,
        previousStatus: gateway.status,
        newStatus: "ERROR",
        healthy: false,
        error: errorMessage,
        testedAt: new Date(),
      };
    }
  }

  /**
   * Test a newly created gateway immediately
   */
  async testNewGateway(gatewayId: string): Promise<GatewayHealthResult> {
    monitorLogger.info({ gatewayId }, "Testing newly created gateway...");

    const gateway = await prisma.gateway.findUnique({
      where: { id: gatewayId },
    });

    if (!gateway) {
      throw new Error(`Gateway ${gatewayId} not found`);
    }

    const result = await this.testGateway(gateway);

    if (result.healthy) {
      monitorLogger.info(
        { gatewayId, latency: result.latency },
        "New gateway test successful"
      );
    } else {
      monitorLogger.warn(
        { gatewayId, error: result.error },
        "New gateway test failed"
      );
    }

    return result;
  }

  /**
   * Run health checks on all gateways
   */
  async testAllGateways(): Promise<GatewayHealthResult[]> {
    monitorLogger.info("Starting health check for all gateways...");

    const gateways = await prisma.gateway.findMany();

    monitorLogger.info({ count: gateways.length }, "Found gateways to test");

    const results: GatewayHealthResult[] = [];
    let successCount = 0;
    let failureCount = 0;
    let statusChangedCount = 0;

    // Test gateways in batches to avoid overwhelming APIs
    const BATCH_SIZE = 5;
    for (let i = 0; i < gateways.length; i += BATCH_SIZE) {
      const batch = gateways.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map((gateway) => this.testGateway(gateway))
      );

      results.push(...batchResults);

      // Count results
      for (const result of batchResults) {
        if (result.healthy) {
          successCount++;
        } else {
          failureCount++;
        }
        if (result.previousStatus !== result.newStatus) {
          statusChangedCount++;
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < gateways.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    monitorLogger.info(
      {
        total: gateways.length,
        success: successCount,
        failed: failureCount,
        statusChanged: statusChangedCount,
      },
      "Gateway health check completed"
    );

    return results;
  }

  /**
   * Start periodic monitoring (daily checks)
   */
  startMonitoring(intervalMs: number = 24 * 60 * 60 * 1000): void {
    if (this.isRunning) {
      monitorLogger.warn("Gateway monitor already running");
      return;
    }

    monitorLogger.info(
      { intervalMs, intervalHours: intervalMs / (60 * 60 * 1000) },
      "Starting gateway health monitor"
    );

    this.isRunning = true;

    // Run immediately on start
    this.testAllGateways().catch((error) => {
      monitorLogger.error({ error }, "Initial gateway health check failed");
    });

    // Then run periodically
    this.monitorInterval = setInterval(() => {
      this.testAllGateways().catch((error) => {
        monitorLogger.error({ error }, "Periodic gateway health check failed");
      });
    }, intervalMs);
  }

  /**
   * Stop periodic monitoring
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      return;
    }

    monitorLogger.info("Stopping gateway health monitor");

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
  }

  /**
   * Get monitor status
   */
  getStatus(): { running: boolean; nextCheck?: Date } {
    return {
      running: this.isRunning,
      // Calculate next check time if running
      nextCheck: this.isRunning ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
    };
  }
}

/**
 * Singleton instance
 */
export const gatewayMonitor = new GatewayHealthMonitor();

/**
 * Auto-start monitoring in production
 */
if (process.env.NODE_ENV === "production") {
  // Start daily monitoring (24 hours)
  gatewayMonitor.startMonitoring();
  
  monitorLogger.info("Gateway health monitoring enabled for production");
}
