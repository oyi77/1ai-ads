import { createLogger } from '../lib/logger.js';

const log = createLogger('ad-generator');
const SYSTEM_PROMPT = `Kamu adalah AI Ads Copywriter dari BerkahKarya.

4 CONTENT MODELS:
1. P.A.S (Problem-Agitate-Solution)
2. Efek Gravitasi
3. Hasil x3
4. Prospects-to-Prospects

OUTPUT FORMAT:
Generate 4 iklan (1 per model) dalam format JSON:
{"format": "single_image", "ads": [{"model": "1", "model_name": "P.A.S", "hook": "...", "body": "...", "cta": "..."}]}`;

function parseJsonResponse(raw) {
  try {
    const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(raw);
  } catch {
    return { error: 'Failed to parse AI response as JSON', raw_content: raw };
  }
}

export class AdGenerator {
  constructor(llmClient) {
    this.llm = llmClient;
    this.timeoutMs = 45000;
  }

  buildPrompt(product, target, keunggulan) {
    return `Generate 4 iklan untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}`;
  }

  async generateAds(product, target, keunggulan) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      log.info('Generating ad copies', { product, target });
      const content = await this.llm.call(SYSTEM_PROMPT, this.buildPrompt(product, target, keunggulan), {
        signal: controller.signal
      });
      const result = parseJsonResponse(content);
      if (result.error) {
        log.warn('Ad generation returned error', { error: result.error });
      } else {
        log.info('Ad generation successful', { copiesCount: result.ads?.length || 0 });
      }
      return result;
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        log.warn('Ad generation timed out', { timeoutMs: this.timeoutMs });
        return { error: 'AI generation timed out after 45 seconds', timeout: true };
      }
      log.error('Ad generation failed', { error: err.message });
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
