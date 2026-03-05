/**
 * 2Bot AI Agent Safety Module
 *
 * Input validation, destructive command blocking, and resource limit
 * enforcement for the AI agent. All tool calls pass through this
 * layer before being dispatched to the bridge agent.
 *
 * @module modules/2bot-ai-agent/agent-safety
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "2bot-ai-agent:safety" });

// ===========================================
// Destructive Command Blocklist
// ===========================================

/**
 * Shell commands/patterns that are blocked from execution.
 * These could damage the container or escape the sandbox.
 */
const BLOCKED_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // System destruction
  { pattern: /\brm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f?\s+\/\s*$/i, reason: "Recursive delete of root is not allowed" },
  { pattern: /\brm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f?\s+\/\*\s*/i, reason: "Recursive delete of root contents is not allowed" },
  { pattern: /\brm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f?\s+\/[a-z]+/i, reason: "Recursive delete of system directories is not allowed" },
  { pattern: /\bmkfs\b/i, reason: "Filesystem formatting is not allowed" },
  { pattern: /\bdd\b.*\bof=\/dev\//i, reason: "Direct device writes are not allowed" },

  // System shutdown / reboot
  { pattern: /\bshutdown\b/i, reason: "Shutdown is not allowed" },
  { pattern: /\breboot\b/i, reason: "Reboot is not allowed" },
  { pattern: /\bhalt\b/i, reason: "Halt is not allowed" },
  { pattern: /\bpoweroff\b/i, reason: "Poweroff is not allowed" },
  { pattern: /\binit\s+[06]\b/i, reason: "Init runlevel change is not allowed" },

  // Container escape attempts
  { pattern: /\bnsenter\b/i, reason: "Namespace entry is not allowed" },
  { pattern: /\bchroot\b/i, reason: "Chroot is not allowed" },
  { pattern: /\bmount\b/i, reason: "Mount operations are not allowed" },
  { pattern: /\bumount\b/i, reason: "Unmount operations are not allowed" },

  // Network abuse
  { pattern: /\biptables\b/i, reason: "Firewall modification is not allowed" },
  { pattern: /\bip\s+route\b/i, reason: "Route modification is not allowed" },

  // Process manipulation of system processes
  { pattern: /\bkill\s+(-9\s+)?1\b/, reason: "Killing PID 1 is not allowed" },
  { pattern: /\bkillall\b/i, reason: "killall is not allowed" },

  // Fork bombs
  { pattern: /:\(\)\{\s*:\|:&\s*\};\s*:/, reason: "Fork bombs are not allowed" },
  { pattern: /\.\/\S+\s*&\s*.*\.\/\S+\s*&/, reason: "Suspicious fork pattern detected" },

  // Reading system credentials / bridge secrets
  { pattern: /\bcat\b.*\/etc\/(passwd|shadow|sudoers)/i, reason: "Reading system credentials is not allowed" },
  { pattern: /BRIDGE_AUTH_TOKEN/i, reason: "Accessing bridge auth token is not allowed" },
  { pattern: /process\.env\b/i, reason: "Accessing process environment variables directly is not allowed" },

  // System path writes (defense-in-depth — OS perms also block this)
  { pattern: />\s*\/etc\//i, reason: "Writing to /etc is not allowed" },
  { pattern: />\s*\/usr\//i, reason: "Writing to /usr is not allowed" },
  { pattern: />\s*\/var\//i, reason: "Writing to /var is not allowed" },
  { pattern: />\s*\/root\//i, reason: "Writing to /root is not allowed" },
  { pattern: />\s*\/opt\/bridge-agent\//i, reason: "Writing to bridge agent directory is not allowed" },

  // Reading bridge agent source code
  { pattern: /\bcat\b.*\/opt\/bridge-agent\//i, reason: "Reading bridge agent source is not allowed" },
];

/**
 * File paths that cannot be written to or deleted.
 * 
 * SECURITY: We use an allowlist approach instead of a blocklist.
 * All file paths MUST resolve to within /workspace.
 * Absolute paths outside /workspace are blocked entirely.
 * This is defense-in-depth — the bridge agent's _safePath() is the
 * primary boundary, but we block early at the platform layer too.
 */
const ALLOWED_PATH_PREFIXES = [
  "/workspace",
  "/tmp/__agent_cmd_", // Agent temp scripts (needed for run_command)
];

/**
 * Additional protected paths WITHIN /workspace that agent should not touch.
 * These are bridge agent internals and system paths created by the container.
 */
const WORKSPACE_PROTECTED_PATHS = [
  "/workspace/.bridge-agent",
  "/workspace/.env.bridge",
];

// ===========================================
// Tool Classification (Approval & Tracking)
// ===========================================

/** Tools that require explicit user approval before execution (terminal/install/clone). */
const APPROVAL_REQUIRED_TOOLS = new Set([
  "run_command",
  "install_package",
  "git_clone",
]);

/** Tools that modify files and should be tracked as AI Actions with backup. */
const FILE_MODIFICATION_TOOLS = new Set([
  "write_file",
  "delete_file",
  "rename_file",
]);

/**
 * Check if a tool requires user approval before execution.
 * Only terminal commands, package installs, and git clones need approval
 * because they have side effects that are hard to reverse.
 */
export function requiresApproval(toolName: string): boolean {
  return APPROVAL_REQUIRED_TOOLS.has(toolName);
}

/**
 * Check if a tool modifies files and should be tracked as an AI Action.
 * These are executed freely but backed up for one-click restore.
 */
export function isFileModification(toolName: string): boolean {
  return FILE_MODIFICATION_TOOLS.has(toolName);
}

// ===========================================
// Validation Functions
// ===========================================

/**
 * Validate a shell command for safety.
 * Returns null if safe, or an error message if blocked.
 */
export function validateCommand(command: string): string | null {
  if (!command || typeof command !== "string") {
    return "Command must be a non-empty string";
  }

  // Check against blocklist
  for (const { pattern, reason } of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      log.warn({ command: command.substring(0, 100), reason }, "Blocked dangerous command");
      return reason;
    }
  }

  // Limit command length (prevent injection attacks with very long strings)
  if (command.length > 10_000) {
    return "Command too long (max 10,000 characters)";
  }

  return null; // Safe
}

/**
 * Validate a file path for safety.
 * Returns null if safe, or an error message if blocked.
 * 
 * SECURITY MODEL (defense-in-depth, 3 layers):
 * 1. This function (platform layer): blocks absolute paths outside /workspace,
 *    blocks path traversal, blocks protected internal paths.
 * 2. Bridge agent _safePath() (container layer): strips leading slashes,
 *    resolves against /workspace, prevents escape.
 * 3. OS permissions (node user): cannot write to system files.
 */
export function validateFilePath(filePath: string): string | null {
  if (!filePath || typeof filePath !== "string") {
    return "Path must be a non-empty string";
  }

  // Normalize path to prevent traversal
  const normalized = filePath.replace(/\\/g, "/");

  // Block absolute paths unless they are in the allowed list
  if (normalized.startsWith("/")) {
    const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
      normalized.startsWith(prefix)
    );
    if (!isAllowed) {
      log.warn({ path: filePath }, "Blocked absolute path outside workspace");
      return "Access denied: file operations are restricted to the workspace directory. Use relative paths (e.g., 'plugins/my-plugin.js') instead of absolute paths.";
    }
  }

  // Block protected paths within workspace
  for (const protectedPath of WORKSPACE_PROTECTED_PATHS) {
    if (normalized.startsWith(protectedPath)) {
      log.warn({ path: filePath }, "Blocked access to protected workspace path");
      return `Access to ${protectedPath} is not allowed — this is a system-internal path`;
    }
  }

  // Block path traversal beyond workspace root
  const segments = normalized.split("/");
  let depth = 0;
  for (const seg of segments) {
    if (seg === "..") {
      depth--;
    } else if (seg !== "." && seg !== "") {
      depth++;
    }
    if (depth < 0) {
      log.warn({ path: filePath }, "Blocked path traversal attempt");
      return "Path traversal beyond workspace root is not allowed";
    }
  }

  // Limit path length
  if (filePath.length > 1000) {
    return "Path too long (max 1,000 characters)";
  }

  return null; // Safe
}

/**
 * Validate file content for safety.
 * Returns null if safe, or an error message if blocked.
 */
export function validateFileContent(content: string): string | null {
  if (typeof content !== "string") {
    return "Content must be a string";
  }

  // Limit file size (5MB in characters — bridge agent has its own limits too)
  if (content.length > 5_000_000) {
    return "File content too large (max 5MB)";
  }

  return null; // Safe
}

/**
 * Validate tool call arguments based on tool name.
 * Returns null if safe, or an error message if blocked.
 */
export function validateToolCallArgs(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  switch (toolName) {
    case "run_command": {
      const cmdError = validateCommand(args.command as string);
      if (cmdError) return cmdError;
      // Validate cwd if provided — must be within workspace
      if (args.cwd && typeof args.cwd === "string") {
        const cwdError = validateFilePath(args.cwd as string);
        if (cwdError) return `cwd: ${cwdError}`;
      }
      break;
    }

    case "read_file":
    case "delete_file":
    case "create_directory":
    case "file_stat":
    case "list_directory": {
      const pathError = validateFilePath(args.path as string);
      if (pathError) return pathError;
      break;
    }

    case "write_file": {
      const writePathError = validateFilePath(args.path as string);
      if (writePathError) return writePathError;
      const contentError = validateFileContent(args.content as string);
      if (contentError) return contentError;
      break;
    }

    case "rename_file": {
      const oldPathError = validateFilePath(args.oldPath as string);
      if (oldPathError) return `oldPath: ${oldPathError}`;
      const newPathError = validateFilePath(args.newPath as string);
      if (newPathError) return `newPath: ${newPathError}`;
      break;
    }

    case "search_files": {
      if (args.path) {
        const searchPathError = validateFilePath(args.path as string);
        if (searchPathError) return searchPathError;
      }
      if (!args.pattern || typeof args.pattern !== "string") {
        return "Search pattern must be a non-empty string";
      }
      if ((args.pattern as string).length > 500) {
        return "Search pattern too long (max 500 characters)";
      }
      // Validate filePattern if provided
      if (args.filePattern !== undefined) {
        if (typeof args.filePattern !== "string") {
          return "filePattern must be a string";
        }
        if ((args.filePattern as string).length > 200) {
          return "filePattern too long (max 200 characters)";
        }
        if (/[;|&`$><\\!]/.test(args.filePattern as string)) {
          return "filePattern contains disallowed characters";
        }
      }
      // Validate maxResults if provided
      if (args.maxResults !== undefined) {
        if (typeof args.maxResults !== "number" || !Number.isFinite(args.maxResults as number)) {
          return "maxResults must be a finite number";
        }
      }
      break;
    }

    case "git_clone": {
      if (!args.url || typeof args.url !== "string") {
        return "Git URL must be a non-empty string";
      }
      // Basic URL validation
      const url = args.url as string;
      if (!url.startsWith("https://") && !url.startsWith("git@") && !url.startsWith("http://")) {
        return "Git URL must start with https://, http://, or git@";
      }
      break;
    }

    case "install_package": {
      if (args.packages && Array.isArray(args.packages)) {
        for (const pkg of args.packages as string[]) {
          if (typeof pkg !== "string" || pkg.length > 200) {
            return "Invalid package name";
          }
          // Block shell injection in package names
          if (/[;&|`$()]/.test(pkg)) {
            return `Package name "${pkg}" contains invalid characters`;
          }
        }
      }
      break;
    }
  }

  return null; // Safe
}

// ===========================================
// Session Safety Checks
// ===========================================

/**
 * Check whether the agent session should continue or be stopped.
 * Returns null if OK, or a reason string if the session should stop.
 */
export function checkSessionLimits(
  iterationCount: number,
  totalCreditsUsed: number,
  startedAt: Date,
  config: { maxIterations: number; maxCreditsPerSession: number; sessionTimeoutMs: number },
): string | null {
  if (iterationCount >= config.maxIterations) {
    return `Maximum iterations reached (${config.maxIterations})`;
  }

  if (totalCreditsUsed >= config.maxCreditsPerSession) {
    return `Maximum credit budget reached (${config.maxCreditsPerSession})`;
  }

  const elapsed = Date.now() - startedAt.getTime();
  if (elapsed >= config.sessionTimeoutMs) {
    return `Session timeout reached (${config.sessionTimeoutMs}ms)`;
  }

  return null; // OK to continue
}

/**
 * Truncate tool output to prevent context window overflow.
 * Large outputs (e.g., from ls -la) are cut to a reasonable size
 * with a note about truncation.
 */
export function truncateToolOutput(output: string, maxChars = 8000): string {
  if (output.length <= maxChars) return output;

  const truncated = output.substring(0, maxChars);
  const remaining = output.length - maxChars;
  return `${truncated}\n\n... [truncated — ${remaining} more characters]`;
}
