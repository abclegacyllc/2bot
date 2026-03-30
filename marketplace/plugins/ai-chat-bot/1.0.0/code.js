'use strict';

/**
 * AI Chat Bot Template
 *
 * A Telegram bot powered by 2Bot AI. Responds to messages using
 * configurable AI models with conversation memory.
 *
 * In workflow mode: processes structured input and returns AI response as output.
 *
 * Config: { model: string, systemPrompt: string, maxHistory: number }
 */

const sdk = require('/bridge-agent/plugin-sdk');

sdk.onEvent(async (event) => {
  // Workflow mode: process input, return structured output (no gateway messages)
  if (sdk.isWorkflowStep(event)) {
    const input = sdk.getWorkflowInput(event);
    const prev = sdk.getWorkflowPreviousOutput(event);

    // Normalize workflow input from common shapes (text/message/content or raw object/string)
    const rawText =
      (input && (input.text ?? input.message ?? input.content ?? input.prompt)) ??
      (typeof input === 'string' ? input : null) ??
      (prev && (prev.text ?? prev.message ?? prev.content ?? prev.output)) ??
      (typeof prev === 'string' ? prev : null);

    let text = '';
    if (typeof rawText === 'string') {
      text = rawText.trim();
    } else if (rawText !== null && rawText !== undefined) {
      try {
        text = JSON.stringify(rawText);
      } catch {
        text = String(rawText);
      }
    }

    const model = sdk.config.model || 'auto';
    const systemPrompt = sdk.config.systemPrompt || 'You are a helpful assistant.';

    // Avoid upstream provider 400s when workflow step has no usable input.
    if (!text) {
      return {
        content: '',
        model,
        skipped: true,
        reason: 'No workflow input provided for AI processing',
      };
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    const result = await sdk.ai.chat({ messages, model });
    return { content: result.content, model: result.model };
  }

  if (event.type !== 'telegram.message') return;

  const msg = event.data?.message;
  if (!msg?.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const model = sdk.config.model || 'auto';
  const systemPrompt = sdk.config.systemPrompt || 'You are a helpful assistant.';
  const maxHistory = sdk.config.maxHistory ?? 10;

  try {
    // Load conversation history from storage
    const historyKey = 'chat:' + chatId;
    const history = (await sdk.storage.get(historyKey)) || [];

    // Build messages array with system prompt + history + new message
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-maxHistory),
      { role: 'user', content: msg.text },
    ];

    // Call AI
    const result = await sdk.ai.chat({ messages, model });

    // Save updated history
    history.push({ role: 'user', content: msg.text });
    history.push({ role: 'assistant', content: result.content });
    await sdk.storage.set(historyKey, history.slice(-maxHistory * 2));

    // Send AI response to Telegram
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: result.content,
    });
  } catch (err) {
    console.error('[ai-chat-bot] Error:', err.message);
    await sdk.gateway.execute(event.gatewayId, 'sendMessage', {
      chat_id: chatId,
      text: 'Sorry, I encountered an error. Please try again.',
    });
  }
});

console.log('[ai-chat-bot] AI Chat Bot ready — waiting for messages');
