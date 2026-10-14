/**
 * AI Creative Studio - generates complete ad packages:
 * copy variations, image directions, video scripts, targeting suggestions.
 * Uses OmniRoute LLM for all generation.
 */

import { createLogger } from '../lib/logger.js';
import { CREATIVE_STUDIO_SYSTEM_PROMPT } from '../config/prompts.js';

const log = createLogger('creative-studio');

const PLATFORM_SPECS = {
  meta: { primaryText: 125, headline: 40, description: 30, imageRatio: '1:1 or 4:5' },
  google: { headline: 30, description: 90, headlineCount: 15, descCount: 4 },
  tiktok: { adText: 100, imageRatio: '9:16', videoMax: 60 },
};

const SYSTEM_PROMPT = CREATIVE_STUDIO_SYSTEM_PROMPT;

function parseJsonSafe(raw) {
  // 1) Try fenced ```json / ``` blocks first.
  try {
    const match = raw.match(/```json\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
    return match ? JSON.parse(match[1]) : JSON.parse(raw);
  } catch (err) {
    log.debug('JSON parse failed for creative response, trying markdown fallback', { error: err.message });
  }
  // 2) Fallback: LLM ignored the JSON instruction and returned markdown prose.
  //    Extract a structured package from the markdown structure.
  const md = parseMarkdownPackage(raw);
  if (md) return md;
  return { error: 'Failed to parse AI response', raw_content: raw };
}

/**
 * Parse a markdown-formatted ad package into the same shape as the JSON schema.
 * Handles the Gemini-typical output:
 *   ### 1️⃣ P.A.S (...)
 *   **Primary Text** *(N karakter)*
 *   > <text>
 *   **Headline** *(N karakter)*
 *   > <text>
 *   **CTA Button:** <text>
 */
function parseMarkdownPackage(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const copies = [];
  // Split on copy-section headers: "### <number-emoji> <model_name>"
  // Emoji numbers are multi-codepoint (1 + FE0F + 20E3); match them explicitly.
  const HEADER_RE = /#{3}\s*[\u0031-\u0039]\uFE0F?\u20E3?\s+(.+?)(?:\s*\(|\n)/g;
  const SPLIT_RE = /#{3}\s*[\u0031-\u0039]\uFE0F?\u20E3?\s+.+?(?:\s*\([^)]*\))?\s*\n/;
  const sections = raw.split(SPLIT_RE).slice(1);
  const headers = [...raw.matchAll(HEADER_RE)].map((m) => m[1].trim());

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i] || '';
    const modelName = headers[i] || `Variation ${i + 1}`;

    const primaryText = extractBlockquoteField(section, /Primary\s*Text/i);
    const headline = extractBlockquoteField(section, /Headline/i);
    const cta = extractInlineField(section, /CTA\s*Button/i);

    // Require at least primary text or headline to count as a valid copy.
    if (primaryText || headline) {
      copies.push({
        model: String(i + 1),
        model_name: modelName,
        hook: headline || primaryText?.slice(0, 40) || '',
        body: primaryText || '',
        cta: cta || 'Selengkapnya',
        headline: headline || '',
        description: '',
      });
    }
  }

  if (copies.length === 0) return null;

  // Best-effort extraction of image directions and video script sections.
  const imageDirections = extractImageDirections(raw);
  const videoScript = extractVideoScript(raw);
  const targetingSuggestions = extractTargeting(raw);

  return {
    copies,
    imageDirections,
    videoScript,
    targetingSuggestions,
  };
}

/** Extract the blockquote text that follows a **Field** label. */
function extractBlockquoteField(text, fieldRegex) {
  const re = new RegExp(`\\*\\*${fieldRegex.source}\\*\\*[^\\n]*\\n>\\s*(.+)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Extract an inline "**Label:** value" field. */
function extractInlineField(text, fieldRegex) {
  const re = new RegExp(`\\*\\*${fieldRegex.source}:?\\*\\*\\s*:?\\s*(.+)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractImageDirections(raw) {
  const directions = [];
  const section = raw.split(/#{2,3}\s*[🖼️ ]*IMAGE/i)[1];
  if (!section) return directions;
  // Each variation starts with **Variasi X — "name"**
  const blocks = section.split(/\*\*Variasi\s+\w+\s*—?\s*["“]/).slice(1);
  for (const block of blocks) {
    const name = block.split(/[""”]/)[0];
    const lines = block.split('\n').filter((l) => l.trim().startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim());
    const textOverlay = lines.find((l) => /overlay|teks/i.test(l));
    directions.push({
      description: lines.join(' ') || block.trim().slice(0, 200),
      layout: name || '',
      colors: '',
      textOverlay: textOverlay || '',
      mood: '',
    });
  }
  return directions;
}

function extractVideoScript(raw) {
  const section = raw.split(/#{2,3}\s*[🎬 ]*VIDEO/i)[1];
  if (!section) return null;
  const rows = section.match(/\|\s*\d+[–-]\d+\s*\|[^|]+\|[^|]+\|/g);
  if (!rows) return null;
  const scenes = rows.map((r) => {
    const cols = r.split('|').map((c) => c.trim()).filter(Boolean);
    return {
      time: cols[0],
      visual: cols[1] || '',
      voiceover: cols[2] || '',
      onScreen: '',
    };
  });
  const labels = ['hook', 'problem', 'solution', 'cta'];
  const result = { duration: '15-30 detik' };
  scenes.forEach((s, i) => {
    result[labels[i] || `scene${i}`] = s;
  });
  return result;
}

function extractTargeting(raw) {
  const section = raw.split(/#{2,3}\s*[🎯 ]*TARGETING/i)[1];
  if (!section) return { interests: [], ageRange: { min: 25, max: 55 }, locations: ['Indonesia'] };
  const ageMatch = section.match(/(\d+)\s*[–-]\s*(\d+)\s*(?:tahun|thn)/i);
  const interests = [];
  const interestMatch = section.match(/Interest[^\n]*\*?:?\*?\s*\n([\s\S]*?)(?:\n\*\*|$)/i);
  if (interestMatch) {
    interestMatch[1].split('\n').forEach((line) => {
      // Handle "- Category: *item1, item2*" (italic) and "- item1, item2" (plain)
      const italic = line.match(/\*([^*]+)\*/);
      const items = italic ? italic[1] : line.replace(/^-\s*(?:[^:]+:\s*)?/, '');
      if (items) items.split(',').forEach((n) => {
        const name = n.trim().replace(/^\*|\*$/g, '');
        if (name) interests.push({ name, reason: '' });
      });
    });
  }
  return {
    interests,
    ageRange: ageMatch ? { min: +ageMatch[1], max: +ageMatch[2] } : { min: 25, max: 55 },
    locations: ['Indonesia'],
  };
}

export class CreativeStudio {
  constructor(llmClient) {
    this.llm = llmClient;
    this.timeoutMs = 45000;
  }

  async generateAdPackage(product, target, keunggulan, platform = 'meta', format = 'single_image') {
    const userPrompt = this._buildPackagePrompt(product, target, keunggulan, platform, format);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      log.info('Generating ad package', { product, platform, format });
      const content = await this.llm.call(SYSTEM_PROMPT, userPrompt, { temperature: 0.8, max_tokens: 4000, signal: controller.signal });
      return this._parsePackageResult(content, platform);
    } catch (err) {
      return this._handleGenerationError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _buildPackagePrompt(product, target, keunggulan, platform, format) {
    const specs = PLATFORM_SPECS[platform] || PLATFORM_SPECS.meta;
    return `Generate complete ad package untuk:
PRODUK: ${product}
TARGET AUDIENCE: ${target}
KEUNGGULAN: ${keunggulan}
PLATFORM: ${platform}
FORMAT: ${format}
SPECS: Primary text max ${specs.primaryText || 125} chars, Headline max ${specs.headline || 40} chars

Generate 4 copy variations (P.A.S, Efek Gravitasi, Hasil x3, Prospects-to-Prospects) + image directions + video script + targeting suggestions.`;
  }

  _parsePackageResult(content, platform) {
    const result = parseJsonSafe(content);
    const response = {
      copies: result.copies || [],
      imageDirections: result.imageDirections || [],
      videoScript: result.videoScript || null,
      targetingSuggestions: result.targetingSuggestions || { interests: [], ageRange: { min: 25, max: 55 }, locations: ['Indonesia'] },
      raw: result.error ? content : undefined,
    };
    if (result.error) log.warn('Ad package generation had parsing errors', { error: result.error });
    else log.info('Ad package generated successfully', { copiesCount: response.copies.length, platform });
    return response;
  }

  _handleGenerationError(err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      log.warn('Ad package generation timed out', { timeoutMs: this.timeoutMs });
      return { error: 'AI generation timed out after 45 seconds', timeout: true, copies: [], imageDirections: [], targetingSuggestions: { interests: [] } };
    }
    log.error('Ad package generation failed', { error: err.message });
    throw err;
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
