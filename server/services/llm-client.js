import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('llm');

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
      } catch {
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
