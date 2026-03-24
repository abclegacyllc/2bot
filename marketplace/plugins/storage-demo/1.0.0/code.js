'use strict';

/**
 * Storage Demo Template
 *
 * Demonstrates all Plugin SDK storage operations:
 *   set, get, has, delete, increment, keys, getMany, setMany
 *
 * Runs the demo once on startup, then stays alive for events.
 */

const sdk = require('/bridge-agent/plugin-sdk');

async function runDemo() {
  console.log('[storage-demo] Running storage operations...');

  // 1. Set a value
  await sdk.storage.set('greeting', 'Hello from storage!');
  console.log('[storage-demo] Set greeting');

  // 2. Get a value
  const greeting = await sdk.storage.get('greeting');
  console.log('[storage-demo] Got greeting:', greeting);

  // 3. Set with TTL (auto-expires after 60 seconds)
  await sdk.storage.set('temporary', 'I will expire', 60);
  console.log('[storage-demo] Set temporary value with 60s TTL');

  // 4. Check existence
  const exists = await sdk.storage.has('greeting');
  console.log('[storage-demo] greeting exists:', exists);

  // 5. Increment a counter
  const count = await sdk.storage.increment('runCount');
  console.log('[storage-demo] Run count:', count);

  // 6. Increment by a custom amount
  const score = await sdk.storage.increment('score', 10);
  console.log('[storage-demo] Score:', score);

  // 7. Store a JSON object
  await sdk.storage.set('config', { theme: 'dark', language: 'en' });
  const config = await sdk.storage.get('config');
  console.log('[storage-demo] Config:', JSON.stringify(config));

  // 8. Delete a key
  await sdk.storage.delete('temporary');
  const deleted = await sdk.storage.has('temporary');
  console.log('[storage-demo] temporary exists after delete:', deleted);

  // 9. Find keys matching a pattern
  const keys = await sdk.storage.keys('*');
  console.log('[storage-demo] All keys:', keys);

  console.log('[storage-demo] All operations complete!');
}

// Run demo on startup
runDemo().catch((err) => {
  console.error('[storage-demo] Error:', err);
});

// Stay alive and log any events received
sdk.onEvent(async (event) => {
  console.log('[storage-demo] Received event:', event.type);
  await sdk.storage.increment('eventsReceived');
});
