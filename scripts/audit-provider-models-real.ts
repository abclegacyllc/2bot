/**
 * REAL Provider Model Audit — Queries all 5 provider APIs
 * 
 * Discovers every model available, checks tool/function-calling support,
 * pricing, context length, and capabilities from the actual API responses.
 * 
 * Usage: source .env.local && npx tsx scripts/audit-provider-models-real.ts
 */

// ============================================================================
// 1. TOGETHER AI — Full model list with capabilities
// ============================================================================

async function auditTogether() {
  const key = process.env.TWOBOT_TOGETHER_API_KEY;
  if (!key) { console.log('⚠ TOGETHER: No API key'); return; }

  console.log('\n' + '='.repeat(100));
  console.log('  TOGETHER AI — Full Model Catalog (from API)');
  console.log('='.repeat(100));

  const res = await fetch('https://api.together.xyz/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) { console.log('⚠ TOGETHER API error:', res.status, await res.text()); return; }

  const models = await res.json() as any[];
  console.log(`\n  Total models: ${models.length}\n`);

  // Filter to chat/instruct models (skip embedding, image, etc)
  const chatModels = models.filter((m: any) => {
    const type = m.type || m.model_type || '';
    const id = m.id || '';
    return type === 'chat' || type === 'language' || type === 'code' ||
           id.includes('Instruct') || id.includes('instruct') || id.includes('chat') ||
           id.includes('Coder') || id.includes('Thinker') || id.includes('Thinking') ||
           id.includes('GLM') || id.includes('Kimi') || id.includes('DeepSeek') ||
           id.includes('gpt-oss') || id.includes('Apriel') || id.includes('gemma') ||
           id.includes('trinity') || id.includes('Nemotron') || id.includes('Ministral') ||
           id.includes('cogito') || id.includes('Qwen3') || id.includes('Llama') ||
           id.includes('Qwen2') || id.includes('Maverick') || id.includes('Scout') ||
           id.includes('mimo') || id.includes('Mimo') || id.includes('grok') || id.includes('Grok');
  });

  console.log(`  Chat/Instruct models: ${chatModels.length}\n`);

  // Print ALL fields for first model to see structure
  if (chatModels.length > 0) {
    console.log('  --- Sample model structure (first model) ---');
    const sample = chatModels[0];
    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`    ${key}: ${JSON.stringify(value)}`);
      } else {
        console.log(`    ${key}: ${value}`);
      }
    }
    console.log('  ---\n');
  }

  // Print all chat models with key info
  console.log('  ID'.padEnd(60) + 'TYPE'.padEnd(12) + 'CTX_LEN'.padEnd(10) + 'PRICING'.padEnd(35) + 'EXTRA');
  console.log('  ' + '-'.repeat(96));

  for (const m of chatModels.sort((a: any, b: any) => (a.id > b.id ? 1 : -1))) {
    const pricing = m.pricing || {};
    const priceStr = pricing.input !== undefined
      ? `$${(parseFloat(pricing.input) * 1e6).toFixed(3)}/$${(parseFloat(pricing.output) * 1e6).toFixed(3)} /MTok`
      : 'no pricing';
    const ctxLen = m.context_length ? `${(m.context_length / 1000).toFixed(0)}k` : '?';
    const type = m.type || m.model_type || '?';

    // Check ALL fields that might indicate tool support
    const extraFields: string[] = [];
    if (m.tool_use !== undefined) extraFields.push(`tool_use=${m.tool_use}`);
    if (m.supports_tool_use !== undefined) extraFields.push(`supports_tool_use=${m.supports_tool_use}`);
    if (m.capabilities) extraFields.push(`caps=${JSON.stringify(m.capabilities)}`);
    if (m.supports_function_calling !== undefined) extraFields.push(`func_calling=${m.supports_function_calling}`);
    if (m.features) extraFields.push(`features=${JSON.stringify(m.features)}`);
    if (m.config) extraFields.push(`config_keys=${Object.keys(m.config).join(',')}`);

    console.log(`  ${m.id.padEnd(58)} ${type.padEnd(10)} ${ctxLen.padEnd(8)} ${priceStr.padEnd(33)} ${extraFields.join(' | ')}`);
  }
}

// ============================================================================
// 2. OPENROUTER — Full model list with tool/function calling support
// ============================================================================

async function auditOpenRouter() {
  const key = process.env.TWOBOT_OPENROUTER_API_KEY;
  if (!key) { console.log('⚠ OPENROUTER: No API key'); return; }

  console.log('\n' + '='.repeat(100));
  console.log('  OPENROUTER — Full Model Catalog (from API)');
  console.log('='.repeat(100));

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${key}`, 'HTTP-Referer': 'https://2bot.org' },
  });
  if (!res.ok) { console.log('⚠ OPENROUTER API error:', res.status, await res.text()); return; }

  const json = await res.json() as any;
  const models = json.data || json;
  console.log(`\n  Total models: ${models.length}\n`);

  // Print sample structure
  if (models.length > 0) {
    console.log('  --- Sample model structure (first model) ---');
    const sample = models[0];
    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`    ${key}: ${JSON.stringify(value)}`);
      } else {
        console.log(`    ${key}: ${value}`);
      }
    }
    console.log('  ---\n');
  }

  // Filter interesting models (code-capable, popular providers)
  const codeModels = models.filter((m: any) => {
    const id = (m.id || '').toLowerCase();
    return id.includes('gpt') || id.includes('claude') || id.includes('gemini') ||
           id.includes('deepseek') || id.includes('llama') || id.includes('qwen') ||
           id.includes('kimi') || id.includes('glm') || id.includes('grok') ||
           id.includes('mistral') || id.includes('command') || id.includes('mimo') ||
           id.includes('minimax') || id.includes('trinity') || id.includes('cogito') ||
           id.includes('codestral');
  });

  console.log(`  Code-relevant models: ${codeModels.length}\n`);
  console.log('  ID'.padEnd(55) + 'TOOLS'.padEnd(8) + 'CTX'.padEnd(8) + 'PRICING ($/MTok)'.padEnd(30) + 'SUPPORTED_PARAMS');
  console.log('  ' + '-'.repeat(96));

  for (const m of codeModels.sort((a: any, b: any) => (a.id > b.id ? 1 : -1))) {
    const pricing = m.pricing || {};
    const inputPrice = parseFloat(pricing.prompt || '0') * 1e6;
    const outputPrice = parseFloat(pricing.completion || '0') * 1e6;
    const priceStr = `$${inputPrice.toFixed(2)}/$${outputPrice.toFixed(2)}`;
    const ctxLen = m.context_length ? `${(m.context_length / 1000).toFixed(0)}k` : '?';

    // Check supported_parameters for tools
    const params: string[] = m.supported_parameters || [];
    const hasTools = params.includes('tools') || params.includes('tool_choice');
    const toolStr = hasTools ? '✅' : '❌';

    // Show relevant supported_parameters
    const relevantParams = params.filter((p: string) =>
      p.includes('tool') || p === 'functions' || p === 'function_call' ||
      p === 'response_format' || p === 'json_mode'
    );

    console.log(`  ${m.id.padEnd(53)} ${toolStr.padEnd(6)} ${ctxLen.padEnd(6)} ${priceStr.padEnd(28)} ${relevantParams.join(', ')}`);
  }

  // Also print ALL models that have tools support for completeness
  console.log('\n\n  === ALL OpenRouter models with tools support ===\n');
  const allToolModels = models
    .filter((m: any) => {
      const params: string[] = m.supported_parameters || [];
      return params.includes('tools');
    })
    .sort((a: any, b: any) => {
      const aPrice = parseFloat(a.pricing?.prompt || '0') + parseFloat(a.pricing?.completion || '0');
      const bPrice = parseFloat(b.pricing?.prompt || '0') + parseFloat(b.pricing?.completion || '0');
      return aPrice - bPrice;
    });

  console.log(`  ${allToolModels.length} models with tools support:\n`);
  for (const m of allToolModels) {
    const pricing = m.pricing || {};
    const inputPrice = parseFloat(pricing.prompt || '0') * 1e6;
    const outputPrice = parseFloat(pricing.completion || '0') * 1e6;
    console.log(`  ${m.id.padEnd(55)} $${inputPrice.toFixed(2)}/$${outputPrice.toFixed(2)} /MTok   ctx=${m.context_length || '?'}`);
  }
}

// ============================================================================
// 3. FIREWORKS — Full model list
// ============================================================================

async function auditFireworks() {
  const key = process.env.TWOBOT_FIREWORKS_API_KEY;
  if (!key) { console.log('⚠ FIREWORKS: No API key'); return; }

  console.log('\n' + '='.repeat(100));
  console.log('  FIREWORKS — Full Model Catalog (from API)');
  console.log('='.repeat(100));

  const res = await fetch('https://api.fireworks.ai/inference/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) { console.log('⚠ FIREWORKS API error:', res.status, await res.text()); return; }

  const json = await res.json() as any;
  const models = json.data || json;
  console.log(`\n  Total models: ${models.length}\n`);

  // Print sample structure
  if (models.length > 0) {
    console.log('  --- Sample model structure ---');
    const sample = models.find((m: any) => (m.id || '').includes('gpt-oss') || (m.id || '').includes('kimi')) || models[0];
    for (const [key, value] of Object.entries(sample)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`    ${key}: ${JSON.stringify(value)}`);
      } else {
        console.log(`    ${key}: ${value}`);
      }
    }
    console.log('  ---\n');
  }

  // Print all models
  for (const m of models.sort((a: any, b: any) => ((a.id || '') > (b.id || '') ? 1 : -1))) {
    const extra: string[] = [];
    if (m.context_length) extra.push(`ctx=${m.context_length}`);
    if (m.supports_tools !== undefined) extra.push(`tools=${m.supports_tools}`);
    if (m.capabilities) extra.push(`caps=${JSON.stringify(m.capabilities)}`);
    if (m.owned_by) extra.push(`by=${m.owned_by}`);
    console.log(`  ${(m.id || '').padEnd(60)} ${extra.join(' | ')}`);
  }
}

// ============================================================================
// 4. OPENAI — Full model list
// ============================================================================

async function auditOpenAI() {
  const key = process.env.TWOBOT_OPENAI_API_KEY;
  if (!key) { console.log('⚠ OPENAI: No API key'); return; }

  console.log('\n' + '='.repeat(100));
  console.log('  OPENAI — Full Model Catalog (from API)');
  console.log('='.repeat(100));

  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) { console.log('⚠ OPENAI API error:', res.status, await res.text()); return; }

  const json = await res.json() as any;
  const models = json.data || json;
  console.log(`\n  Total models: ${models.length}\n`);

  // Print sample structure
  if (models.length > 0) {
    const sample = models.find((m: any) => (m.id || '').includes('gpt-4o')) || models[0];
    console.log('  --- Sample model structure ---');
    for (const [key, value] of Object.entries(sample)) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }
    console.log('  ---\n');
  }

  // Filter chat models
  const chatModels = models.filter((m: any) => {
    const id = m.id || '';
    return id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') ||
           id.startsWith('o4') || id.startsWith('chatgpt');
  });

  console.log(`  Chat models: ${chatModels.length}\n`);
  for (const m of chatModels.sort((a: any, b: any) => (a.id > b.id ? 1 : -1))) {
    const extra: string[] = [];
    if (m.owned_by) extra.push(`by=${m.owned_by}`);
    if (m.created) extra.push(`created=${new Date(m.created * 1000).toISOString().split('T')[0]}`);
    console.log(`  ${(m.id || '').padEnd(40)} ${extra.join(' | ')}`);
  }
}

// ============================================================================
// 5. ANTHROPIC — Model list (messages API)
// ============================================================================

async function auditAnthropic() {
  const key = process.env.TWOBOT_ANTHROPIC_API_KEY;
  if (!key) { console.log('⚠ ANTHROPIC: No API key'); return; }

  console.log('\n' + '='.repeat(100));
  console.log('  ANTHROPIC — Model Catalog (from API)');
  console.log('='.repeat(100));

  // Try the models endpoint (newer Anthropic API)
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  });

  if (res.ok) {
    const json = await res.json() as any;
    const models = json.data || json.models || json;
    console.log(`\n  Total models: ${Array.isArray(models) ? models.length : 'N/A'}\n`);

    if (Array.isArray(models)) {
      // Print sample
      if (models.length > 0) {
        console.log('  --- Sample model structure ---');
        for (const [key, value] of Object.entries(models[0])) {
          console.log(`    ${key}: ${JSON.stringify(value)}`);
        }
        console.log('  ---\n');
      }

      for (const m of models) {
        const extra: string[] = [];
        if (m.display_name) extra.push(m.display_name);
        if (m.created_at) extra.push(`created=${m.created_at}`);
        if (m.type) extra.push(`type=${m.type}`);
        console.log(`  ${(m.id || '').padEnd(45)} ${extra.join(' | ')}`);
      }
    } else {
      console.log('  Response:', JSON.stringify(json).slice(0, 500));
    }
  } else {
    console.log(`  Models endpoint returned ${res.status} — trying alternative...`);
    console.log(`  Response: ${(await res.text()).slice(0, 300)}`);
    console.log('\n  Known Anthropic models (from docs):');
    console.log('  claude-opus-4-6          — $5/$25 per MTok — tools ✅');
    console.log('  claude-sonnet-4-5        — $3/$15 per MTok — tools ✅');
    console.log('  claude-haiku-4-5         — $1/$5 per MTok  — tools ✅');
    console.log('  claude-3-5-haiku         — $0.8/$4 per MTok — tools ✅');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(100));
  console.log('  REAL PROVIDER MODEL AUDIT — Querying Live APIs');
  console.log('  Date: ' + new Date().toISOString());
  console.log('='.repeat(100));

  // Run all provider audits
  await auditTogether();
  await auditOpenRouter();
  await auditFireworks();
  await auditOpenAI();
  await auditAnthropic();
}

main().catch(console.error);
