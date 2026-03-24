'use strict';

/**
 * AI Image Bot Template
 *
 * A Telegram bot that generates images from text prompts using 2Bot AI.
 * Users send a message and receive an AI-generated image in reply.
 *
 * Config: { model: string, triggerPrefix: string }
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text) return;

  const triggerPrefix = sdk.config.triggerPrefix || '/imagine ';

  // Only respond to messages starting with the trigger prefix
  if (!msg.text.startsWith(triggerPrefix)) return;

  const prompt = msg.text.slice(triggerPrefix.length).trim();
  if (!prompt) {
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: 'Please provide a prompt after ' + triggerPrefix,
    });
    return;
  }

  const model = sdk.config.model || 'auto';

  try {
    // Send a "generating..." status
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '🎨 Generating image...',
    });

    // Generate image via AI
    const result = await sdk.ai.generateImage({ prompt, model });

    if (result.images && result.images.length > 0) {
      await sdk.gateway.execute(event.gatewayId, 'sendPhoto', {
        chat_id: msg.chat.id,
        photo: result.images[0].url,
        caption: result.images[0].revisedPrompt || prompt,
      });
    }

    // Track usage
    await sdk.storage.increment('imagesGenerated');
  } catch (err) {
    console.error('[ai-image-bot] Error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: msg.chat.id,
      text: 'Sorry, image generation failed. Please try again.',
    });
  }
});

console.log('[ai-image-bot] AI Image Bot ready — send /imagine <prompt>');
