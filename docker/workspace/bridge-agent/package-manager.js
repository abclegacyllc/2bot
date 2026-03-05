/**
 * Package Manager Service
 * 
 * Handles npm operations within the workspace container.
 * Includes a blocklist for dangerous packages and enforces disk limits.
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Timeout for npm operations: 3 minutes
const NPM_TIMEOUT_MS = 180_000;

// Packages that are blocked for security reasons
const BLOCKED_PACKAGES = new Set([
  // Native compilation risks
  'node-gyp',
  'node-pre-gyp',
  'prebuild',
  'prebuild-install',
  // Network attack tools
  'nmap',
  'masscan',
  // Crypto miners
  'crypto-miner',
  'coinhive',
  'coin-hive',
  // Shell/system access (these are Node.js built-ins, not npm packages,
  // but block them as package names in case someone publishes malicious ones)
  'child-process-exec',
  'reverse-shell',
]);

// Max node_modules size (MB) — prevents filling container disk
const MAX_NODE_MODULES_MB = 500;

class PackageManager {
  constructor({ workspaceDir, log, logCollector }) {
    this.workspaceDir = workspaceDir;
    this.log = log;
    this.logCollector = logCollector;
  }

  /**
   * Install npm packages
   * @param {string[]} packages - Package names to install
   * @param {boolean} dev - Install as devDependency
   * @param {string} cwd - Working directory (relative to workspace)
   */
  async install(packages, dev = false, cwd = '.') {
    if (!packages || packages.length === 0) {
      throw new Error('No packages specified');
    }

    // Validate packages
    const results = { installed: [], failed: [] };
    const validPackages = [];

    for (const pkg of packages) {
      const name = this._extractPackageName(pkg);

      if (BLOCKED_PACKAGES.has(name)) {
        results.failed.push({ package: pkg, reason: 'Blocked for security reasons' });
        continue;
      }

      if (!this._isValidPackageName(name)) {
        results.failed.push({ package: pkg, reason: 'Invalid package name' });
        continue;
      }

      validPackages.push(pkg);
    }

    if (validPackages.length === 0) {
      return {
        success: results.failed.length === 0,
        installed: [],
        failed: results.failed,
      };
    }

    const fullCwd = path.resolve(this.workspaceDir, cwd);
    if (!fullCwd.startsWith(this.workspaceDir)) {
      throw new Error('Working directory must be within workspace');
    }

    // Ensure package.json exists
    try {
      await fs.access(path.join(fullCwd, 'package.json'));
    } catch {
      // Create a basic package.json
      await fs.writeFile(
        path.join(fullCwd, 'package.json'),
        JSON.stringify({ name: 'workspace', version: '1.0.0', private: true }, null, 2)
      );
    }

    // Build command
    const args = ['install', ...validPackages];
    if (dev) args.push('--save-dev');
    args.push('--no-audit', '--no-fund', '--loglevel', 'warn');

    this.log.info(`Installing packages: ${validPackages.join(', ')}`);
    this.logCollector.log('info', 'npm', `Installing: ${validPackages.join(', ')}`);

    try {
      const { stdout, stderr } = await execFileAsync('npm', args, {
        cwd: fullCwd,
        timeout: NPM_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          NODE_ENV: 'development', // Allow devDependencies to install
        },
      });

      results.installed = validPackages;

      if (stderr && !stderr.includes('npm warn')) {
        this.log.warn(`npm stderr: ${stderr.trim()}`);
      }

      // Check node_modules size
      const nodeModulesSize = await this._getNodeModulesSize(fullCwd);
      results.nodeModulesSizeMb = Math.round(nodeModulesSize / (1024 * 1024));

      if (results.nodeModulesSizeMb > MAX_NODE_MODULES_MB) {
        this.log.warn(`node_modules is ${results.nodeModulesSizeMb}MB — approaching limit of ${MAX_NODE_MODULES_MB}MB`);
      }

      this.logCollector.log('info', 'npm', `Installed ${validPackages.length} packages (node_modules: ${results.nodeModulesSizeMb}MB)`);

      return {
        success: true,
        ...results,
      };
    } catch (err) {
      this.logCollector.log('error', 'npm', `Install failed: ${err.message}`);
      throw new Error(`npm install failed: ${err.message}`);
    }
  }

  /**
   * Uninstall npm packages
   * @param {string[]} packages - Package names to uninstall
   * @param {string} cwd - Working directory
   */
  async uninstall(packages, cwd = '.') {
    if (!packages || packages.length === 0) {
      throw new Error('No packages specified');
    }

    const fullCwd = path.resolve(this.workspaceDir, cwd);
    if (!fullCwd.startsWith(this.workspaceDir)) {
      throw new Error('Working directory must be within workspace');
    }

    const args = ['uninstall', ...packages, '--no-audit', '--no-fund'];

    try {
      await execFileAsync('npm', args, {
        cwd: fullCwd,
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      this.logCollector.log('info', 'npm', `Uninstalled: ${packages.join(', ')}`);

      return {
        success: true,
        uninstalled: packages,
      };
    } catch (err) {
      throw new Error(`npm uninstall failed: ${err.message}`);
    }
  }

  /**
   * List installed packages
   * @param {string} cwd - Working directory
   */
  async list(cwd = '.') {
    const fullCwd = path.resolve(this.workspaceDir, cwd);
    if (!fullCwd.startsWith(this.workspaceDir)) {
      throw new Error('Working directory must be within workspace');
    }

    try {
      const { stdout } = await execFileAsync('npm', ['ls', '--depth=0', '--json'], {
        cwd: fullCwd,
        timeout: 30_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const data = JSON.parse(stdout);
      const packages = {};

      if (data.dependencies) {
        for (const [name, info] of Object.entries(data.dependencies)) {
          packages[name] = info.version || 'unknown';
        }
      }

      return {
        packages,
        count: Object.keys(packages).length,
      };
    } catch (err) {
      // npm ls exits with error code when there are issues, still returns JSON
      try {
        const jsonMatch = err.stdout?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          return {
            packages: data.dependencies ? Object.fromEntries(
              Object.entries(data.dependencies).map(([n, i]) => [n, i.version || 'unknown'])
            ) : {},
            count: Object.keys(data.dependencies || {}).length,
            problems: data.problems || [],
          };
        }
      } catch {}

      // No package.json or empty
      return { packages: {}, count: 0 };
    }
  }

  /**
   * Extract package name (strip version specifiers)
   */
  _extractPackageName(pkg) {
    // Handle scoped packages: @scope/name@version
    if (pkg.startsWith('@')) {
      const match = pkg.match(/^(@[^/]+\/[^@]+)/);
      return match ? match[1] : pkg;
    }
    // Handle regular packages: name@version
    return pkg.split('@')[0];
  }

  /**
   * Validate package name
   */
  _isValidPackageName(name) {
    if (!name || name.length > 214) return false;
    // npm package naming rules (simplified)
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
  }

  /**
   * Get node_modules directory size
   */
  async _getNodeModulesSize(cwd) {
    const nodeModulesPath = path.join(cwd, 'node_modules');
    try {
      await fs.access(nodeModulesPath);
      // Use du for speed (much faster than recursive stat)
      const { stdout } = await execFileAsync('du', ['-sb', nodeModulesPath], { timeout: 10_000 });
      return parseInt(stdout.split('\t')[0], 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Run npm audit and return vulnerability summary
   * @param {string} cwd - Working directory
   * @returns {Object} Audit summary with vulnerability counts
   */
  async audit(cwd = '.') {
    const fullCwd = path.resolve(this.workspaceDir, cwd);
    if (!fullCwd.startsWith(this.workspaceDir)) {
      throw new Error('Working directory must be within workspace');
    }

    try {
      // npm audit exits with non-zero if vulnerabilities found, so we catch
      const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
        cwd: fullCwd,
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const data = JSON.parse(stdout);
      return this._formatAuditResult(data);
    } catch (err) {
      // npm audit exits non-zero when vulnerabilities exist — parse stdout anyway
      if (err.stdout) {
        try {
          const data = JSON.parse(err.stdout);
          return this._formatAuditResult(data);
        } catch {}
      }
      // No package.json or npm audit not available
      return {
        vulnerabilities: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
        message: err.message || 'Audit unavailable',
      };
    }
  }

  /**
   * Format npm audit JSON output into a clean summary
   */
  _formatAuditResult(data) {
    const meta = data.metadata?.vulnerabilities || {};
    return {
      vulnerabilities: {
        total: (meta.critical || 0) + (meta.high || 0) + (meta.moderate || 0) + (meta.low || 0) + (meta.info || 0),
        critical: meta.critical || 0,
        high: meta.high || 0,
        moderate: meta.moderate || 0,
        low: meta.low || 0,
        info: meta.info || 0,
      },
      advisories: Object.keys(data.advisories || {}).length,
    };
  }
}

module.exports = { PackageManager };
