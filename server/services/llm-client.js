export class LLMClient {
  constructor({ url, model, timeout } = {}) {
    this.url = url || process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions';
    this.model = model || process.env.OMNIROUTE_MODEL || 'auto/pro-fast';
    this.timeout = timeout || parseInt(process.env.LLM_TIMEOUT || '30000', 10);
  }

  buildPayload(systemContent, userContent, options = {}) {
    return {
      model: this.model,
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

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(this.buildPayload(systemContent, userContent, options)),
      });

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
}
