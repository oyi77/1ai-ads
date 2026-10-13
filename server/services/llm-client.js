import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('llm');

let _AIPipelineClass = null;
let _pipelineInstance = null;

async function getAIPipeline() {
  if (_pipelineInstance) return _pipelineInstance;
  if (_AIPipelineClass === null) {
    try {
      const mod = await import('@1ai/ai-pipeline');
      _AIPipelineClass = mod.AIPipeline;
    } catch (err) {
      log.debug('AIPipeline import failed, using direct fetch', { error: err.message });
      _AIPipelineClass = undefined;
    }
  }
  if (!_AIPipelineClass) return null;

  _pipelineInstance = new _AIPipelineClass({
    mode: 'direct',
    directUrl: config.aiPipelineDirectUrl || config.llm.url,
    directApiKey: config.aiPipelineDirectApiKey || config.llm.apiKey,
    defaultModel: config.aiPipelineDefaultModel || config.llm.model,
    timeout: (config.llm.timeout || 30000),
  });
  return _pipelineInstance;
}

/**
 * Normalize a base endpoint + api format into concrete OpenAI / Anthropic URLs.
 *
 * `format` is one of:
 *   'openai'    → /v1/chat/completions (or /v1/messages if the host only speaks Anthropic)
 *   'anthropic' → /v1/messages (Anthropic Messages API)
 * When undefined the format is inferred from the configured URL.
 *
 * `url` may be a full endpoint (kept as-is), a base with a version segment
 * (`.../v1`), or a bare host — the missing pieces are appended.
 */
export function deriveEndpoints(rawUrl, format) {
  const url = String(rawUrl || '').trim().replace(/\/+$/, '');
  const isOpenAi = url.includes('/chat/completions');
  const isAnth = /\/messages$/.test(url);

  let base = url;
  if (isOpenAi) base = url.replace('/chat/completions', '');
  else if (isAnth) base = url.replace('/messages', '');

  let fmt = format;
  if (!fmt) {
    if (isAnth) fmt = 'anthropic';
    else if (isOpenAi) fmt = 'openai';
    else fmt = 'openai';
  }

  if (isOpenAi || isAnth) {
    // Caller supplied a full endpoint already — honor it verbatim.
    return { chatUrl: url, modelsUrl: base + '/models', format: fmt };
  }

  const root = base.endsWith('/v1') ? base : base + '/v1';
  const chatPath = fmt === 'anthropic' ? '/messages' : '/chat/completions';
  return { chatUrl: root + chatPath, modelsUrl: root + '/models', format: fmt };
}

/** Infer API format from a URL (explicit full endpoint wins). */
function inferFormat(url) {
  return /\/messages$/.test(String(url || '')) ? 'anthropic' : 'openai';
}

export class LLMClient {
  constructor({ url, baseUrl, model, apiKey, timeout, format } = {}) {
    // this.url is stored verbatim (base or full endpoint); concrete chat/models
    // URLs are derived lazily at call time via deriveEndpoints.
    this.url = url || baseUrl || config.llm.url;
    this.format = format || inferFormat(url || baseUrl) || config.llm.format || 'openai';
    this.model = model || config.llm.model;
    this.apiKey = apiKey || config.llm.apiKey;
    this.timeout = timeout || config.llm.timeout;
  }

  updateConfig({ url, baseUrl, model, apiKey, timeout, format }) {
    const nextUrl = url || baseUrl;
    if (nextUrl) this.url = nextUrl;
    if (format) this.format = format;
    else if (nextUrl) this.format = inferFormat(nextUrl);
    if (model) this.model = model;
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (timeout) this.timeout = timeout;
    _pipelineInstance = null;
  }

  buildPayload(systemContent, userContent, options = {}) {
    const maxTokens = options.max_tokens || options.maxTokens || 4000;
    const temperature = options.temperature || 0.8;
    if (this.format === 'anthropic') {
      return {
        model: options.model || this.model,
        system: systemContent,
        messages: [{ role: 'user', content: userContent }],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      };
    }
    return {
      model: options.model || this.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };
  }

  extractContent(data) {
    if (!data) return null;
    if (data.choices?.[0]?.message?.content !== undefined && data.choices?.[0]?.message?.content !== null) {
      return data.choices[0].message.content;
    }
    const blocks = data.content;
    if (Array.isArray(blocks)) {
      const text = blocks
        .filter(b => b && (b.type === 'text' || typeof b.text === 'string'))
        .map(b => b.text || '')
        .join('');
      return text || null;
    }
    return null;
  }

  _headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      if (this.format === 'anthropic') {
        headers['x-api-key'] = this.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
    }
    return headers;
  }

  async call(systemContent, userContent, options = {}) {
    const pipeline = await getAIPipeline();
    if (pipeline && this.format !== 'anthropic') {
      try {
        const prompt = userContent;
        const pipelineOpts = {
          model: options.model || this.model,
          temperature: options.temperature || 0.8,
          maxTokens: options.max_tokens || 4000,
          systemPrompt: systemContent,
        };
        const result = await pipeline.generate(prompt, pipelineOpts);
        if (result?.content) return result.content;
      } catch (err) {
        log.warn('AIPipeline failed, falling back to direct fetch', { error: err.message });
      }
    }

    return this._directFetch(systemContent, userContent, options);
  }

  async _directFetch(systemContent, userContent, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    const apiUrl = deriveEndpoints(this.url, this.format).chatUrl;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: this._headers(),
        signal: controller.signal,
        body: JSON.stringify(this.buildPayload(systemContent, userContent, options)),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = this.extractContent(data);

      if (!content) {
        throw new Error('LLM returned empty or unexpected response');
      }

      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchModels() {
    const { modelsUrl } = deriveEndpoints(this.url, this.format);

    log.info(`Fetching models from: ${modelsUrl}`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      if (this.format === 'anthropic') {
        headers['x-api-key'] = this.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
    }

    const response = await fetch(modelsUrl, { headers });
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`Models fetch failed (${response.status})`, { preview: errorText.substring(0, 200) });
      throw new Error(`Failed to fetch models: ${response.statusText} (${response.status})`);
    }

    if (!contentType.includes('application/json')) {
      const text = await response.text();
      log.error(`Expected JSON but got ${contentType}`, { preview: text.substring(0, 200) });
      throw new Error(`AI Provider returned non-JSON response (${contentType}). Check your API Endpoint URL.`);
    }

    const data = await response.json();
    return data.data || data.models || [];
  }

  async generateImage(prompt, { size = '1024x1024', quality = 'standard' } = {}) {
    let imagesUrl = this.url;
    if (imagesUrl.includes('/chat/completions')) {
      imagesUrl = imagesUrl.replace('/chat/completions', '/images/generations');
    } else {
      try {
        const u = new URL(imagesUrl);
        u.pathname = u.pathname.replace(/\/$/, '').replace(/\/v1\/?$/, '') + '/v1/images/generations';
        imagesUrl = u.toString();
      } catch {
        imagesUrl = imagesUrl.replace(/\/$/, '') + '/images/generations';
      }
    }
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    const response = await fetch(imagesUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'dall-e-3', prompt, size, quality, n: 1 }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Image generation failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.data?.[0] || { url: null };
  }
}
