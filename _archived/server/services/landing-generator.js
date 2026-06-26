import { createLogger } from '../lib/logger.js';
import { LANDING_PAGE_PROMPT } from '../config/prompts.js';

const log = createLogger('landing-generator');

function parseHtmlResponse(raw) {
  const htmlMatch = raw.match(/```html\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
  return htmlMatch ? htmlMatch[1] : raw;
}

export class LandingGenerator {
  constructor(llmClient) {
    this.llm = llmClient;
    this.systemPrompt = LANDING_PAGE_PROMPT;
    this.timeoutMs = 45000;
  }

  buildPrompt(product, price, benefits, cta) {
    return `Generate landing page HTML untuk: PRODUK: ${product}, HARGA: ${price}, BENEFITS: ${benefits}, CTA: ${cta}`;
  }

  async generateLandingPage(product, price, benefits, cta) {
    const { signal, timeoutId } = this._createTimeout();
    try {
      log.info('Generating landing page', { product, price });
      const content = await this.llm.call(this.systemPrompt, this.buildPrompt(product, price, benefits, cta), {
        temperature: 0.7, max_tokens: 8000, signal,
      });
      const html = parseHtmlResponse(content);
      log.info('Landing page generated', { length: html?.length || 0 });
      return html;
    } catch (err) {
      return this._handleGenerationError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _createTimeout() {
    const controller = new AbortController();
    return { signal: controller.signal, timeoutId: setTimeout(() => controller.abort(), this.timeoutMs) };
  }

  _handleGenerationError(err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      log.warn('Landing page generation timed out', { timeoutMs: this.timeoutMs });
      return { error: 'AI generation timed out after 45 seconds', timeout: true };
    }
    log.error('Landing page generation failed', { error: err.message });
    throw err;
  }
}
