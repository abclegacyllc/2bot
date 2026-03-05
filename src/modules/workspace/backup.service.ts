/**
 * Workspace Backup Service
 * 
 * Provides workspace volume backup (tar + gzip) and restore functionality.
 * Backups are stored on the host filesystem alongside workspace volumes.
 * 
 * Backup naming: {containerName}-{timestamp}.tar.gz
 * Backup location: /var/lib/2bot/backups/{containerName}/
 * 
 * @module modules/workspace/backup.service
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const execFileAsync = promisify(execFile);
const log = logger.child({ module: 'workspace:backup' });

// ===========================================
// Configuration
// ===========================================

/** Base directory for workspace backups */
const BACKUP_BASE = process.env.WORKSPACE_BACKUP_BASE || '/var/lib/2bot/backups';

/** Maximum backups per container (auto-prune oldest) */
const MAX_BACKUPS_PER_CONTAINER = 5;

/** Maximum backup size in MB (safety limit) */
const MAX_BACKUP_SIZE_MB = 2048; // 2GB

/** Backup timeout in ms */
const BACKUP_TIMEOUT_MS = 300_000; // 5 minutes

// ===========================================
// Types
// ===========================================

export interface BackupInfo {
  id: string;
  containerDbId: string;
  containerName: string;
  filename: string;
  sizeBytes: number;
  sizeMb: number;
  createdAt: Date;
}

export interface BackupResult {
  success: boolean;
  backup?: BackupInfo;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredFrom?: string;
  error?: string;
}

// ===========================================
// Backup Service
// ===========================================

class WorkspaceBackupService {
  // ===========================================
  // Create Backup
  // ===========================================

  /**
   * Create a backup of a workspace container's volume.
   * The container should ideally be stopped for consistency, but works while running.
   * 
   * @param containerDbId - Database ID of the workspace container
   * @param userId - User performing the action (for audit)
   * @returns BackupResult with backup info
   */
  async createBackup(containerDbId: string, _userId?: string): Promise<BackupResult> {
    // Get container info
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: {
        id: true,
        containerName: true,
        volumePath: true,
        status: true,
        containerId: true,
      },
    });

    if (!container) {
      return { success: false, error: 'Container not found' };
    }

    if (!container.volumePath) {
      return { success: false, error: 'Container has no volume path' };
    }

    // Verify volume exists
    try {
      await fs.access(container.volumePath);
    } catch {
      return { success: false, error: 'Workspace volume directory does not exist' };
    }

    // Create backup directory
    const backupDir = path.join(BACKUP_BASE, container.containerName);
    await fs.mkdir(backupDir, { recursive: true });

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${timestamp}`;
    const filename = `${container.containerName}-${timestamp}.tar.gz`;
    const backupPath = path.join(backupDir, filename);

    log.info({
      containerDbId,
      containerName: container.containerName,
      volumePath: container.volumePath,
      backupPath,
    }, 'Creating workspace backup');

    try {
      // Create tar.gz of the volume directory
      // Use tar with gzip compression, preserving permissions
      await execFileAsync('tar', [
        '-czf',
        backupPath,
        '-C',
        path.dirname(container.volumePath),
        path.basename(container.volumePath),
      ], {
        timeout: BACKUP_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Get backup file size
      const stat = await fs.stat(backupPath);
      const sizeMb = stat.size / (1024 * 1024);

      // Check size limit
      if (sizeMb > MAX_BACKUP_SIZE_MB) {
        await fs.unlink(backupPath);
        return { success: false, error: `Backup too large (${sizeMb.toFixed(1)}MB). Max: ${MAX_BACKUP_SIZE_MB}MB` };
      }

      log.info({
        containerDbId,
        filename,
        sizeMb: sizeMb.toFixed(1),
      }, 'Workspace backup created');

      // Prune old backups if over limit
      await this.pruneOldBackups(container.containerName);

      const backup: BackupInfo = {
        id: backupId,
        containerDbId,
        containerName: container.containerName,
        filename,
        sizeBytes: stat.size,
        sizeMb: Math.round(sizeMb * 100) / 100,
        createdAt: new Date(),
      };

      return { success: true, backup };
    } catch (err) {
      // Clean up partial backup
      try { await fs.unlink(backupPath); } catch { /* ignore */ }

      log.error({
        containerDbId,
        error: (err as Error).message,
      }, 'Workspace backup failed');

      return { success: false, error: `Backup failed: ${(err as Error).message}` };
    }
  }

  // ===========================================
  // Restore Backup
  // ===========================================

  /**
   * Restore a workspace from a backup.
   * The container MUST be stopped before restoring.
   * 
   * @param containerDbId - Database ID of the workspace container
   * @param backupId - Backup ID (timestamp portion of filename)
   * @returns RestoreResult
   */
  async restoreBackup(containerDbId: string, backupId: string): Promise<RestoreResult> {
    // Get container info
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: {
        id: true,
        containerName: true,
        volumePath: true,
        status: true,
        containerId: true,
      },
    });

    if (!container) {
      return { success: false, error: 'Container not found' };
    }

    // Container must be stopped for restore
    if (container.status === 'RUNNING' || container.status === 'STARTING') {
      return { success: false, error: 'Container must be stopped before restoring. Stop the workspace first.' };
    }

    if (!container.volumePath) {
      return { success: false, error: 'Container has no volume path' };
    }

    // Find the backup file
    const backupDir = path.join(BACKUP_BASE, container.containerName);
    const filename = `${container.containerName}-${backupId}.tar.gz`;
    const backupPath = path.join(backupDir, filename);

    // Security: verify backup path is within backup base
    const resolvedPath = path.resolve(backupPath);
    if (!resolvedPath.startsWith(path.resolve(BACKUP_BASE))) {
      return { success: false, error: 'Invalid backup ID' };
    }

    try {
      await fs.access(backupPath);
    } catch {
      return { success: false, error: `Backup not found: ${backupId}` };
    }

    log.info({
      containerDbId,
      backupId,
      backupPath,
      volumePath: container.volumePath,
    }, 'Restoring workspace from backup');

    try {
      // Clear the current volume directory (keep the directory itself)
      const entries = await fs.readdir(container.volumePath);
      for (const entry of entries) {
        await fs.rm(path.join(container.volumePath, entry), { recursive: true, force: true });
      }

      // Extract backup into the volume directory
      // The tar was created with -C parent basename, so extract into parent
      await execFileAsync('tar', [
        '-xzf',
        backupPath,
        '-C',
        path.dirname(container.volumePath),
      ], {
        timeout: BACKUP_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Fix ownership to node user (uid 1000)
      try {
        await execFileAsync('chown', ['-R', '1000:1000', container.volumePath], {
          timeout: 30_000,
        });
      } catch {
        log.warn({ containerDbId }, 'Could not chown restored volume (may be normal on some systems)');
      }

      log.info({ containerDbId, backupId }, 'Workspace restored from backup');

      return { success: true, restoredFrom: filename };
    } catch (err) {
      log.error({
        containerDbId,
        error: (err as Error).message,
      }, 'Workspace restore failed');

      return { success: false, error: `Restore failed: ${(err as Error).message}` };
    }
  }

  // ===========================================
  // List Backups
  // ===========================================

  /**
   * List available backups for a container
   */
  async listBackups(containerDbId: string): Promise<BackupInfo[]> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { containerName: true },
    });

    if (!container) return [];

    const backupDir = path.join(BACKUP_BASE, container.containerName);

    try {
      await fs.access(backupDir);
    } catch {
      return []; // No backups exist
    }

    const files = await fs.readdir(backupDir);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.tar.gz')) continue;

      const filePath = path.join(backupDir, file);
      try {
        const stat = await fs.stat(filePath);
        const sizeMb = stat.size / (1024 * 1024);

        // Extract backup ID from filename: {containerName}-{backupId}.tar.gz
        const prefix = `${container.containerName}-`;
        const backupIdStr = file.startsWith(prefix)
          ? file.slice(prefix.length, -7) // Remove prefix and .tar.gz
          : file.slice(0, -7);

        backups.push({
          id: backupIdStr,
          containerDbId,
          containerName: container.containerName,
          filename: file,
          sizeBytes: stat.size,
          sizeMb: Math.round(sizeMb * 100) / 100,
          createdAt: stat.mtime,
        });
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort newest first
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return backups;
  }

  // ===========================================
  // Delete Backup
  // ===========================================

  /**
   * Delete a specific backup
   */
  async deleteBackup(containerDbId: string, backupId: string): Promise<{ success: boolean; error?: string }> {
    const container = await prisma.workspaceContainer.findUnique({
      where: { id: containerDbId },
      select: { containerName: true },
    });

    if (!container) return { success: false, error: 'Container not found' };

    const backupDir = path.join(BACKUP_BASE, container.containerName);
    const filename = `${container.containerName}-${backupId}.tar.gz`;
    const backupPath = path.join(backupDir, filename);

    // Security: verify path
    const resolvedPath = path.resolve(backupPath);
    if (!resolvedPath.startsWith(path.resolve(BACKUP_BASE))) {
      return { success: false, error: 'Invalid backup ID' };
    }

    try {
      await fs.unlink(backupPath);
      log.info({ containerDbId, backupId }, 'Backup deleted');
      return { success: true };
    } catch {
      return { success: false, error: 'Backup not found' };
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /**
   * Remove oldest backups beyond the max limit
   */
  private async pruneOldBackups(containerName: string): Promise<void> {
    const backupDir = path.join(BACKUP_BASE, containerName);

    try {
      const files = await fs.readdir(backupDir);
      const tarFiles = files.filter(f => f.endsWith('.tar.gz'));

      if (tarFiles.length <= MAX_BACKUPS_PER_CONTAINER) return;

      // Sort by modification time (oldest first)
      const withStats = await Promise.all(
        tarFiles.map(async (f) => {
          const stat = await fs.stat(path.join(backupDir, f));
          return { file: f, mtime: stat.mtime.getTime() };
        }),
      );

      withStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest until we're at the limit
      const toDelete = withStats.slice(0, withStats.length - MAX_BACKUPS_PER_CONTAINER);

      for (const { file } of toDelete) {
        await fs.unlink(path.join(backupDir, file));
        log.info({ containerName, file }, 'Pruned old backup');
      }
    } catch (err) {
      log.warn({ containerName, error: (err as Error).message }, 'Backup pruning failed');
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const workspaceBackupService = new WorkspaceBackupService();
