/**
 * Gateway Status Components
 *
 * Components for displaying gateway connection status
 * with color-coded badges and indicators.
 *
 * @module components/gateways/gateway-status
 */

import { cn } from "@/lib/utils";
import type { GatewayStatus } from "@prisma/client";

/**
 * Status configuration with colors and labels
 */
const STATUS_CONFIG: Record<
  GatewayStatus,
  { label: string; className: string; dotClassName: string }
> = {
  CONNECTED: {
    label: "Connected",
    className: "bg-green-500/10 text-green-400 border-green-500/20",
    dotClassName: "bg-green-500",
  },
  DISCONNECTED: {
    label: "Disconnected",
    className: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    dotClassName: "bg-slate-500",
  },
  ERROR: {
    label: "Error",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
    dotClassName: "bg-red-500",
  },
};

/**
 * Gateway Status Badge
 *
 * A small colored badge showing the gateway status.
 */
export function GatewayStatusBadge({
  status,
  showDot = true,
  size = "sm",
}: {
  status: GatewayStatus | string;
  showDot?: boolean;
  size?: "sm" | "md";
}) {
  const config = STATUS_CONFIG[status as GatewayStatus] || STATUS_CONFIG.DISCONNECTED;
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        config.className,
        sizeClasses
      )}
    >
      {showDot ? <span
          className={cn("w-1.5 h-1.5 rounded-full", config.dotClassName)}
          aria-hidden="true"
        /> : null}
      {config.label}
    </span>
  );
}

/**
 * Gateway Status Indicator
 *
 * A larger status display with optional error message and last connected time.
 */
export function GatewayStatusIndicator({
  status,
  lastConnectedAt,
  lastError,
  className,
}: {
  status: GatewayStatus | string;
  lastConnectedAt?: Date | string | null;
  lastError?: string | null;
  className?: string;
}) {
  const config = STATUS_CONFIG[status as GatewayStatus] || STATUS_CONFIG.DISCONNECTED;

  // Format last connected time
  const formatTime = (date: Date | string | null | undefined): string => {
    if (!date) return "Never connected";
    const d = new Date(date);
    return `Last connected: ${d.toLocaleString()}`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        {/* Status dot with pulse animation for connected */}
        <div className="relative">
          <span
            className={cn(
              "w-3 h-3 rounded-full block",
              config.dotClassName,
              status === "CONNECTED" && "animate-pulse"
            )}
          />
          {status === "CONNECTED" && (
            <span
              className={cn(
                "absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75",
                config.dotClassName
              )}
            />
          )}
        </div>

        <div>
          <p className={cn("font-medium", config.className.split(" ")[1])}>
            {config.label}
          </p>
          <p className="text-xs text-slate-500">{formatTime(lastConnectedAt)}</p>
        </div>
      </div>

      {/* Error message */}
      {status === "ERROR" && lastError ? <div className="bg-red-950/20 border border-red-900/30 rounded-md p-3">
          <p className="text-sm text-red-400">{lastError}</p>
        </div> : null}
    </div>
  );
}

/**
 * Inline status dot
 *
 * A minimal status indicator for tight spaces.
 */
export function StatusDot({
  status,
  size = "md",
  pulse = false,
}: {
  status: GatewayStatus | string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}) {
  const config = STATUS_CONFIG[status as GatewayStatus] || STATUS_CONFIG.DISCONNECTED;
  const sizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  return (
    <span
      className={cn(
        "rounded-full inline-block",
        config.dotClassName,
        sizeClasses[size],
        pulse && status === "CONNECTED" && "animate-pulse"
      )}
      title={config.label}
    />
  );
}
