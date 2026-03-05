/**
 * Health Monitor
 * 
 * Monitors resource usage inside the workspace container:
 * - RAM usage (RSS, heap, external)
 * - CPU load (1/5/15 min averages)
 * - Disk usage (/workspace volume)
 * - Uptime
 * 
 * Emits warnings when resource limits are approached.
 * Provides sync health check for HTTP /health endpoint.
 */

'use strict';

const { EventEmitter } = require('events');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

class HealthMonitor extends EventEmitter {
  constructor({ workspaceDir, log, checkIntervalMs = 30000 }) {
    super();

    this.workspaceDir = workspaceDir;
    this.log = log;
    this.checkIntervalMs = checkIntervalMs;
    this.startTime = Date.now();

    // Thresholds for warnings
    this.thresholds = {
      memoryPercent: 85,    // Warn at 85% memory usage
      diskPercent: 90,      // Warn at 90% disk usage
    };

    // Cached stats (updated periodically)
    this.cachedStats = null;
    this.lastCheck = 0;

    // CPU usage tracking (cgroup-based, calculated from delta between samples)
    this._prevCpuUsage = null;  // { usageNs: number, timestampMs: number }
    this._cpuPercent = 0;       // Last calculated CPU percentage (0-100)

    // Start periodic monitoring
    this.interval = setInterval(() => this._check(), this.checkIntervalMs);
    this._check(); // Initial check
  }

  /**
   * Synchronous health check for HTTP /health endpoint
   * Returns current health status without blocking
   */
  healthCheck() {
    return {
      status: 'healthy',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      memory: {
        rss: process.memoryUsage.rss(),
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      },
    };
  }

  /**
   * Get detailed async stats (includes disk, CPU, etc.)
   */
  async getStats() {
    // Return cached stats if recent (within check interval)
    if (this.cachedStats && (Date.now() - this.lastCheck) < this.checkIntervalMs) {
      return this.cachedStats;
    }
    return this._collectStats();
  }

  /**
   * Collect all system stats
   */
  _collectStats() {
    const mem = process.memoryUsage();

    // Container-aware memory: read from cgroup (Docker sets memory limits via cgroups)
    const cgroupMem = this._getCgroupMemory();
    const totalMem = cgroupMem.limit || os.totalmem();
    const usedMem = cgroupMem.used || (os.totalmem() - os.freemem());
    const freeMem = totalMem - usedMem;
    const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

    const loadAvg = os.loadavg();

    // Container-aware CPU: read from cgroup (Docker sets CPU limits via cgroups)
    const cgroupCpu = this._getCgroupCpu();

    // Disk usage for workspace directory
    let disk = { total: 0, used: 0, available: 0, percent: 0 };
    try {
      const output = execSync(`df -B1 "${this.workspaceDir}" 2>/dev/null | tail -1`, {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      const parts = output.split(/\s+/);
      if (parts.length >= 5) {
        disk = {
          total: parseInt(parts[1], 10) || 0,
          used: parseInt(parts[2], 10) || 0,
          available: parseInt(parts[3], 10) || 0,
          percent: parseInt(parts[4], 10) || 0,
        };
      }
    } catch {
      // df not available or errored — skip disk stats
    }

    // Workspace directory size
    let workspaceSize = 0;
    try {
      const output = execSync(`du -sb "${this.workspaceDir}" 2>/dev/null | cut -f1`, {
        encoding: 'utf8',
        timeout: 10000,
      }).trim();
      workspaceSize = parseInt(output, 10) || 0;
    } catch {
      // du not available
    }

    const stats = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      memory: {
        process: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
        system: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          percent: memPercent,
        },
      },
      cpu: {
        loadAvg: {
          '1m': loadAvg[0],
          '5m': loadAvg[1],
          '15m': loadAvg[2],
        },
        cores: os.cpus().length,
        // Container-specific CPU usage (cgroup-based)
        usageCores: cgroupCpu.cpuPercent,        // Fraction of cores used (e.g. 0.35 = 35% of 1 core)
        allocatedCores: cgroupCpu.allocatedCores, // Cores allocated to container via Docker --cpus
      },
      disk,
      workspace: {
        path: this.workspaceDir,
        sizeBytes: workspaceSize,
        sizeMb: Math.round(workspaceSize / (1024 * 1024)),
      },
    };

    this.cachedStats = stats;
    this.lastCheck = Date.now();

    return stats;
  }

  /**
   * Read container memory from cgroup (Docker sets limits via cgroups).
   * Supports both cgroup v2 (modern) and cgroup v1 (legacy).
   *
   * Returns { used: bytes|null, limit: bytes|null }
   */
  _getCgroupMemory() {
    let used = null;
    let limit = null;

    try {
      // cgroup v2 (modern Docker/containerd)
      if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
        used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim(), 10) || null;
        const rawMax = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
        // "max" means unlimited — fall back to os.totalmem()
        limit = rawMax === 'max' ? null : (parseInt(rawMax, 10) || null);
      }
      // cgroup v1 (legacy Docker)
      else if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
        used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim(), 10) || null;
        const rawLimit = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim(), 10);
        // Very large values (close to max int64) mean unlimited
        limit = rawLimit > 0 && rawLimit < 9_000_000_000_000_000_000 ? rawLimit : null;
      }
    } catch {
      // cgroup files not readable — fall back to os stats
    }

    return { used, limit };
  }

  /**
   * Read container CPU usage from cgroup and calculate percentage.
   * Uses delta between two samples to compute actual CPU utilization.
   * Supports cgroup v2 (cpu.stat usage_usec) and v1 (cpuacct.usage).
   *
   * Returns CPU usage as a fraction of allocated cores (e.g., 0.75 = 75% of 1 core, or 75% utilization).
   * Also returns the number of cores allocated to the container.
   */
  _getCgroupCpu() {
    let usageNs = null;
    let allocatedCores = os.cpus().length;  // Fallback to visible CPUs

    try {
      // cgroup v2: /sys/fs/cgroup/cpu.stat contains usage_usec
      if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
        const cpuStat = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8');
        const match = cpuStat.match(/^usage_usec\s+(\d+)/m);
        if (match) {
          usageNs = parseInt(match[1], 10) * 1000;  // Convert microseconds to nanoseconds
        }

        // Read CPU quota to determine allocated cores
        // cpu.max format: "quota period" e.g. "100000 100000" = 1 core
        if (fs.existsSync('/sys/fs/cgroup/cpu.max')) {
          const cpuMax = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim();
          const parts = cpuMax.split(' ');
          if (parts[0] !== 'max' && parts.length >= 2) {
            const quota = parseInt(parts[0], 10);
            const period = parseInt(parts[1], 10);
            if (quota > 0 && period > 0) {
              allocatedCores = quota / period;
            }
          }
        }
      }
      // cgroup v1: /sys/fs/cgroup/cpu,cpuacct/cpuacct.usage (or /sys/fs/cgroup/cpuacct/cpuacct.usage)
      else {
        const v1Paths = [
          '/sys/fs/cgroup/cpu,cpuacct/cpuacct.usage',
          '/sys/fs/cgroup/cpuacct/cpuacct.usage',
        ];
        for (const path of v1Paths) {
          if (fs.existsSync(path)) {
            usageNs = parseInt(fs.readFileSync(path, 'utf8').trim(), 10) || null;
            break;
          }
        }

        // Read CPU quota for v1
        const quotaPath = '/sys/fs/cgroup/cpu/cpu.cfs_quota_us';
        const periodPath = '/sys/fs/cgroup/cpu/cpu.cfs_period_us';
        if (fs.existsSync(quotaPath) && fs.existsSync(periodPath)) {
          const quota = parseInt(fs.readFileSync(quotaPath, 'utf8').trim(), 10);
          const period = parseInt(fs.readFileSync(periodPath, 'utf8').trim(), 10);
          if (quota > 0 && period > 0) {
            allocatedCores = quota / period;
          }
        }
      }
    } catch {
      // cgroup CPU files not readable
    }

    // Calculate CPU percentage from delta
    const now = Date.now();
    let cpuPercent = this._cpuPercent;  // Use last known value as fallback

    if (usageNs !== null && this._prevCpuUsage !== null) {
      const deltaUsageNs = usageNs - this._prevCpuUsage.usageNs;
      const deltaTimeMs = now - this._prevCpuUsage.timestampMs;

      if (deltaTimeMs > 0 && deltaUsageNs >= 0) {
        // Convert: deltaUsageNs (nanoseconds of CPU time) / (deltaTimeMs * 1e6 ns/ms) = fraction of 1 core
        // Then divide by allocated cores to get percentage of allocation
        const cpuFraction = deltaUsageNs / (deltaTimeMs * 1_000_000);
        cpuPercent = Math.round(cpuFraction * 100) / 100;  // e.g. 0.75 = 75% of 1 core
        this._cpuPercent = cpuPercent;
      }
    }

    // Store current reading for next delta
    if (usageNs !== null) {
      this._prevCpuUsage = { usageNs, timestampMs: now };
    }

    return { cpuPercent, allocatedCores };
  }

  /**
   * Periodic check — collect stats and emit warnings
   */
  _check() {
    try {
      const stats = this._collectStats();

      // Check memory threshold
      if (stats.memory.system.percent >= this.thresholds.memoryPercent) {
        const msg = `Memory usage at ${stats.memory.system.percent}% (threshold: ${this.thresholds.memoryPercent}%)`;
        this.log.warn(msg);
        this.emit('warning', {
          type: 'memory',
          message: msg,
          percent: stats.memory.system.percent,
          stats: stats.memory.system,
        });
      }

      // Check disk threshold
      if (stats.disk.percent >= this.thresholds.diskPercent) {
        const msg = `Disk usage at ${stats.disk.percent}% (threshold: ${this.thresholds.diskPercent}%)`;
        this.log.warn(msg);
        this.emit('warning', {
          type: 'disk',
          message: msg,
          percent: stats.disk.percent,
          stats: stats.disk,
        });
      }
    } catch (err) {
      this.log.error(`Health check error: ${err.message}`);
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = { HealthMonitor };
