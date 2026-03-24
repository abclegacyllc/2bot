'use strict';

/**
 * Multi-file Plugin — Entry Point
 *
 * This plugin splits logic into separate modules for maintainability.
 * The SDK is initialized here and event handling is delegated to handlers.
 */

const sdk = require('/bridge-agent/plugin-sdk');
const { handleMessage } = require('./handlers/message');
const { handleCallback } = require('./handlers/callback');

sdk.onEvent(async (event) => {
  console.log('[multi-file] Event received:', event.type);

  switch (event.type) {
    case 'telegram.message':
      await handleMessage(sdk, event);
      break;
    case 'telegram.callback':
      await handleCallback(sdk, event);
      break;
    default:
      console.log('[multi-file] Unhandled event type:', event.type);
  }
});

console.log('[multi-file] Multi-file plugin started');
