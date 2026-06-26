import { createLogger } from '../lib/logger.js';

const log = createLogger('audience-intel');

export class AudienceIntelligence {
  /**
   * @param {Object} metaApi - MetaAdsAPI instance
   * @param {Object} llmClient - LLMClient instance
   */
  constructor(metaApi, llmClient) {
    this.meta = metaApi;
    this.llm = llmClient;
  }

  /**
   * Get audience insights for a set of interests.
   * Uses Meta's Targeting Search API as a proxy for audience size.
   * @param {string[]} interests
   * @param {{ country?: string }} opts
   * @returns {Promise<Object>}
   */
  async getAudienceInsights(interests, { country = 'ID' } = {}) {
    if (!interests?.length) throw new Error('interests array is required');

    const results = [];
    for (const interest of interests) {
      try {
        const options = await this.meta.getTargetingOptions(interest);
        const match = options.find(o =>
          o.name.toLowerCase() === interest.toLowerCase()
        ) || options[0];

        if (match) {
          results.push({
            interest: match.name,
            id: match.id,
            audienceSize: match.audienceSize || 0,
            path: match.path || [],
            topic: match.topic,
            country,
          });
        } else {
          results.push({ interest, audienceSize: 0, country, notFound: true });
        }
      } catch (err) {
        log.warn('getAudienceInsights: interest lookup failed', { interest, error: err.message });
        results.push({ interest, audienceSize: 0, country, error: err.message });
      }
    }

    const totalReach = results.reduce((s, r) => s + (r.audienceSize || 0), 0);

    return {
      interests: results,
      totalReach,
      country,
      demographics: { note: 'Detailed demographics require Meta Audience Insights API (Marketing API approval needed).' },
    };
  }

  /**
   * Build a lookalike audience from a source custom audience.
   * @param {string} accountId
   * @param {{ sourceAudienceId: string, country?: string, ratio?: number }} opts
   * @returns {Promise<Object>}
   */
  async buildLookalikeAudience(accountId, { sourceAudienceId, country = 'ID', ratio = 0.01 } = {}) {
    if (!accountId) throw new Error('accountId is required');
    if (!sourceAudienceId) throw new Error('sourceAudienceId is required');

    log.info('buildLookalikeAudience', { accountId, sourceAudienceId, country, ratio });

    try {
      // Create lookalike via Meta Custom Audiences API
      const result = await this.meta.apiPost(`/${accountId}/customaudiences`, {
        name: `Lookalike_${sourceAudienceId}_${country}_${Date.now()}`,
        subtype: 'LOOKALIKE',
        origin_audience_id: sourceAudienceId,
        lookalike_spec: {
          origin: [{ id: sourceAudienceId, type: 'CUSTOM_AUDIENCE' }],
          starting_ratio: 0,
          ratio: Math.min(Math.max(ratio, 0.01), 0.20),
          country,
        },
      });

      return {
        audienceId: result.id,
        name: `Lookalike_${country}_${ratio}`,
        sourceAudienceId,
        country,
        ratio,
        status: 'created',
        estimatedSize: null, // Meta returns this async; poll audience endpoint later
      };
    } catch (err) {
      log.error('buildLookalikeAudience failed', { error: err.message });
      throw new Error(`Lookalike audience creation failed: ${err.message}`);
    }
  }

  /**
   * Detect audience overlap between two or more ad sets.
   * @param {string} accountId
   * @param {string[]} adsetIds
   * @returns {Promise<Array>}
   */
  async detectOverlap(accountId, adsetIds) {
    if (!accountId) throw new Error('accountId is required');
    if (!adsetIds || adsetIds.length < 2) throw new Error('At least 2 adsetIds required');

    const results = [];

    for (let i = 0; i < adsetIds.length; i++) {
      for (let j = i + 1; j < adsetIds.length; j++) {
        try {
          // Meta Audience Overlap endpoint
          const data = await this.meta.apiGet(`/${adsetIds[i]}/overlapaudiences`, {
            comparison_audience_id: adsetIds[j],
          });

          results.push({
            adset1: adsetIds[i],
            adset2: adsetIds[j],
            overlapPercent: data?.overlap_percentage ?? data?.similarity ?? null,
            overlapCount: data?.audience_count ?? null,
            recommendation: null,
          });
        } catch (err) {
          // Fallback: estimate overlap from targeting similarity
          log.warn('detectOverlap: API call failed, returning estimated', { error: err.message });
          results.push({
            adset1: adsetIds[i],
            adset2: adsetIds[j],
            overlapPercent: null,
            error: err.message,
            recommendation: 'Unable to calculate overlap. Consider using distinct targeting for each ad set.',
          });
        }
      }
    }

    // Add recommendations based on overlap
    for (const r of results) {
      if (r.overlapPercent !== null && !r.recommendation) {
        if (r.overlapPercent > 50) {
          r.recommendation = 'High overlap (>50%). Consider merging ad sets or differentiating targeting.';
        } else if (r.overlapPercent > 25) {
          r.recommendation = 'Moderate overlap (25-50%). Monitor for auction overlap fatigue.';
        } else {
          r.recommendation = 'Low overlap (<25%). Good targeting diversification.';
        }
      }
    }

    return results;
  }

  /**
   * Suggest interests based on product description (LLM-powered).
   * @param {string} product
   * @param {string} target
   * @param {{ existingInterests?: string[] }} opts
   * @returns {Promise<Array>}
   */
  async suggestInterests(product, target, { existingInterests = [] } = {}) {
    if (!product) throw new Error('product description is required');

    const prompt = [
      'You are a Meta Ads targeting expert.',
      `Product: ${product}`,
      target ? `Target audience: ${target}` : '',
      existingInterests.length ? `Already targeting: ${existingInterests.join(', ')}` : '',
      '',
      'Suggest 10-15 targeting interests for Facebook/Instagram ads.',
      'Return a JSON array of objects: [{ "interest": "string", "reason": "string" }]',
      'Focus on interests available in Meta Ads Manager. Be specific, avoid generic terms.',
    ].filter(Boolean).join('\n');

    let suggestions = [];

    if (this.llm) {
      try {
        const response = await this.llm.call(
          'You are a targeting research assistant. Return only valid JSON.',
          prompt,
          { temperature: 0.4 }
        );

        const parsed = this._parseJSON(response);
        if (Array.isArray(parsed)) {
          suggestions = parsed.map(s => ({
            interest: s.interest || s.name || s,
            reason: s.reason || '',
          }));
        }
      } catch (err) {
        log.warn('suggestInterests: LLM call failed', { error: err.message });
      }
    }

    // Validate each suggestion against Meta's targeting API
    const validated = [];
    for (const suggestion of suggestions) {
      try {
        const options = await this.meta.getTargetingOptions(suggestion.interest);
        const match = options.find(o =>
          o.name.toLowerCase() === suggestion.interest.toLowerCase()
        ) || options[0];

        validated.push({
          interest: match?.name || suggestion.interest,
          audienceSize: match?.audienceSize || 0,
          relevanceScore: match ? 1.0 : 0.3,
          reason: suggestion.reason,
          metaId: match?.id || null,
          valid: !!match,
        });
      } catch {
        validated.push({
          interest: suggestion.interest,
          audienceSize: 0,
          relevanceScore: 0.1,
          reason: suggestion.reason,
          valid: false,
        });
      }
    }

    // Filter out already-targeted interests
    const existingSet = new Set(existingInterests.map(i => i.toLowerCase()));
    const filtered = validated.filter(v => !existingSet.has(v.interest.toLowerCase()));

    return filtered.sort((a, b) => (b.valid - a.valid) || (b.audienceSize - a.audienceSize));
  }

  // ── Helpers ──────────────────────────────────────────────────

  _parseJSON(text) {
    if (!text) return null;
    // Try to extract JSON from LLM response (may have markdown fencing)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }
    try { return JSON.parse(text); } catch { return null; }
  }
}
