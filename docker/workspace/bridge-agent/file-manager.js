/**
 * File Manager Service
 * 
 * Handles all file operations within the workspace directory.
 * All paths are sandboxed to WORKSPACE_DIR — no escape allowed.
 */

'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { lookup } = require('./mime-utils');

class FileManager {
  constructor({ workspaceDir, log, logCollector }) {
    this.workspaceDir = workspaceDir;
    this.log = log;
    this.logCollector = logCollector;
  }

  /**
   * Resolve and validate a path is within workspace
   * Prevents directory traversal attacks
   */
  _safePath(relativePath) {
    // Strip leading slash — frontend sends paths like /hello.js
    // path.resolve treats leading-slash strings as absolute, which would escape workspace
    const cleaned = (relativePath || '.').replace(/^\/+/, '') || '.';
    const resolved = path.resolve(this.workspaceDir, cleaned);
    if (!resolved.startsWith(this.workspaceDir)) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }
    return resolved;
  }

  /**
   * List files in a directory
   */
  async list(dirPath = '.', recursive = false, _depth = 0) {
    // Prevent stack overflow from deeply nested directories
    if (_depth > 20) return [];

    const fullPath = this._safePath(dirPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const result = [];
    for (const entry of entries) {
      // Skip hidden files and node_modules at top level for cleaner listing
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const entryPath = path.join(fullPath, entry.name);
      const relativePath = path.relative(this.workspaceDir, entryPath);
      const isDir = entry.isDirectory();

      // Only stat files (for size + mtime). Directories don't need size.
      // Wrap in try/catch to handle TOCTOU race (file deleted between readdir and stat).
      let sizeBytes = 0;
      let updatedAt = new Date().toISOString();
      if (!isDir) {
        try {
          const stat = await fs.stat(entryPath);
          sizeBytes = stat.size;
          updatedAt = stat.mtime.toISOString();
        } catch {
          continue; // File was deleted between readdir and stat — skip it
        }
      }

      const item = {
        name: entry.name,
        path: '/' + relativePath,
        type: isDir ? 'DIRECTORY' : 'FILE',
        sizeBytes,
        mimeType: entry.isFile() ? lookup(entry.name) : null,
        isPlugin: isDir
          ? await this._isPluginDir(entry.name, relativePath)
          : this._isPluginFile(entry.name, relativePath),
        updatedAt,
      };

      if (recursive && isDir && entry.name !== 'node_modules') {
        item.children = await this.list(relativePath, true, _depth + 1);
      }

      result.push(item);
    }

    // Sort: directories first, then alphabetical
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'DIRECTORY' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /**
   * Read file content
   */
  async read(filePath) {
    const fullPath = this._safePath(filePath);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      throw new Error('Cannot read a directory — use file.list instead');
    }

    // Limit file size to 5MB for reading
    if (stat.size > 5 * 1024 * 1024) {
      throw new Error(`File too large to read (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 5MB`);
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return {
      path: filePath,
      content,
      sizeBytes: stat.size,
      mimeType: lookup(filePath),
      updatedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Write file content (create or overwrite)
   * @param {string} filePath
   * @param {string} content
   * @param {boolean} createDirs
   */
  async write(filePath, content, createDirs = true) {
    // Limit write size to 10MB to prevent OOM / disk fill
    const MAX_WRITE_BYTES = 10 * 1024 * 1024;
    if (typeof content === 'string' && Buffer.byteLength(content, 'utf-8') > MAX_WRITE_BYTES) {
      throw new Error(`Content too large to write (${(Buffer.byteLength(content, 'utf-8') / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
    }

    const fullPath = this._safePath(filePath);

    if (createDirs) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
    }

    await fs.writeFile(fullPath, content, 'utf-8');
    const stat = await fs.stat(fullPath);

    this.logCollector.log('info', 'system', `File written: ${filePath} (${stat.size} bytes)`);

    return {
      path: filePath,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Write multiple files at once (for directory plugin scaffolding).
   * Creates directories as needed. All writes are sequential for safety.
   * @param {Array<{path: string, content: string}>} files - Files to write
   * @returns {Array<{path: string, sizeBytes: number}>} Written file results
   */
  async writeMulti(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('files must be a non-empty array of {path, content}');
    }
    if (files.length > 50) {
      throw new Error('Maximum 50 files per writeMulti call');
    }

    // Enforce 50MB total size limit across all files
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
    let totalBytes = 0;
    for (const file of files) {
      if (!file.path || typeof file.content !== 'string') {
        throw new Error(`Invalid file entry: ${JSON.stringify(file)}`);
      }
      totalBytes += Buffer.byteLength(file.content, 'utf-8');
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(`Total content too large (>${(MAX_TOTAL_BYTES / 1024 / 1024)}MB). Split into multiple writeMulti calls.`);
      }
    }

    const results = [];
    for (const file of files) {
      const result = await this.write(file.path, file.content, true);
      results.push({ path: result.path, sizeBytes: result.sizeBytes });
    }

    this.logCollector.log('info', 'system', `writeMulti: ${results.length} files written`);
    return results;
  }

  /**
   * Delete a file or directory
   */
  async delete(filePath) {
    const fullPath = this._safePath(filePath);

    // Prevent deleting the workspace root
    if (fullPath === this.workspaceDir) {
      throw new Error('Cannot delete workspace root');
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    this.logCollector.log('info', 'system', `Deleted: ${filePath}`);
    return { deleted: filePath };
  }

  /**
   * Create a directory
   */
  async mkdir(dirPath) {
    const fullPath = this._safePath(dirPath);
    await fs.mkdir(fullPath, { recursive: true });
    return { created: dirPath };
  }

  /**
   * Rename/move a file or directory
   */
  async rename(oldPath, newPath) {
    const fullOld = this._safePath(oldPath);
    const fullNew = this._safePath(newPath);

    // Ensure target directory exists
    await fs.mkdir(path.dirname(fullNew), { recursive: true });
    await fs.rename(fullOld, fullNew);

    this.logCollector.log('info', 'system', `Renamed: ${oldPath} → ${newPath}`);
    return { oldPath, newPath };
  }

  /**
   * Upload file (binary data as base64)
   */
  async upload(filePath, data, encoding = 'base64') {
    const fullPath = this._safePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    const buffer = Buffer.from(data, encoding);
    await fs.writeFile(fullPath, buffer);
    const stat = await fs.stat(fullPath);

    this.logCollector.log('info', 'system', `File uploaded: ${filePath} (${stat.size} bytes)`);
    return {
      path: filePath,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Download file (returns base64-encoded content)
   */
  async download(filePath) {
    const fullPath = this._safePath(filePath);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      throw new Error('Cannot download a directory');
    }

    // Limit download size to 50MB
    if (stat.size > 50 * 1024 * 1024) {
      throw new Error(`File too large to download (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 50MB`);
    }

    const buffer = await fs.readFile(fullPath);
    return {
      path: filePath,
      data: buffer.toString('base64'),
      sizeBytes: stat.size,
      mimeType: lookup(filePath),
    };
  }

  /**
   * Get file/directory statistics
   */
  async stat(filePath) {
    const fullPath = this._safePath(filePath);
    const stat = await fs.stat(fullPath);
    const relativePath = path.relative(this.workspaceDir, fullPath);

    return {
      path: '/' + relativePath,
      name: path.basename(fullPath),
      type: stat.isDirectory() ? 'DIRECTORY' : 'FILE',
      sizeBytes: stat.size,
      mimeType: stat.isFile() ? lookup(filePath) : null,
      isPlugin: stat.isFile()
        ? this._isPluginFile(path.basename(fullPath), relativePath)
        : await this._isPluginDir(path.basename(fullPath), relativePath),
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
  }

  /**
   * Check if a file or directory is a plugin.
   * Files: in plugins/ directory with .js/.ts/.mjs extension.
   * Directories: directly inside plugins/ and containing plugin.json or an entry .js file.
   */
  _isPluginFile(name, relativePath) {
    const isInPluginsDir = relativePath.startsWith('plugins/') || relativePath.startsWith('plugins\\');
    if (!isInPluginsDir) return false;

    const hasPluginExt = name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.mjs');
    return hasPluginExt;
  }

  /**
   * Check if a directory is a plugin directory (plugins/{slug}/ with plugin.json or index.js).
   * Only checks direct children of the plugins/ folder.
   * Async to avoid blocking the event loop.
   */
  async _isPluginDir(name, relativePath) {
    const isDirectChildOfPlugins =
      (relativePath === `plugins/${name}` || relativePath === `plugins\\${name}`);
    if (!isDirectChildOfPlugins) return false;

    // Check if plugin.json or index.js exists inside
    const dirPath = path.join(this.workspaceDir, relativePath);
    try {
      const stat = await fs.stat(path.join(dirPath, 'plugin.json'));
      return stat.isFile();
    } catch {
      try {
        const stat = await fs.stat(path.join(dirPath, 'index.js'));
        return stat.isFile();
      } catch {
        return false;
      }
    }
  }
}

module.exports = { FileManager };
