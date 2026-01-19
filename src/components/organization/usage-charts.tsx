"use client";

/**
 * Usage Charts Component
 *
 * Displays line charts for API calls, workflow runs, plugin executions,
 * and error rate over time. Uses simple CSS-based charts.
 *
 * @module components/organization/usage-charts
 */

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

// ===========================================
// Types
// ===========================================

export interface UsageDataPoint {
  periodStart: string;
  apiCalls: number;
  workflowRuns: number;
  pluginExecutions: number;
  storageUsed: number;
  errors: number;
}

interface UsageChartsProps {
  data: UsageDataPoint[];
  period: "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";
}

// ===========================================
// Simple Bar Chart Component
// ===========================================

interface BarChartProps {
  data: { label: string; value: number }[];
  maxValue: number;
  color: string;
  formatValue?: (v: number) => string;
}

function BarChart({ data, maxValue, color, formatValue = (v) => v.toString() }: BarChartProps) {
  const effectiveMax = maxValue || 1; // Prevent division by zero

  return (
    <div className="space-y-2">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 truncate">{item.label}</span>
          <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
            <div
              className={`h-full ${color} transition-all duration-300`}
              style={{ width: `${Math.min(100, (item.value / effectiveMax) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-16 text-right">{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ===========================================
// Line Chart (CSS-based)
// ===========================================

interface LineChartProps {
  data: number[];
  labels: string[];
  color: string;
  height?: number;
}

function LineChart({ data, labels, color, height = 200 }: LineChartProps) {
  const maxValue = Math.max(...data, 1);
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1 || 1)) * 100,
    y: 100 - (v / maxValue) * 100,
    value: v,
    label: labels[i],
  }));

  return (
    <div className="relative" style={{ height }}>
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-muted-foreground">
        <span>{maxValue.toLocaleString()}</span>
        <span>{Math.round(maxValue / 2).toLocaleString()}</span>
        <span>0</span>
      </div>
      
      {/* Chart area */}
      <div className="ml-14 relative h-full border-l border-b border-border">
        {/* Grid lines */}
        <div className="absolute inset-0">
          <div className="absolute w-full h-px bg-muted top-1/4" />
          <div className="absolute w-full h-px bg-muted top-1/2" />
          <div className="absolute w-full h-px bg-muted top-3/4" />
        </div>
        
        {/* Data points and lines */}
        <svg className="absolute inset-0 w-full h-full overflow-visible">
          {/* Line */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={points.map((p) => `${p.x}%,${p.y}%`).join(" ")}
          />
          
          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={`${p.x}%`}
                cy={`${p.y}%`}
                r="4"
                fill={color}
                className="cursor-pointer"
              />
              {/* Tooltip on hover */}
              <title>{`${p.label}: ${p.value.toLocaleString()}`}</title>
            </g>
          ))}
        </svg>
        
        {/* X-axis labels */}
        <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-muted-foreground">
          {labels.length <= 12 ? (
            labels.map((label, i) => (
              <span key={i} className="truncate">{label}</span>
            ))
          ) : (
            // Show only first, middle, and last for many data points
            <>
              <span>{labels[0]}</span>
              <span>{labels[Math.floor(labels.length / 2)]}</span>
              <span>{labels[labels.length - 1]}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function UsageCharts({ data, period }: UsageChartsProps) {
  // Format labels based on period
  const formatLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    switch (period) {
      case "HOURLY":
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      case "DAILY":
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      case "WEEKLY":
        return `Week ${Math.ceil(date.getDate() / 7)}`;
      case "MONTHLY":
        return date.toLocaleDateString([], { month: "short", year: "2-digit" });
      default:
        return dateStr;
    }
  };

  const labels = data.map((d) => formatLabel(d.periodStart));
  const apiCallsData = data.map((d) => d.apiCalls);
  const workflowData = data.map((d) => d.workflowRuns);
  const pluginData = data.map((d) => d.pluginExecutions);
  const errorData = data.map((d) => d.errors);

  // For bar chart view (aggregated)
  const barData = data.slice(-10).map((d) => ({
    label: formatLabel(d.periodStart),
    value: d.apiCalls,
  }));

  return (
    <div className="space-y-6">
      {/* API Calls Chart */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground">API Calls</CardTitle>
        </CardHeader>
        <CardContent className="pb-8">
          {data.length > 1 ? (
            <LineChart
              data={apiCallsData}
              labels={labels}
              color="#3b82f6"
              height={200}
            />
          ) : (
            <BarChart
              data={barData}
              maxValue={Math.max(...barData.map((d) => d.value), 1)}
              color="bg-blue-500"
            />
          )}
        </CardContent>
      </Card>

      {/* Workflow & Plugin Charts - Side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">Workflow Runs</CardTitle>
          </CardHeader>
          <CardContent className="pb-8">
            {data.length > 1 ? (
              <LineChart
                data={workflowData}
                labels={labels}
                color="#22c55e"
                height={150}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Insufficient data for chart
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50">
          <CardHeader>
            <CardTitle className="text-foreground">Plugin Executions</CardTitle>
          </CardHeader>
          <CardContent className="pb-8">
            {data.length > 1 ? (
              <LineChart
                data={pluginData}
                labels={labels}
                color="#a855f7"
                height={150}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Insufficient data for chart
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Rate Chart */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            Error Rate
            {errorData.some((e) => e > 0) && (
              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                Errors detected
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-8">
          {data.length > 1 ? (
            <LineChart
              data={errorData}
              labels={labels}
              color="#ef4444"
              height={150}
            />
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {errorData.some((e) => e > 0) 
                ? `${errorData.reduce((a, b) => a + b, 0)} errors in period`
                : "No errors recorded"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card className="border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-foreground">Period Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-muted-foreground">Period</th>
                  <th className="text-right py-2 text-muted-foreground">API Calls</th>
                  <th className="text-right py-2 text-muted-foreground">Workflows</th>
                  <th className="text-right py-2 text-muted-foreground">Plugins</th>
                  <th className="text-right py-2 text-muted-foreground">Storage (MB)</th>
                  <th className="text-right py-2 text-muted-foreground">Errors</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(-10).reverse().map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 text-foreground">{formatLabel(row.periodStart)}</td>
                    <td className="py-2 text-right text-foreground">{row.apiCalls.toLocaleString()}</td>
                    <td className="py-2 text-right text-foreground">{row.workflowRuns.toLocaleString()}</td>
                    <td className="py-2 text-right text-foreground">{row.pluginExecutions.toLocaleString()}</td>
                    <td className="py-2 text-right text-foreground">{row.storageUsed}</td>
                    <td className={`py-2 text-right ${row.errors > 0 ? 'text-red-400' : 'text-foreground'}`}>
                      {row.errors}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 text-foreground">Total</td>
                  <td className="py-2 text-right text-foreground">
                    {data.reduce((sum, d) => sum + d.apiCalls, 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {data.reduce((sum, d) => sum + d.workflowRuns, 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {data.reduce((sum, d) => sum + d.pluginExecutions, 0).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-foreground">
                    {data[data.length - 1]?.storageUsed ?? 0}
                  </td>
                  <td className={`py-2 text-right ${data.reduce((sum, d) => sum + d.errors, 0) > 0 ? 'text-red-400' : 'text-foreground'}`}>
                    {data.reduce((sum, d) => sum + d.errors, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
