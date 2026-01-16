/**
 * Alert Types
 *
 * Types for the resource monitoring alert system.
 *
 * @module modules/alerts/alert.types
 */

// ===========================================
// Alert Type Enum
// ===========================================

export enum AlertType {
  // Resource alerts
  QUOTA_WARNING = 'quota_warning',
  QUOTA_CRITICAL = 'quota_critical',
  QUOTA_EXCEEDED = 'quota_exceeded',
  
  // Error alerts
  ERROR_RATE_HIGH = 'error_rate_high',
  WORKFLOW_FAILED = 'workflow_failed',
  CIRCUIT_OPEN = 'circuit_open',
  
  // Cost alerts
  COST_WARNING = 'cost_warning',
  COST_EXCEEDED = 'cost_exceeded',
  
  // Security alerts
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  EMERGENCY_STOP = 'emergency_stop',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// ===========================================
// Alert Configuration
// ===========================================

export interface AlertConfig {
  // Unique identifier
  id?: string;
  organizationId: string;
  
  // Resource alerts
  quotaWarningThreshold: number;   // Default: 80%
  quotaCriticalThreshold: number;  // Default: 95%
  
  // Error alerts
  errorRateThreshold: number;      // Errors per hour before alert
  consecutiveFailures: number;     // Workflow failures in a row
  
  // Cost alerts (enterprise)
  dailyCostThreshold?: number;
  monthlyCostThreshold?: number;
  
  // Notification channels
  channels: AlertChannels;
  
  // Status
  enabled: boolean;
  
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlertChannels {
  email: boolean;
  emailAddresses?: string[];  // Optional additional emails
  telegram?: string;          // Bot chat ID
  webhook?: string;           // Custom webhook URL
}

// ===========================================
// Alert Payload
// ===========================================

export interface Alert {
  id?: string;
  organizationId: string;
  type: AlertType;
  severity: AlertSeverity;
  
  // Alert details
  title: string;
  message: string;
  resource?: string;
  current?: number;
  limit?: number;
  percentage?: number;
  
  // Metadata
  metadata?: Record<string, unknown>;
  
  // Status
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  
  // Timestamps
  createdAt: Date;
  resolvedAt?: Date;
}

// ===========================================
// Alert History Entry
// ===========================================

export interface AlertHistoryEntry {
  id: string;
  organizationId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
}

// ===========================================
// API Response Types
// ===========================================

export interface AlertConfigInput {
  quotaWarningThreshold?: number;
  quotaCriticalThreshold?: number;
  errorRateThreshold?: number;
  consecutiveFailures?: number;
  dailyCostThreshold?: number;
  monthlyCostThreshold?: number;
  channels?: Partial<AlertChannels>;
  enabled?: boolean;
}

export interface AlertStats {
  total: number;
  unacknowledged: number;
  byType: Record<AlertType, number>;
  bySeverity: Record<AlertSeverity, number>;
}
