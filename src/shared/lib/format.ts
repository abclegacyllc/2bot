/**
 * Shared Format Utilities
 *
 * Single source of truth for number and credit formatting across
 * the entire 2Bot platform (frontend + backend).
 *
 * RULES:
 * - Values < 1,000: show with comma separators (e.g., "999", "1,000" is impossible here)
 * - Values >= 1,000: abbreviate with K suffix, 1 decimal (e.g., "1.5K", "2.0K")
 * - Values >= 1,000,000: abbreviate with M suffix, 1 decimal (e.g., "1.2M")
 * - Unlimited (-1): show "∞" or "Unlimited" depending on context
 *
 * @module shared/lib/format
 */

// ===========================================
// Credit Formatting
// ===========================================

/**
 * Format a credit balance for display.
 * Always positive — for transaction amounts with sign, use formatCreditAmount().
 *
 * Examples:
 *   0 → "0"
 *   15 → "15"
 *   500 → "500"
 *   999 → "999"
 *   1000 → "1.0K"
 *   1250 → "1.3K"
 *   2000 → "2.0K"
 *   10000 → "10.0K"
 *   125000 → "125.0K"
 *   1500000 → "1.5M"
 */
export function formatCredits(credits: number): string {
  const rounded = Math.floor(credits);
  if (rounded >= 1_000_000) {
    return `${(rounded / 1_000_000).toFixed(1)}M`;
  }
  if (rounded >= 1_000) {
    return `${(rounded / 1_000).toFixed(1)}K`;
  }
  return rounded.toLocaleString();
}

/**
 * Format a credit transaction amount (handles negative values).
 * Shows absolute value formatted — the caller is responsible for
 * prepending "+" or "-" or styling as needed.
 *
 * Examples:
 *   -3 → "3"
 *   -1500 → "1.5K"
 *   500 → "500"
 */
export function formatCreditAmount(amount: number): string {
  return formatCredits(Math.abs(amount));
}

// ===========================================
// Number Formatting
// ===========================================

/**
 * Format a number for display with K/M abbreviation.
 * For resource counts, quotas, usage numbers, etc.
 *
 * Examples:
 *   0 → "0"
 *   42 → "42"
 *   999 → "999"
 *   1000 → "1.0K"
 *   50000 → "50.0K"
 *   1200000 → "1.2M"
 */
export function formatNumber(num: number): string;
export function formatNumber(num: number | null, fallback?: string): string;
export function formatNumber(num: number | null, fallback = "—"): string {
  if (num === null) return fallback;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// ===========================================
// Unlimited Display
// ===========================================

/**
 * Format a limit value, handling unlimited (-1 or null).
 *
 * @param limit - The limit value. -1 or null means unlimited.
 * @param compact - If true, show "∞". If false, show "Unlimited".
 */
export function formatLimit(limit: number | null, compact = true): string {
  if (limit === null || limit === -1) {
    return compact ? "∞" : "Unlimited";
  }
  return formatNumber(limit);
}

// ===========================================
// Resource Value Formatting
// ===========================================

/**
 * Format a resource value with its unit, converting to
 * human-readable units where appropriate.
 *
 * - MB values ≥ 1024: convert to GB (e.g., 2048 MB → "2 GB", 20480 MB → "20 GB")
 * - MB values < 1024: show as-is with commas (e.g., "512 MB")
 * - Other units: show as-is with commas (e.g., "1 cores", "50 %")
 * - No unit: use formatNumber (with K/M abbreviation)
 *
 * Returns { display: string; unit: string } so caller can style differently.
 *
 * Examples:
 *   formatResourceValue(2048, "MB") → { display: "2", unit: "GB" }
 *   formatResourceValue(20480, "MB") → { display: "20", unit: "GB" }
 *   formatResourceValue(512, "MB") → { display: "512", unit: "MB" }
 *   formatResourceValue(1, "cores") → { display: "1", unit: "cores" }
 *   formatResourceValue(100, "%") → { display: "100", unit: "%" }
 *   formatResourceValue(1500) → { display: "1.5K", unit: "" }
 */
export function formatResourceValue(value: number, unit?: string): { display: string; unit: string } {
  if (!unit) {
    return { display: formatNumber(value), unit: "" };
  }

  if (unit === "MB") {
    if (value >= 1024) {
      const gb = value / 1024;
      // Show clean integer if whole number, otherwise 1 decimal
      const display = gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1);
      return { display, unit: "GB" };
    }
    return { display: value.toLocaleString(), unit: "MB" };
  }

  // For all other units (cores, %, etc.), show raw value
  return { display: value.toLocaleString(), unit };
}

/**
 * Format a resource value as a single string (value + unit).
 *
 * Examples:
 *   formatResourceDisplay(2048, "MB") → "2 GB"
 *   formatResourceDisplay(512, "MB") → "512 MB"
 *   formatResourceDisplay(1, "cores") → "1 cores"
 */
export function formatResourceDisplay(value: number, unit?: string): string {
  const { display, unit: fmtUnit } = formatResourceValue(value, unit);
  return fmtUnit ? `${display} ${fmtUnit}` : display;
}
