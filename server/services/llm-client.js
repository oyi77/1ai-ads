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

export class LLMClient {
  constructor({ url, model, apiKey, timeout } = {}) {
    this.url = url || config.llm.url;
    this.model = model || config.llm.model;
    this.apiKey = apiKey || config.llm.apiKey;
    this.timeout = timeout || config.llm.timeout;
  }

  updateConfig({ url, model, apiKey, timeout }) {
    if (url) this.url = url;
    if (model) this.model = model;
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (timeout) this.timeout = timeout;
    _pipelineInstance = null;
  }

  buildPayload(systemContent, userContent, options = {}) {
    return {
      model: options.model || this.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: options.temperature || 0.8,
      max_tokens: options.max_tokens || 4000,
    };
  }

  extractContent(data) {
    if (!data) return null;
    return data?.choices?.[0]?.message?.content || null;
  }

  async call(systemContent, userContent, options = {}) {
    const pipeline = await getAIPipeline();
    if (pipeline) {
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

    let apiUrl = this.url;
    if (!apiUrl.includes('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
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
    let modelsUrl = this.url;
    if (modelsUrl.includes('/chat/completions')) {
      modelsUrl = modelsUrl.replace('/chat/completions', '/models');
    } else {
      try {
        const u = new URL(modelsUrl);
        if (!u.pathname.endsWith('/models')) {
          u.pathname = u.pathname.replace(/\/$/, '') + '/models';
        }
        modelsUrl = u.toString();
      } catch (err) {
        log.debug('URL parse failed for models endpoint', { error: err.message });
        modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
      }
    }

    log.info(`Fetching models from: ${modelsUrl}`);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
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
    return data.data || [];
  }
}
