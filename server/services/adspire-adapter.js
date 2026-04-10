/**
 * AdSpire Adapter
 *
 * Optional integration with AdSpire API for competitor ad intelligence.
 * Mimics the AdIntelligenceService interface so it can be used as a drop-in replacement.
 *
 * Set AD_SPIRE_API_KEY environment variable to enable.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('adspire-adapter');

export class AdSpireAdapter {
  constructor({ apiKey, apiUrl } = {}) {
    this.apiKey = apiKey || config.adSpireApiKey;
    this.apiUrl = apiUrl || config.adSpireApiUrl;
    this.available = Boolean(this.apiKey);

    if (this.available) {
      log.info('AdSpire adapter initialized');
    } else {
      log.info('AdSpire adapter not configured (AD_SPIRE_API_KEY not set)');
    }
  }

  /**
   * Check if AdSpire integration is available.
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Get competitor ads via AdSpire API.
   * Mimics AdIntelligenceService.getCompetitorAds interface.
   *
   * @param {string} domain - Competitor domain
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Competitor ad data
   */
  async getCompetitorAds(domain, options = {}) {
    if (!this.available) {
      throw new Error('AdSpire API key not configured');
    }

    const { platform, limit = 50 } = options;

    log.info('Fetching competitor ads via AdSpire', { domain, platform });

    try {
      const params = new URLSearchParams({ domain, limit: String(limit) });
      if (platform) params.set('platform', platform);

      const response = await fetch(`${this.apiUrl}/competitor-ads?${params}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AdSpire API error (${response.status}): ${err}`);
      }

      const data = await response.json();

      // Normalize to match AdIntelligenceService output format
      return {
        domain,
        platform: platform || 'all',
        ads: (data.ads || []).map(ad => ({
          id: ad.id || ad.adId,
          platform: ad.platform || platform || 'unknown',
          headline: ad.headline || ad.title || '',
          description: ad.description || ad.body || '',
          imageUrl: ad.imageUrl || ad.creative?.imageUrl || null,
          landingUrl: ad.landingUrl || ad.clickUrl || null,
          status: ad.status || 'ACTIVE',
          metrics: {
            impressions: ad.impressions || ad.metrics?.impressions || 0,
            clicks: ad.clicks || ad.metrics?.clicks || 0,
            spend: ad.spend || ad.metrics?.spend || 0,
            ctr: ad.ctr || ad.metrics?.ctr || 0,
          },
          startedAt: ad.startedAt || ad.startDate || null,
          source: 'adspire',
        })),
        total: data.total || data.ads?.length || 0,
        fetchedAt: new Date().toISOString(),
        source: 'adspire',
      };
    } catch (error) {
      log.error('AdSpire API request failed', { domain, error: error.message });
      throw error;
    }
  }

  /**
   * Search ads by keyword via AdSpire.
   *
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchAds(keyword, options = {}) {
    if (!this.available) {
      throw new Error('AdSpire API key not configured');
    }

    const { platform, country = 'US', limit = 50 } = options;

    log.info('Searching ads via AdSpire', { keyword, platform, country });

    try {
      const params = new URLSearchParams({ keyword, country, limit: String(limit) });
      if (platform) params.set('platform', platform);

      const response = await fetch(`${this.apiUrl}/search?${params}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AdSpire API error (${response.status}): ${err}`);
      }

      return await response.json();
    } catch (error) {
      log.error('AdSpire search failed', { keyword, error: error.message });
      throw error;
    }
  }
}

/**
 * Create an AdSpire adapter if API key is configured, otherwise return null.
 *
 * @returns {AdSpireAdapter|null}
 */
export function createAdSpireAdapter() {
  const adapter = new AdSpireAdapter();
  return adapter.isAvailable() ? adapter : null;
}
