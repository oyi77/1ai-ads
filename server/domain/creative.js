/**
 * Domain: Creative — BerkahKarya Framework + Scoring + Fatigue
 *
 * Pure business logic for:
 * - Ad copy generation (BerkahKarya 4-model framework)
 * - Creative quality scoring
 * - Fatigue detection
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('domain:creative');

// ── BerkahKarya Ads Framework ────────────────────────────────

const CONTENT_MODELS = {
  PAS: { name: 'P.A.S (Problem-Agitate-Solution)', structure: ['Problem', 'Agitate', 'Solution', 'Benefits', 'Social Proof', 'CTA'] },
  GRAVITASI: { name: 'Efek Gravitasi', structure: ['Hook Curiosity', 'Reveal Problem', 'Solution Teaser', 'Benefits', 'CTA'] },
  HASIL_X3: { name: 'Hasil x3', structure: ['Bold Result Claim', 'Proof', 'How It Works', 'Benefits', 'CTA'] },
  P2P: { name: 'Prospects-to-Prospects', structure: ['Customer Story', 'Before State', 'After State', 'How They Did It', 'CTA'] },
};

const SYSTEM_PROMPT = `Kamu adalah AI Ads Copywriter dari BerkahKarya yang menggunakan BerkahKarya Ads Framework.

FRAMEWORK INTI — VALUE CREATION (WAJIB):
- OUTPUT: Hasil konkret yang didapat customer
- DURASI: Seberapa cepat hasil tercapai
- RISIKO: Kurangi dengan garansi/social proof
- USAHA: Tunjukkan mudahnya proses
- PENGORBANAN: Tidak perlu korbankan hal lain

4 CONTENT MODELS:
1. P.A.S (Problem-Agitate-Solution)
2. Efek Gravitasi
3. Hasil x3
4. Prospects-to-Prospects

RULES:
- Hook max 10 kata
- Body copy: jelas, spesifik, benefit-driven
- CTA: action-oriented, urgent
- Setiap model harus punya angle berbeda 180°

OUTPUT FORMAT:
Generate 4 iklan (1 per model) dalam format JSON:
{"format": "single_image", "ads": [{"model": "1", "model_name": "P.A.S", "hook": "...", "body": "...", "cta": "..."}]}`;

/**
 * Generate ad copies using LLM with BerkahKarya framework.
 * @param {object} llmClient
 * @param {string} product
 * @param {string} target
 * @param {string} keunggulan
 * @returns {object} { ads: [...] } or { error: ... }
 */
export async function generateAdCopies(llmClient, product, target, keunggulan) {
  const prompt = `Generate 4 iklan untuk:\nPRODUK: ${product}\nTARGET: ${target}\nKEUNGGULAN: ${keunggulan}`;

  try {
    log.info('Generating ad copies', { product, target });
    const content = await llmClient.call(SYSTEM_PROMPT, prompt);
    const result = parseJsonResponse(content);
    if (result.error) {
      log.warn('Ad generation returned error', { error: result.error });
    } else {
      log.info('Ad generation successful', { copiesCount: result.ads?.length || 0 });
    }
    return result;
  } catch (err) {
    log.error('Ad generation failed', { error: err.message });
    return { error: err.message };
  }
}

function parseJsonResponse(raw) {
  try {
    const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/) || raw.match(/```\n([\s\S]*?)\n```/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(raw);
  } catch {
    return { error: 'Failed to parse AI response as JSON', raw_content: raw };
  }
}

// ── Creative Scoring ─────────────────────────────────────────

/**
 * Score a creative based on engagement metrics.
 * @param {object} metrics — { impressions, clicks, conversions, spend, ctr, cpc, roas }
 * @returns {object} { score: 0-100, breakdown: {...}, suggestions: [...] }
 */
export function scoreCreative(metrics) {
  const { impressions = 0, clicks = 0, conversions = 0, spend = 0, ctr = 0, cpc = 0, roas = 0 } = metrics;

  const breakdown = {
    engagement: Math.min(100, Math.round(ctr * 20)),        // CTR 5% = 100
    efficiency: Math.max(0, Math.round(100 - cpc)),          // CPC 0 = 100
    profitability: Math.min(100, Math.round(roas * 25)),     // ROAS 4x = 100
    scale: Math.min(100, Math.round(Math.log10(Math.max(1, impressions)) * 15)),
  };

  const score = Math.round(
    breakdown.engagement * 0.3 +
    breakdown.efficiency * 0.25 +
    breakdown.profitability * 0.35 +
    breakdown.scale * 0.1
  );

  const suggestions = [];
  if (ctr < 1) suggestions.push('Improve hook — CTR below 1%');
  if (cpc > 150) suggestions.push('Reduce CPC — try narrower targeting');
  if (roas < 1) suggestions.push('Creative not profitable — consider pausing');
  if (impressions < 1000) suggestions.push('Low reach — increase budget or expand audience');

  return { score: Math.min(100, Math.max(0, score)), breakdown, suggestions };
}

// ── Fatigue Detection ────────────────────────────────────────

/**
 * Detect creative fatigue from historical metrics.
 * @param {object[]} history — array of daily metrics (newest first)
 * @returns {object} { fatigued: boolean, severity: 'none'|'low'|'medium'|'high', signals: [...] }
 */
export function detectFatigue(history) {
  if (!history || history.length < 3) {
    return { fatigued: false, severity: 'none', signals: [] };
  }

  const signals = [];
  const recent = history.slice(0, 3);
  const older = history.slice(3, 7);

  // CTR declining trend
  const recentCtr = recent.reduce((s, h) => s + (h.ctr || 0), 0) / recent.length;
  const olderCtr = older.length > 0 ? older.reduce((s, h) => s + (h.ctr || 0), 0) / older.length : recentCtr;
  if (olderCtr > 0 && recentCtr < olderCtr * 0.7) {
    signals.push({ type: 'ctr_decline', message: `CTR dropped ${((1 - recentCtr / olderCtr) * 100).toFixed(0)}%` });
  }

  // CPC increasing trend
  const recentCpc = recent.reduce((s, h) => s + (h.cpc || 0), 0) / recent.length;
  const olderCpc = older.length > 0 ? older.reduce((s, h) => s + (h.cpc || 0), 0) / older.length : recentCpc;
  if (olderCpc > 0 && recentCpc > olderCpc * 1.3) {
    signals.push({ type: 'cpc_increase', message: `CPC increased ${((recentCpc / olderCpc - 1) * 100).toFixed(0)}%` });
  }

  // Frequency too high (>3 impressions per user)
  const avgFrequency = recent.reduce((s, h) => s + (h.frequency || 0), 0) / recent.length;
  if (avgFrequency > 3) {
    signals.push({ type: 'high_frequency', message: `Frequency ${avgFrequency.toFixed(1)} — users seeing ad too often` });
  }

  const severity = signals.length >= 3 ? 'high' : signals.length >= 2 ? 'medium' : signals.length >= 1 ? 'low' : 'none';

  return { fatigued: signals.length > 0, severity, signals };
}
