/**
 * Alert Service
 *
 * Monitors resource usage and sends alerts when thresholds are exceeded.
 * Supports email, Telegram, and webhook notifications.
 *
 * @module modules/alerts/alert.service
 */

import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { resourceService } from '@/modules/resource';
import type { ServiceContext } from '@/shared/types/context';
import {
  AlertSeverity,
  AlertType,
  type Alert,
  type AlertConfig,
  type AlertConfigInput,
  type AlertHistoryEntry,
  type AlertStats,
} from './alert.types';

const log = logger.child({ module: 'alerts' });

// Redis keys for alert config and cooldowns
const REDIS_KEYS = {
  ALERT_CONFIG: 'alert:config',
  ALERT_COOLDOWN: 'alert:cooldown',
} as const;

// Default alert configuration
const DEFAULT_ALERT_CONFIG: Omit<AlertConfig, 'organizationId'> = {
  quotaWarningThreshold: 80,
  quotaCriticalThreshold: 95,
  errorRateThreshold: 10,
  consecutiveFailures: 3,
  channels: {
    email: true,
  },
  enabled: true,
};

// Alert cooldown in seconds (prevent spam)
const ALERT_COOLDOWN_SECONDS = 3600; // 1 hour

// ===========================================
// Alert Service
// ===========================================

class AlertServiceImpl {
  /**
   * Check all alert thresholds for an organization
   * Should be called periodically by a cron job
   */
  async checkAlerts(organizationId: string): Promise<Alert[]> {
    const config = await this.getAlertConfig(organizationId);
    
    if (!config.enabled) {
      return [];
    }
    
    const alerts: Alert[] = [];
    
    // Build context for quota check
    const ctx: ServiceContext = {
      userId: 'system',
      userRole: 'MEMBER',
      userPlan: 'FREE',
      contextType: 'organization',
      organizationId,
      effectivePlan: 'FREE',
      isAdmin: () => false,
      isSuperAdmin: () => false,
      isOrgContext: () => true,
      isPersonalContext: () => false,
      getOwnerId: () => organizationId,
      canDo: () => false,
      getPermissions: () => [],
    };
    
    // Get resource status using new hierarchical types
    const status = await resourceService.getResourceStatus(ctx);
    
    // Only process org context
    if (status.context !== 'organization') {
      return [];
    }
    
    // Check each resource pool
    const resources = [
      { 
        name: 'Gateways', 
        used: status.automation.gateways.count.used,
        limit: status.automation.gateways.count.limit,
        percentage: status.automation.gateways.count.percentage,
        isUnlimited: status.automation.gateways.count.isUnlimited,
      },
      { 
        name: 'Workflows', 
        used: status.automation.workflows.count.used,
        limit: status.automation.workflows.count.limit,
        percentage: status.automation.workflows.count.percentage,
        isUnlimited: status.automation.workflows.count.isUnlimited,
      },
      { 
        name: 'Plugins', 
        used: status.automation.plugins.count.used,
        limit: status.automation.plugins.count.limit,
        percentage: status.automation.plugins.count.percentage,
        isUnlimited: status.automation.plugins.count.isUnlimited,
      },
      { 
        name: 'Seats', 
        used: status.billing.subscription.seats.used,
        limit: status.billing.subscription.seats.limit,
        percentage: status.billing.subscription.seats.percentage,
        isUnlimited: status.billing.subscription.seats.isUnlimited,
      },
    ];
    
    for (const resource of resources) {
      if (resource.isUnlimited) continue;
      
      const { percentage, used, limit } = resource;
      
      if (percentage >= 100) {
        const alert = await this.createAlert(organizationId, {
          type: AlertType.QUOTA_EXCEEDED,
          severity: AlertSeverity.CRITICAL,
          title: `${resource.name} Quota Exceeded`,
          message: `Your organization has exceeded the ${resource.name.toLowerCase()} quota: ${used}/${limit}`,
          resource: resource.name,
          current: used,
          limit: limit ?? undefined,
          percentage,
        });
        if (alert) alerts.push(alert);
      } else if (percentage >= config.quotaCriticalThreshold) {
        const alert = await this.createAlert(organizationId, {
          type: AlertType.QUOTA_CRITICAL,
          severity: AlertSeverity.CRITICAL,
          title: `${resource.name} Quota Critical`,
          message: `Your organization is at ${percentage}% of ${resource.name.toLowerCase()} quota: ${used}/${limit}`,
          resource: resource.name,
          current: used,
          limit: limit ?? undefined,
          percentage,
        });
        if (alert) alerts.push(alert);
      } else if (percentage >= config.quotaWarningThreshold) {
        const alert = await this.createAlert(organizationId, {
          type: AlertType.QUOTA_WARNING,
          severity: AlertSeverity.WARNING,
          title: `${resource.name} Quota Warning`,
          message: `Your organization is at ${percentage}% of ${resource.name.toLowerCase()} quota: ${used}/${limit}`,
          resource: resource.name,
          current: used,
          limit: limit ?? undefined,
          percentage,
        });
        if (alert) alerts.push(alert);
      }
    }
    
    return alerts;
  }

  /**
   * Create and send an alert (with cooldown check)
   */
  async createAlert(
    organizationId: string,
    alertData: Omit<Alert, 'id' | 'organizationId' | 'acknowledged' | 'createdAt'>
  ): Promise<Alert | null> {
    // Check cooldown to prevent spam
    const cooldownKey = `${REDIS_KEYS.ALERT_COOLDOWN}:${organizationId}:${alertData.type}:${alertData.resource || 'general'}`;
    const inCooldown = await redis.get(cooldownKey);
    
    if (inCooldown) {
      log.debug({ organizationId, type: alertData.type }, 'Alert in cooldown, skipping');
      return null;
    }
    
    // Create alert record
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId,
      ...alertData,
      acknowledged: false,
      createdAt: new Date(),
    };
    
    // Store alert in database
    await prisma.alertHistory.create({
      data: {
        id: alert.id,
        organizationId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        resource: alert.resource,
        currentValue: alert.current,
        limitValue: alert.limit,
        percentage: alert.percentage,
        metadata: alert.metadata ? JSON.stringify(alert.metadata) : null,
        acknowledged: false,
      },
    });
    
    // Set cooldown
    await redis.setex(cooldownKey, ALERT_COOLDOWN_SECONDS, '1');
    
    // Send notifications
    await this.sendAlertNotifications(organizationId, alert);
    
    log.info(
      { organizationId, alertId: alert.id, type: alert.type, severity: alert.severity },
      'Alert created and sent'
    );
    
    return alert;
  }

  /**
   * Send alert via configured channels
   */
  async sendAlertNotifications(organizationId: string, alert: Alert): Promise<void> {
    const config = await this.getAlertConfig(organizationId);
    
    // Get organization details for notification
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        memberships: {
          where: { role: 'ORG_OWNER', status: 'ACTIVE' },
          include: { user: { select: { email: true, name: true } } },
        },
      },
    });
    
    if (!org) {
      log.warn({ organizationId }, 'Organization not found for alert notification');
      return;
    }
    
    // Email notification
    if (config.channels.email) {
      const emails = new Set<string>();
      
      // Add owner emails
      for (const membership of org.memberships) {
        if (membership.user.email) {
          emails.add(membership.user.email);
        }
      }
      
      // Add additional configured emails
      if (config.channels.emailAddresses) {
        for (const email of config.channels.emailAddresses) {
          emails.add(email);
        }
      }
      
      for (const email of emails) {
        await this.sendEmailAlert(email, org.name, alert);
      }
    }
    
    // Telegram notification
    if (config.channels.telegram) {
      await this.sendTelegramAlert(config.channels.telegram, org.name, alert);
    }
    
    // Webhook notification
    if (config.channels.webhook) {
      await this.sendWebhookAlert(config.channels.webhook, organizationId, alert);
    }
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(email: string, orgName: string, alert: Alert): Promise<void> {
    try {
      const severityEmoji = {
        [AlertSeverity.INFO]: 'ℹ️',
        [AlertSeverity.WARNING]: '⚠️',
        [AlertSeverity.CRITICAL]: '🚨',
      };
      
      await sendEmail({
        to: email,
        subject: `${severityEmoji[alert.severity]} ${alert.title} - ${orgName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${alert.severity === 'critical' ? '#fee2e2' : alert.severity === 'warning' ? '#fef3c7' : '#dbeafe'}; padding: 20px; border-radius: 8px;">
              <h2 style="margin: 0 0 10px 0; color: #1f2937;">${severityEmoji[alert.severity]} ${alert.title}</h2>
              <p style="margin: 0; color: #4b5563;">${alert.message}</p>
            </div>
            
            ${alert.resource ? `
            <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
              <p style="margin: 0; color: #6b7280;"><strong>Resource:</strong> ${alert.resource}</p>
              ${alert.current !== undefined ? `<p style="margin: 5px 0 0 0; color: #6b7280;"><strong>Current:</strong> ${alert.current}</p>` : ''}
              ${alert.limit !== undefined ? `<p style="margin: 5px 0 0 0; color: #6b7280;"><strong>Limit:</strong> ${alert.limit}</p>` : ''}
              ${alert.percentage !== undefined ? `<p style="margin: 5px 0 0 0; color: #6b7280;"><strong>Usage:</strong> ${alert.percentage}%</p>` : ''}
            </div>
            ` : ''}
            
            <p style="margin-top: 20px; color: #9ca3af; font-size: 12px;">
              This is an automated alert from 2Bot. <a href="#">Manage alert settings</a>
            </p>
          </div>
        `,
        text: `${alert.title}\n\n${alert.message}${alert.resource ? `\n\nResource: ${alert.resource}\nUsage: ${alert.percentage}%` : ''}`,
      });
      
      log.debug({ email, alertId: alert.id }, 'Email alert sent');
    } catch (err) {
      log.error({ err, email, alertId: alert.id }, 'Failed to send email alert');
    }
  }

  /**
   * Send Telegram alert
   */
  private async sendTelegramAlert(chatId: string, orgName: string, alert: Alert): Promise<void> {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        log.warn('Telegram bot token not configured');
        return;
      }
      
      const severityEmoji = {
        [AlertSeverity.INFO]: 'ℹ️',
        [AlertSeverity.WARNING]: '⚠️',
        [AlertSeverity.CRITICAL]: '🚨',
      };
      
      const message = `
${severityEmoji[alert.severity]} *${alert.title}*

${alert.message}

${alert.resource ? `📊 *Resource:* ${alert.resource}` : ''}
${alert.percentage !== undefined ? `📈 *Usage:* ${alert.percentage}%` : ''}

_Organization: ${orgName}_
      `.trim();
      
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
      
      log.debug({ chatId, alertId: alert.id }, 'Telegram alert sent');
    } catch (err) {
      log.error({ err, chatId, alertId: alert.id }, 'Failed to send Telegram alert');
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(webhookUrl: string, organizationId: string, alert: Alert): Promise<void> {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'alert',
          organizationId,
          alert: {
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title,
            message: alert.message,
            resource: alert.resource,
            current: alert.current,
            limit: alert.limit,
            percentage: alert.percentage,
            createdAt: alert.createdAt.toISOString(),
          },
        }),
      });
      
      log.debug({ webhookUrl, alertId: alert.id }, 'Webhook alert sent');
    } catch (err) {
      log.error({ err, webhookUrl, alertId: alert.id }, 'Failed to send webhook alert');
    }
  }

  /**
   * Get alert configuration for organization
   */
  async getAlertConfig(organizationId: string): Promise<AlertConfig> {
    // Check Redis cache first
    const cacheKey = `${REDIS_KEYS.ALERT_CONFIG}:${organizationId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Check database
    const dbConfig = await prisma.alertConfig.findUnique({
      where: { organizationId },
    });
    
    if (dbConfig) {
      const config: AlertConfig = {
        id: dbConfig.id,
        organizationId: dbConfig.organizationId,
        quotaWarningThreshold: dbConfig.quotaWarningThreshold,
        quotaCriticalThreshold: dbConfig.quotaCriticalThreshold,
        errorRateThreshold: dbConfig.errorRateThreshold,
        consecutiveFailures: dbConfig.consecutiveFailures,
        dailyCostThreshold: dbConfig.dailyCostThreshold ?? undefined,
        monthlyCostThreshold: dbConfig.monthlyCostThreshold ?? undefined,
        channels: dbConfig.channels as unknown as AlertConfig['channels'],
        enabled: dbConfig.enabled,
        createdAt: dbConfig.createdAt,
        updatedAt: dbConfig.updatedAt,
      };
      
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(config));
      
      return config;
    }
    
    // Return defaults
    return {
      ...DEFAULT_ALERT_CONFIG,
      organizationId,
    };
  }

  /**
   * Update alert configuration
   */
  async updateAlertConfig(
    ctx: ServiceContext,
    organizationId: string,
    input: AlertConfigInput
  ): Promise<AlertConfig> {
    const existing = await this.getAlertConfig(organizationId);
    
    const channelsData = input.channels 
      ? { ...existing.channels, ...input.channels }
      : existing.channels;
    
    const config = await prisma.alertConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        quotaWarningThreshold: input.quotaWarningThreshold ?? existing.quotaWarningThreshold,
        quotaCriticalThreshold: input.quotaCriticalThreshold ?? existing.quotaCriticalThreshold,
        errorRateThreshold: input.errorRateThreshold ?? existing.errorRateThreshold,
        consecutiveFailures: input.consecutiveFailures ?? existing.consecutiveFailures,
        dailyCostThreshold: input.dailyCostThreshold,
        monthlyCostThreshold: input.monthlyCostThreshold,
        channels: JSON.parse(JSON.stringify(channelsData)),
        enabled: input.enabled ?? existing.enabled,
      },
      update: {
        quotaWarningThreshold: input.quotaWarningThreshold ?? existing.quotaWarningThreshold,
        quotaCriticalThreshold: input.quotaCriticalThreshold ?? existing.quotaCriticalThreshold,
        errorRateThreshold: input.errorRateThreshold ?? existing.errorRateThreshold,
        consecutiveFailures: input.consecutiveFailures ?? existing.consecutiveFailures,
        dailyCostThreshold: input.dailyCostThreshold,
        monthlyCostThreshold: input.monthlyCostThreshold,
        channels: JSON.parse(JSON.stringify(channelsData)),
        enabled: input.enabled ?? existing.enabled,
      },
    });
    
    // Invalidate cache
    const cacheKey = `${REDIS_KEYS.ALERT_CONFIG}:${organizationId}`;
    await redis.del(cacheKey);
    
    log.info({ organizationId, updatedBy: ctx.userId }, 'Alert config updated');
    
    return {
      id: config.id,
      organizationId: config.organizationId,
      quotaWarningThreshold: config.quotaWarningThreshold,
      quotaCriticalThreshold: config.quotaCriticalThreshold,
      errorRateThreshold: config.errorRateThreshold,
      consecutiveFailures: config.consecutiveFailures,
      dailyCostThreshold: config.dailyCostThreshold ?? undefined,
      monthlyCostThreshold: config.monthlyCostThreshold ?? undefined,
      channels: config.channels as unknown as AlertConfig['channels'],
      enabled: config.enabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Get alert history for organization
   */
  async getAlertHistory(
    organizationId: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: AlertType;
      severity?: AlertSeverity;
      acknowledged?: boolean;
    }
  ): Promise<AlertHistoryEntry[]> {
    const where: Record<string, unknown> = { organizationId };
    
    if (options?.type) where.type = options.type;
    if (options?.severity) where.severity = options.severity;
    if (options?.acknowledged !== undefined) where.acknowledged = options.acknowledged;
    
    const alerts = await prisma.alertHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    
    return alerts.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      type: a.type as AlertType,
      severity: a.severity as AlertSeverity,
      title: a.title,
      message: a.message,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt ?? undefined,
      acknowledged: a.acknowledged,
    }));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    userId: string
  ): Promise<void> {
    await prisma.alertHistory.update({
      where: { id: alertId },
      data: {
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });
    
    log.info({ alertId, acknowledgedBy: userId }, 'Alert acknowledged');
  }

  /**
   * Get alert stats for organization
   */
  async getAlertStats(organizationId: string): Promise<AlertStats> {
    const alerts = await prisma.alertHistory.findMany({
      where: { organizationId },
      select: { type: true, severity: true, acknowledged: true },
    });
    
    const stats: AlertStats = {
      total: alerts.length,
      unacknowledged: alerts.filter((a) => !a.acknowledged).length,
      byType: {} as Record<AlertType, number>,
      bySeverity: {} as Record<AlertSeverity, number>,
    };
    
    for (const alert of alerts) {
      const type = alert.type as AlertType;
      const severity = alert.severity as AlertSeverity;
      
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Check alerts for all organizations
   * Should be called by a cron job every 5-15 minutes
   */
  async checkAllOrganizationAlerts(): Promise<number> {
    const orgs = await prisma.organization.findMany({
      select: { id: true },
    });
    
    let alertCount = 0;
    
    for (const org of orgs) {
      try {
        const alerts = await this.checkAlerts(org.id);
        alertCount += alerts.length;
      } catch (err) {
        log.error({ err, organizationId: org.id }, 'Failed to check alerts for org');
      }
    }
    
    log.info({ organizationCount: orgs.length, alertCount }, 'Completed alert check cycle');
    return alertCount;
  }
}

// Export singleton instance
export const alertService = new AlertServiceImpl();
