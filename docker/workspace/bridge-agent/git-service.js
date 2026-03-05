/**
 * Git Service
 * 
 * Handles Git operations within the workspace container.
 * Only HTTPS URLs are allowed (no SSH, no file:// protocol).
 * All cloned repos go under /workspace/imports/ by default.
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Max clone size: 500MB (prevents abuse)
const MAX_CLONE_SIZE_MB = 500;

// Timeout for git operations: 2 minutes
const GIT_TIMEOUT_MS = 120_000;

class GitService {
  constructor({ workspaceDir, log, logCollector }) {
    this.workspaceDir = workspaceDir;
    this.log = log;
    this.logCollector = logCollector;
  }

  /**
   * Clone a Git repository
   * @param {string} url - Repository URL (HTTPS only)
   * @param {string} targetDir - Target directory (relative to workspace)
   * @param {string} branch - Branch to checkout
   * @param {number} depth - Shallow clone depth (1 = latest commit only)
   * @param {{ username?: string, token?: string }} credentials - Optional auth credentials for private repos
   */
  async clone(url, targetDir, branch, depth = 1, credentials = null) {
    // Validate URL — HTTPS only
    this._validateUrl(url);

    // Determine target directory
    const repoName = this._extractRepoName(url);
    const relativeTarget = targetDir || `${repoName}`;
    const fullTarget = path.resolve(this.workspaceDir, relativeTarget);

    // Security: must be within workspace
    if (!fullTarget.startsWith(this.workspaceDir)) {
      throw new Error('Target directory must be within workspace');
    }

    // Check target doesn't already exist
    try {
      await fs.access(fullTarget);
      throw new Error(`Directory already exists: ${relativeTarget}. Delete it first or choose a different target.`);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Build the clone URL — inject credentials for private repos
    let cloneUrl = url;
    if (credentials && credentials.username && credentials.token) {
      const urlObj = new URL(url);
      urlObj.username = encodeURIComponent(credentials.username);
      urlObj.password = encodeURIComponent(credentials.token);
      cloneUrl = urlObj.toString();
    }

    // Build git clone command
    const args = ['clone'];

    if (depth && depth > 0) {
      args.push('--depth', String(depth));
    }

    if (branch) {
      args.push('--branch', branch);
    }

    args.push('--', cloneUrl, fullTarget);

    // Log without credentials (use original URL for logging)
    this.log.info(`Cloning ${url} → ${relativeTarget}${credentials ? ' (authenticated)' : ''}`);
    this.logCollector.log('info', 'git', `Cloning ${url} → ${relativeTarget}${credentials ? ' (authenticated)' : ''}`);

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: this.workspaceDir,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // Never prompt for credentials
        },
      });

      if (stderr) {
        this.log.info(`git clone stderr: ${stderr.trim()}`);
      }

      // Count files
      const fileCount = await this._countFiles(fullTarget);
      const totalSize = await this._dirSize(fullTarget);

      // Check size limit
      const sizeMb = totalSize / (1024 * 1024);
      if (sizeMb > MAX_CLONE_SIZE_MB) {
        // Remove if too large
        await fs.rm(fullTarget, { recursive: true });
        throw new Error(`Repository too large (${sizeMb.toFixed(1)}MB). Max: ${MAX_CLONE_SIZE_MB}MB`);
      }

      // Detect branch
      let detectedBranch = branch;
      if (!detectedBranch) {
        try {
          const { stdout: branchOut } = await execFileAsync('git', ['branch', '--show-current'], {
            cwd: fullTarget,
            timeout: 5000,
          });
          detectedBranch = branchOut.trim();
        } catch {
          detectedBranch = 'unknown';
        }
      }

      this.logCollector.log('info', 'git', `Cloned ${fileCount} files (${sizeMb.toFixed(1)}MB) from ${url}`);

      return {
        success: true,
        targetDir: relativeTarget,
        fileCount,
        totalSizeBytes: totalSize,
        branch: detectedBranch,
      };
    } catch (err) {
      // Clean up partial clone
      try {
        await fs.rm(fullTarget, { recursive: true });
      } catch {}

      this.logCollector.log('error', 'git', `Clone failed: ${err.message}`);
      throw new Error(`Git clone failed: ${err.message}`);
    }
  }

  /**
   * Pull latest changes in a repository
   * @param {string} dir - Directory containing the git repo
   * @param {{ username?: string, token?: string }} credentials - Optional auth credentials
   */
  async pull(dir, credentials = null) {
    const fullDir = path.resolve(this.workspaceDir, dir);

    if (!fullDir.startsWith(this.workspaceDir)) {
      throw new Error('Directory must be within workspace');
    }

    // Verify it's a git repo
    try {
      await fs.access(path.join(fullDir, '.git'));
    } catch {
      throw new Error(`Not a git repository: ${dir}`);
    }

    // Build env with optional credential helper
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    };

    // If credentials provided, set up a one-time credential helper
    const args = ['pull', '--ff-only'];
    if (credentials && credentials.username && credentials.token) {
      // Use -c credential.helper to inject credentials without modifying git config
      args.unshift(
        '-c',
        `credential.helper=!f() { echo "username=${credentials.username}"; echo "password=${credentials.token}"; }; f`
      );
    }

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: fullDir,
        timeout: GIT_TIMEOUT_MS,
        env,
      });

      this.logCollector.log('info', 'git', `Pulled updates in ${dir}: ${stdout.trim()}`);

      return {
        success: true,
        output: stdout.trim(),
        warnings: stderr?.trim() || null,
      };
    } catch (err) {
      throw new Error(`Git pull failed: ${err.message}`);
    }
  }

  /**
   * Get git status of a repository
   * @param {string} dir - Directory containing the git repo
   */
  async status(dir) {
    const fullDir = path.resolve(this.workspaceDir, dir);

    if (!fullDir.startsWith(this.workspaceDir)) {
      throw new Error('Directory must be within workspace');
    }

    try {
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: fullDir,
        timeout: 10_000,
      });

      const { stdout: branchOut } = await execFileAsync('git', ['branch', '--show-current'], {
        cwd: fullDir,
        timeout: 5000,
      });

      const { stdout: remoteOut } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: fullDir,
        timeout: 5000,
      }).catch(() => ({ stdout: '' }));

      const changes = statusOut
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }));

      return {
        branch: branchOut.trim(),
        remote: remoteOut.trim(),
        clean: changes.length === 0,
        changes,
      };
    } catch (err) {
      throw new Error(`Git status failed: ${err.message}`);
    }
  }

  /**
   * Validate repository URL — HTTPS only, no private IPs
   */
  _validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Repository URL is required');
    }

    // Must be HTTPS
    if (!url.startsWith('https://')) {
      throw new Error('Only HTTPS URLs are allowed (no SSH, file://, or HTTP)');
    }

    // Block private/internal URLs (SSRF protection)
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    const blockedHosts = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      '169.254.169.254',  // AWS metadata
      'metadata.google.internal', // GCP metadata
    ];

    if (blockedHosts.includes(hostname)) {
      throw new Error('Cannot clone from internal/private URLs');
    }

    // Block private IP ranges
    const privateRanges = [
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
    ];

    for (const range of privateRanges) {
      if (range.test(hostname)) {
        throw new Error('Cannot clone from private IP addresses');
      }
    }
  }

  /**
   * Extract repository name from URL
   */
  _extractRepoName(url) {
    const parts = url.replace(/\.git$/, '').split('/');
    return parts[parts.length - 1] || 'repo';
  }

  /**
   * Count files in a directory recursively
   */
  async _countFiles(dir) {
    let count = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) {
        count += await this._countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
    return count;
  }

  /**
   * Calculate total directory size
   */
  async _dirSize(dir) {
    let total = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await this._dirSize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  }
}

module.exports = { GitService };
