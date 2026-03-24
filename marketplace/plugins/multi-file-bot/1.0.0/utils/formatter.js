'use strict';

/**
 * Formatting Utilities
 *
 * Shared formatting helpers used across handlers.
 */

function formatHelp() {
  return [
    '*Multi-file Plugin* 🤖',
    '',
    'This is a template showing how to structure a multi-file plugin.',
    '',
    '*Commands:*',
    '/start — Show this help message',
    '/help — Show this help message',
    '/stats — Show message statistics',
    '',
    'Send any message and I\'ll echo it back!',
  ].join('\n');
}

function formatError(error) {
  return `❌ Error: ${error.message || 'Unknown error'}`;
}

module.exports = { formatHelp, formatError };
