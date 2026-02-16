/**
 * Shared LLM client: calls OpenAI, Anthropic, or xAI (Grok) chat APIs.
 * Uses native fetch (Node 18+). Zero external dependencies.
 *
 * Provider is auto-detected from the model name:
 *   gpt-* / o1* / o3*  → OpenAI
 *   claude-*            → Anthropic
 *   grok-*              → xAI
 * Or set agentConfig.provider explicitly ("openai", "anthropic", "xai").
 */

const { createScopedLogger } = require('./logger');
const log = createScopedLogger('LLMClient');

const PROVIDERS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    buildRequest: (model, messages, apiKey) => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
    }),
    extractText: (body) => body?.choices?.[0]?.message?.content || '',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    buildRequest: (model, messages, apiKey) => {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const nonSystem = messages.filter((m) => m.role !== 'system');
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: system || undefined,
          messages: nonSystem.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        }),
      };
    },
    extractText: (body) => {
      if (!body?.content) return '';
      return body.content.map((b) => b.text || '').join('');
    },
  },
  xai: {
    url: 'https://api.x.ai/v1/chat/completions',
    buildRequest: (model, messages, apiKey) => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
    }),
    extractText: (body) => body?.choices?.[0]?.message?.content || '',
  },
};

function detectProvider(model) {
  const m = (model || '').toLowerCase();
  if (m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('grok')) return 'xai';
  return null;
}

/**
 * Call an LLM with a chat messages array.
 * @param {object} agentConfig - { model, apiKeyEnvVar, provider? }
 * @param {Array<{role:string,content:string}>} messages - chat messages (system, user, assistant)
 * @returns {Promise<string>} - the model's text response
 * @throws if config is missing, key is missing, or API returns an error
 */
async function chat(agentConfig, messages) {
  const { model, apiKeyEnvVar, provider: explicitProvider } = agentConfig || {};
  if (!model) throw new Error('llmClient: agentConfig.model is required');
  if (!apiKeyEnvVar) throw new Error('llmClient: agentConfig.apiKeyEnvVar is required');

  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) throw new Error(`llmClient: environment variable ${apiKeyEnvVar} is not set`);

  const providerKey = explicitProvider || detectProvider(model);
  if (!providerKey || !PROVIDERS[providerKey]) {
    throw new Error(`llmClient: cannot detect provider for model "${model}". Set agentConfig.provider to "openai", "anthropic", or "xai".`);
  }

  const prov = PROVIDERS[providerKey];
  const reqInit = prov.buildRequest(model, messages, apiKey);
  const msgCount = messages.length;
  const systemLen = messages.filter(m => m.role === 'system').reduce((n, m) => n + m.content.length, 0);
  const userLen = messages.filter(m => m.role === 'user').reduce((n, m) => n + m.content.length, 0);
  log.info(`Calling ${providerKey}/${model}`, { msgCount, systemLen, userLen });

  const t0 = Date.now();
  const res = await fetch(prov.url, reqInit);
  const body = await res.json();
  const elapsedMs = Date.now() - t0;

  if (!res.ok) {
    const errMsg = body?.error?.message || body?.error?.type || JSON.stringify(body).slice(0, 300);
    log.error(`API error ${res.status} from ${providerKey}/${model} after ${elapsedMs}ms`, { errMsg });
    throw new Error(`llmClient: ${providerKey} API error ${res.status}: ${errMsg}`);
  }

  const text = prov.extractText(body);
  if (!text) {
    log.warn(`Empty response from ${providerKey}/${model} after ${elapsedMs}ms`);
    throw new Error('llmClient: empty response from ' + providerKey);
  }

  log.info(`Response from ${providerKey}/${model}`, { elapsedMs, responseLen: text.length });
  log.debug(`Response preview: ${text.slice(0, 300)}`);
  return text;
}

/**
 * Check whether an agentConfig has enough info to make an LLM call.
 */
function isConfigured(agentConfig) {
  if (!agentConfig?.model || !agentConfig?.apiKeyEnvVar) return false;
  return !!process.env[agentConfig.apiKeyEnvVar];
}

module.exports = { chat, isConfigured, detectProvider };
