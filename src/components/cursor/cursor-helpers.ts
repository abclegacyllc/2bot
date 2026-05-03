/**
 * Cursor Shared Helpers
 *
 * Pure functions and constants shared between CursorPanel and CursorStudioBar.
 * Extracted to avoid duplication across the two UI shells.
 *
 * @module components/cursor/cursor-helpers
 */

import { apiUrl } from "@/shared/config/urls";

// =============================================================================
// Repo URL Helpers
// =============================================================================

/** Regex to validate supported git hosting URLs */
const REPO_URL_PATTERN = /^https:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+/i;

/** Validate a repo URL (GitHub, GitLab, Bitbucket) */
export function isValidRepoUrl(url: string): boolean {
  return REPO_URL_PATTERN.test(url.trim());
}

/** Format a repo URL for display (strip protocol + host, strip .git) */
export function formatRepoUrl(url: string): string {
  return url
    .replace(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//, "")
    .replace(/\.git$/, "");
}

// =============================================================================
// Terminal Approval API
// =============================================================================

/**
 * Send terminal command approval/rejection to the backend.
 * Fire-and-forget — returns void.
 */
export function sendTerminalApproval(sessionId: string, approved: boolean): void {
  const authToken = typeof window !== "undefined" ? (localStorage.getItem("token") || "") : "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  void fetch(apiUrl("/cursor/terminal-approval"), {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ sessionId, approved }),
  });
}

// =============================================================================
// Credit Bar Helpers
// =============================================================================

/** Get the color for the credit usage bar based on ratio */
export function getCreditBarColor(creditsUsed: number, creditBudget: number): string {
  const ratio = creditBudget > 0 ? creditsUsed / creditBudget : 0;
  if (ratio > 0.8) return "#ef4444"; // red
  if (ratio > 0.5) return "#eab308"; // yellow
  return "var(--cursor-primary, #10b981)";
}

/** Get the width percentage for the credit bar */
export function getCreditBarWidth(creditsUsed: number, creditBudget: number): number {
  return Math.min(100, creditBudget > 0 ? (creditsUsed / creditBudget) * 100 : 0);
}
