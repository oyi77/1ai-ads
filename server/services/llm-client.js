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

/**
 * Turn the model config into an ordered failover list.
 * Accepts a comma-separated string ("a,b,c") or an array. Dedupes, drops blanks.
 */
export function normalizeModels(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  for (const raw of list) {
    const id = String(raw || '').trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out.length ? out : ['auto'];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Transient = worth retrying another model / another attempt: 408/429/5xx and network errors. */
export function isTransientLlmStatus(status) {
  return status === 408 || status === 429 || (typeof status === 'number' && status >= 500);
}

export class LLMClient {
  constructor({ url, baseUrl, model, apiKey, timeout, format, models, retries, retryBaseMs } = {}) {
    // this.url is stored verbatim (base or full endpoint); concrete chat/models
    // URLs are derived lazily at call time via deriveEndpoints.
    this.url = url || baseUrl || config.llm.url;
    this.format = format || inferFormat(url || baseUrl) || config.llm.format || 'openai';
    this.model = model || config.llm.model;
    this.apiKey = apiKey || config.llm.apiKey;
    this.timeout = timeout || config.llm.timeout;
    // Failover chain: comma-separated in the model string or an explicit list.
    // models[0] is the primary; each subsequent id is tried after a transient
    // failure. Keeps AI alive when one upstream model 429s/503s/times out.
    this.models = normalizeModels(models || this.model);
    this.retries = retries ?? config.llm.retries;
    this.retryBaseMs = retryBaseMs ?? config.llm.retryBaseMs;
    this.modelsCache = { at: 0, data: null };
    this.modelsCacheTtlMs = 10 * 60 * 1000;
  }

  updateConfig({ url, baseUrl, model, apiKey, timeout, format, models, retries, retryBaseMs }) {
    const nextUrl = url || baseUrl;
    if (nextUrl) this.url = nextUrl;
    if (format) this.format = format;
    else if (nextUrl) this.format = inferFormat(nextUrl);
    if (model) this.model = model;
    if (models || model) this.models = normalizeModels(models || this.model);
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (timeout) this.timeout = timeout;
    if (retries !== undefined) this.retries = retries;
    if (retryBaseMs !== undefined) this.retryBaseMs = retryBaseMs;
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

    return this._callWithFailover(systemContent, userContent, options);
  }

  /**
   * Try each model in the failover chain. Per model: up to `retries` attempts
   * with exponential backoff on transient failures (429/5xx/timeout).
   *
   * Two independent flags on the error decide routing:
   *   transient → worth retrying the SAME model (429/5xx/network/timeout)
   *   failover  → worth trying the NEXT model (everything except a
   *               payload/auth error that would fail on any model: 400/401/403)
   * So a 404 (model retired) moves straight to the next model, while a 400
   * (bad request body) aborts immediately instead of burning the chain.
   */
  async _callWithFailover(systemContent, userContent, options = {}) {
    const chain = options.model ? [String(options.model)] : this.models;
    let lastErr;

    for (let m = 0; m < chain.length; m++) {
      const model = chain[m];
      for (let attempt = 1; attempt <= this.retries; attempt++) {
        try {
          return await this._directFetch(systemContent, userContent, { ...options, model });
        } catch (err) {
          lastErr = err;
          const transient = err.transient === true;
          const failover = err.failover !== false;

          if (!transient && !failover) throw err; // 400/401/403 — model-independent
          if (!transient) break;                  // model-specific (404) → next model

          const hasNextAttempt = attempt < this.retries;
          if (!hasNextAttempt) break;             // attempts spent → next model

          const delay = this.retryBaseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
          log.warn('LLM transient failure, retrying same model', { model, attempt, delay, error: err.message });
          await sleep(delay);
        }
      }
      if (m < chain.length - 1) {
        log.warn('LLM model exhausted, failing over', { from: model, to: chain[m + 1] });
      }
    }

    throw lastErr || new Error('LLM call failed');
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
        const err = new Error(`LLM API Error (${response.status}): ${errorText}`);
        err.status = response.status;
        err.transient = isTransientLlmStatus(response.status);
        // 400 (bad request), 401 (bad key) and 403 (forbidden) would fail on
        // EVERY model — abort the chain instead of burning the fallbacks.
        err.failover = !(response.status === 400 || response.status === 401 || response.status === 403);
        throw err;
      }

      const data = await response.json();
      const content = this.extractContent(data);

      if (!content) {
        const err = new Error('LLM returned empty or unexpected response');
        err.transient = true; // e.g. thinking-only output at low max_tokens — worth another go
        throw err;
      }

      return content;
    } catch (err) {
      // Abort/network failures are transient too.
      if (err.name === 'AbortError' || err.transient === undefined || /fetch failed|ECONN|ETIMEDOUT|socket/i.test(err.message || '')) {
        if (err.status === undefined) err.transient = true;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchModels({ force = false } = {}) {
    // Cache the (large, slow) model catalogue. 337 ids × every admin click
    // would otherwise re-hit the shared gateway each time.
    if (!force && this.modelsCache.data && Date.now() - this.modelsCache.at < this.modelsCacheTtlMs) {
      return this.modelsCache.data;
    }

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
    const list = data.data || data.models || [];
    this.modelsCache = { at: Date.now(), data: list };
    return list;
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

  /**
   * Lightweight health/readiness for the AI plane: probes the configured
   * endpoint + key with a minimal completion, and reports the model catalogue
   * size. Never throws — returns a structured status for the admin widget.
   */
  async aiHealth(timeoutMs = 15000) {
    const { chatUrl } = deriveEndpoints(this.url, this.format);
    const started = Date.now();
    const result = {
      ok: false,
      format: this.format,
      url: chatUrl,
      model: this.models[0] || this.model,
      failover: this.models.slice(1),
      latencyMs: null,
      error: null,
      modelsCount: null,
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(chatUrl, {
          method: 'POST',
          headers: this._headers(),
          signal: controller.signal,
          body: JSON.stringify(this.buildPayload('You are a health probe.', 'Reply with the single word: ok', { max_tokens: 8 })),
        });
        result.latencyMs = Date.now() - started;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          // Map the common quota/limit shapes so the widget can say something useful.
          if (res.status === 401 || res.status === 403) result.error = 'auth_failed';
          else if (res.status === 402) result.error = 'insufficient_credits';
          else if (res.status === 429) result.error = 'rate_limited';
          else if (res.status >= 500) result.error = 'upstream_error';
          else result.error = `http_${res.status}`;
          result.errorDetail = body.substring(0, 200);
          return result;
        }
        const data = await res.json();
        result.ok = !!this.extractContent(data);
        if (!result.ok) result.error = 'empty_response';
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      result.latencyMs = result.latencyMs ?? Date.now() - started;
      result.error = err.name === 'AbortError' ? 'timeout' : 'network_error';
      result.errorDetail = err.message;
    }

    // Catalogue size is best-effort (cached); never let it fail the probe.
    try {
      const models = await this.fetchModels();
      result.modelsCount = models.length;
    } catch {
      /* ignore */
    }
    return result;
  }
}
