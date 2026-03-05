/**
 * Simple MIME Type Lookup
 * Zero dependencies — just extension → type mapping for common files.
 */

'use strict';

const MIME_MAP = {
  // JavaScript / TypeScript
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'application/typescript',
  '.jsx': 'application/javascript',

  // Data
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.toml': 'text/toml',

  // Text
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.log': 'text/plain',
  '.env': 'text/plain',

  // Web
  '.html': 'text/html',
  '.css': 'text/css',

  // Config
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',

  // Shell
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',

  // Python
  '.py': 'text/x-python',

  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',

  // Archives
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',

  // Binary
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
};

/**
 * Look up MIME type by file path or name
 * @param {string} filePath - File path or name
 * @returns {string | null} MIME type or null
 */
function lookup(filePath) {
  if (!filePath) return null;
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  return MIME_MAP[ext] || null;
}

module.exports = { lookup, MIME_MAP };
