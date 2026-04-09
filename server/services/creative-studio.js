/**
 * AI Creative Studio - generates complete ad packages:
 * copy variations, image directions, video scripts, targeting suggestions.
 * Uses OmniRoute LLM for all generation.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('creative-studio');

const PLATFORM_SPECS = {
  meta: { primaryText: 125, headline: 40, description: 30, imageRatio: '1:1 or 4:5' },
  google: { headline: 30, description: 90, headlineCount: 15, descCount: 4 },
  tiktok: { adText: 100, imageRatio: '9:16', videoMax: 60 },
};

const SYSTEM_PROMPT = `Kamu adalah AI Creative Director untuk digital advertising di Indonesia.

Tugas: Generate COMPLETE ad package untuk produk yang diberikan.

OUTPUT FORMAT (JSON):
{
  "copies": [
    {
      "model": "1",
      "model_name": "P.A.S",
      "hook": "max 10 kata, attention-grabbing first line",
      "body": "main copy, max 125 karakter untuk Meta",
      "cta": "call to action text",
      "headline": "max 40 karakter",
      "description": "max 30 karakter"
    },
    { "model": "2", "model_name": "Efek Gravitasi", ... },
    { "model": "3", "model_name": "Hasil x3", ... },
    { "model": "4", "model_name": "Prospects-to-Prospects", ... }
  ],
  "imageDirections": [
    {
      "description": "Detailed image scene description for designer/AI image tool",
      "layout": "product center, lifestyle background",
      "colors": "warm tones, orange accent",
      "textOverlay": "short text to put on image",
      "mood": "urgent, exciting"
    }
  ],
  "videoScript": {
    "duration": "15-30 detik",
    "hook": { "time": "0-3s", "visual": "scene description", "voiceover": "text", "onScreen": "text overlay" },
    "problem": { "time": "3-8s", "visual": "...", "voiceover": "...", "onScreen": "..." },
    "solution": { "time": "8-15s", "visual": "...", "voiceover": "...", "onScreen": "..." },
    "cta": { "time": "15-20s", "visual": "...", "voiceover": "...", "onScreen": "..." }
  },
  "targetingSuggestions": {
    "interests": [
      { "name": "Digital marketing", "reason": "directly relevant to product" },
      { "name": "Entrepreneurship", "reason": "target audience interest" }
    ],
    "ageRange": { "min": 25, "max": 45 },
    "locations": ["Indonesia"],
    "genderNote": "All genders"
  }
}

RULES:
- Semua copy dalam Bahasa Indonesia
- Hook harus provokatif dan curiosity-driven
- Body harus spesifik, bukan generic
- CTA harus actionable
- Image direction harus detail dan bisa dieksekusi
- Video script harus punya hook kuat di 3 detik pertama
- Targeting suggestions harus relevan dengan produk dan audience
`;

function parseJsonSafe(raw) {
  try {
    const match = raw.match(/```json\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
    return match ? JSON.parse(match[1]) : JSON.parse(raw);
  } catch {
    return { error: 'Failed to parse AI response', raw_content: raw };
  }
}

export class CreativeStudio {
  constructor(llmClient) {
    this.llm = llmClient;
    this.timeoutMs = 45000;
  }

  async generateAdPackage(product, target, keunggulan, platform = 'meta', format = 'single_image') {
    const specs = PLATFORM_SPECS[platform] || PLATFORM_SPECS.meta;

    const userPrompt = `Generate complete ad package untuk:
PRODUK: ${product}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}
PLATFORM: ${platform}
FORMAT: ${format}
SPECS: Primary text max ${specs.primaryText || 125} chars, Headline max ${specs.headline || 40} chars

Generate 4 copy variations (P.A.S, Efek Gravitasi, Hasil x3, Prospects-to-Prospects) + image directions + video script + targeting suggestions.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      log.info('Generating ad package', { product, platform, format });
      const content = await this.llm.call(SYSTEM_PROMPT, userPrompt, { temperature: 0.8, max_tokens: 4000, signal: controller.signal });
      const result = parseJsonSafe(content);

      const response = {
        copies: result.copies || [],
        imageDirections: result.imageDirections || [],
        videoScript: result.videoScript || null,
        targetingSuggestions: result.targetingSuggestions || { interests: [], ageRange: { min: 25, max: 55 }, locations: ['Indonesia'] },
        raw: result.error ? content : undefined,
      };

      if (result.error) {
        log.warn('Ad package generation had parsing errors', { error: result.error });
      } else {
        log.info('Ad package generated successfully', { copiesCount: response.copies.length, platform });
      }

      return response;
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        log.warn('Ad package generation timed out', { timeoutMs: this.timeoutMs });
        return { error: 'AI generation timed out after 45 seconds', timeout: true, copies: [], imageDirections: [], targetingSuggestions: { interests: [] } };
      }
      log.error('Ad package generation failed', { error: err.message });
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateCopyOnly(product, target, keunggulan, platform = 'meta') {
    const specs = PLATFORM_SPECS[platform] || PLATFORM_SPECS.meta;
    const prompt = `Generate 4 ad copy variations untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}. Platform: ${platform} (max ${specs.primaryText || 125} chars primary text, max ${specs.headline || 40} chars headline).`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const content = await this.llm.call(SYSTEM_PROMPT, prompt, { temperature: 0.8, max_tokens: 2000, signal: controller.signal });
      const result = parseJsonSafe(content);
      return result.copies || [];
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        return [];
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async generateVideoScript(product, target, keunggulan) {
    const prompt = `Generate ONLY a video script untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}. Format: hook (0-3s), problem (3-8s), solution (8-15s), CTA (15-20s). Return JSON with videoScript field only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const content = await this.llm.call(SYSTEM_PROMPT, prompt, { temperature: 0.7, max_tokens: 1500, signal: controller.signal });
      const result = parseJsonSafe(content);
      return result.videoScript || result;
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        return { error: 'AI generation timed out after 45 seconds', timeout: true };
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async suggestTargeting(product, target, keunggulan) {
    const prompt = `Suggest Meta Ads targeting untuk: PRODUK: ${product}, TARGET: ${target}, KEUNGGULAN: ${keunggulan}. Return JSON with targetingSuggestions field (interests with names, ageRange, locations).`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const content = await this.llm.call(SYSTEM_PROMPT, prompt, { temperature: 0.5, max_tokens: 1000, signal: controller.signal });
      const result = parseJsonSafe(content);
      return result.targetingSuggestions || result;
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        return { error: 'AI generation timed out after 45 seconds', timeout: true, interests: [] };
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
