/**
 * Ad Intelligence Service for Competitor Monitoring
 *
 * Integrates with Similarweb API to fetch competitor advertising data,
 * analyze performance metrics, and identify bidding patterns.
 *
 * API Reference: https://developers.similarweb.com/
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CompetitorsRepository } from '../repositories/competitors.js';

const log = createLogger('ad-intelligence');

const SIMILARWEB_API_BASE = 'https://api.similarweb.com/v0';
const DEFAULT_RETRY_DELAY = 1000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 30000;

export class AdIntelligenceService {
  constructor(db) {
    this.db = db;
    this.apiKey = config.similarwebApiKey || null;
    this.requestCount = 0;
    this.lastRequestTime = null;
  }

  /**
   * Fetch active ads from a competitor's domain.
   *
   * @param {string} domain - Competitor domain (e.g., 'example.com')
   * @param {Object} options - Query options
   * @param {string} options.platform - Platform filter (e.g., 'google', 'facebook')
   * @param {string} options.country - Country filter (e.g., 'US', 'ID')
   * @param {string} options.startDate - Start date (ISO format)
   * @param {string} options.endDate - End date (ISO format)
   * @param {number} options.limit - Max results (default: 50)
   * @returns {Promise<Object>} Active ads with metadata
   */
  async getCompetitorAds(domain, options = {}) {
    const { platform, country = 'US', startDate, endDate, limit = 50 } = options;

    if (!this.apiKey) {
      log.warn('Similarweb API key not configured, returning empty data');
      return { domain, platform: platform || 'google', ads: [], total: 0, fetchedAt: new Date().toISOString(), mock: false };
    }

    const params = new URLSearchParams({
      api_key: this.apiKey,
      domain,
      format: 'json',
      main_domain_only: 'true',
    });

    if (platform) params.set('platform', platform);
    if (country) params.set('country', country);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);

    try {
      const data = await this._fetchWithRetry(
        `${SIMILARWEB_API_BASE}/competitor/search?${params}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT) }
      );

      const ads = this._extractAdData(data, domain, platform);

      log.info('Fetched competitor ads', {
        domain,
        platform,
        count: ads.length,
      });

      return {
        domain,
        platform,
        ads: ads.slice(0, limit),
        total: ads.length,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      log.error('Failed to fetch competitor ads', {
        domain,
        platform,
        error: error.message,
      });

      if (error.message.includes('API key')) {
        throw new Error('Similarweb API key is missing or invalid. Please configure SIMILARWEB_API_KEY.');
      }

      return { domain, platform: platform || 'google', ads: [], total: 0, fetchedAt: new Date().toISOString(), mock: false };
    }
  }

  /**
   * Aggregate ad performance metrics for a competitor.
   *
   * @param {string} domain - Competitor domain
   * @returns {Promise<Object>} Performance metrics
   */
  async getCompetitorMetrics(domain) {
    if (!this.apiKey) {
      log.warn('Similarweb API key not configured, returning empty metrics');
      return { domain, totalVisits: 0, avgVisitDuration: 0, bounceRate: 0, trafficSources: { organic: 0, paid: 0, referral: 0, social: 0, direct: 0 }, adMetrics: { estimatedAdSpend: 0, adImpressions: 0, adClicks: 0 }, fetchedAt: new Date().toISOString(), mock: false };
    }

    const params = new URLSearchParams({
      api_key: this.apiKey,
      domain,
      format: 'json',
      metrics: 'total_visits,avg_visit_duration,bounce_rate,traffic_sources',
    });

    try {
      const data = await this._fetchWithRetry(
        `${SIMILARWEB_API_BASE}/website/${domain}/total-traffic-and-engagement?${params}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT) }
      );

      const metrics = {
        domain,
        totalVisits: data.visits || 0,
        avgVisitDuration: data.avg_visit_duration || 0,
        bounceRate: data.bounce_rate || 0,
        trafficSources: {
          organic: data.organic_percentage || 0,
          paid: data.paid_percentage || 0,
          referral: data.referral_percentage || 0,
          social: data.social_percentage || 0,
          direct: data.direct_percentage || 0,
        },
        adMetrics: {
          estimatedAdSpend: data.estimated_ad_spend || 0,
          adImpressions: data.ad_impressions || 0,
          adClicks: data.ad_clicks || 0,
        },
        fetchedAt: new Date().toISOString(),
      };

      log.info('Fetched competitor metrics', {
        domain,
        totalVisits: metrics.totalVisits,
      });

      return metrics;
    } catch (error) {
      log.error('Failed to fetch competitor metrics', {
        domain,
        error: error.message,
      });

      return { domain, totalVisits: 0, avgVisitDuration: 0, bounceRate: 0, trafficSources: { organic: 0, paid: 0, referral: 0, social: 0, direct: 0 }, adMetrics: { estimatedAdSpend: 0, adImpressions: 0, adClicks: 0 }, fetchedAt: new Date().toISOString(), mock: false };
    }
  }

  /**
   * Analyze competitor bidding patterns and strategies.
   *
   * @param {string} domain - Competitor domain
   * @returns {Promise<Object>} Strategy analysis
   */
  async analyzeCompetitorStrategy(domain) {
    const [ads, metrics] = await Promise.all([
      this.getCompetitorAds(domain),
      this.getCompetitorMetrics(domain),
    ]);

    const strategy = {
      domain,
      platforms: this._analyzePlatformUsage(ads.ads),
      contentPatterns: this._analyzeContentPatterns(ads.ads),
      biddingBehavior: this._analyzeBiddingBehavior(metrics),
      estimatedBudget: this._estimateBudget(metrics),
      recommendations: this._generateRecommendations(ads.ads, metrics),
      analyzedAt: new Date().toISOString(),
    };

    log.info('Analyzed competitor strategy', {
      domain,
      platforms: Object.keys(strategy.platforms).length,
    });

    return strategy;
  }

  /**
   * Save ad data snapshot to database.
   *
   * @param {Object} data - Ad data to save
   * @returns {Promise<Object>} Created snapshot
   */
  saveSnapshot(data) {
    const repo = new CompetitorsRepository(this.db);
    return repo.create({
      url: data.domain,
      platform: data.platform || null,
      adData: data,
      snapshotType: 'api',
    });
  }

  /**
   * Fetch with retry logic and exponential backoff.
   *
   * @param {string} url - API endpoint URL
   * @param {Object} options - Fetch options
   * @param {number} retries - Current retry attempt
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _fetchWithRetry(url, options = {}, retries = 0) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AdForge/1.0.0 (+https://adforge.ai)',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try { errorData = JSON.parse(errorText); } catch { errorData = { error: errorText }; }

        throw new Error(
          `Similarweb API error ${response.status}: ${errorData.error?.message || errorText}`
        );
      }

      return await response.json();
    } catch (error) {
      if (retries < MAX_RETRIES && this._isRetryableError(error)) {
        const delay = DEFAULT_RETRY_DELAY * Math.pow(2, retries);
        log.warn(`Retrying request (attempt ${retries + 1}/${MAX_RETRIES})`, {
          url,
          delay,
          error: error.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this._fetchWithRetry(url, options, retries + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable.
   *
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryablePatterns = [
      /ETIMEDOUT/,
      /ECONNRESET/,
      /ENOTFOUND/,
      /EAI_AGAIN/,
      /timeout/i,
      /429/i,
      /500/i,
      /502/i,
      /503/i,
      /504/i,
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Extract ad data from API response.
   *
   * @param {Object} data - API response data
   * @param {string} domain - Domain
   * @param {string} platform - Platform filter
   * @returns {Array} Extracted ads
   * @private
   */
  _extractAdData(data, domain, platform) {
    if (!data || !Array.isArray(data.ads)) {
      return [];
    }

    return data.ads.map(ad => ({
      id: ad.id || `${domain}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      headline: ad.headline || ad.title || '',
      description: ad.description || ad.body || '',
      creativeUrl: ad.creative_url || ad.image_url || ad.video_url || null,
      displayUrl: ad.display_url || domain,
      landingPage: ad.landing_page || ad.final_url || null,
      platform: ad.platform || platform || 'unknown',
      metrics: {
        impressions: ad.impressions || 0,
        clicks: ad.clicks || 0,
        ctr: ad.ctr ? parseFloat(ad.ctr) : 0,
        spend: ad.spend ? parseFloat(ad.spend) : 0,
        startDate: ad.start_date || null,
        endDate: ad.end_date || null,
      },
      status: ad.status || 'unknown',
      adType: ad.ad_type || 'text',
      createdAt: ad.created_at || new Date().toISOString(),
    }));
  }

  /**
   * Analyze platform usage patterns.
   *
   * @param {Array} ads - Array of ads
   * @returns {Object} Platform usage statistics
   * @private
   */
  _analyzePlatformUsage(ads) {
    const usage = {};
    ads.forEach(ad => {
      const platform = ad.platform || 'unknown';
      usage[platform] = (usage[platform] || 0) + 1;
    });

    const total = ads.length;
    return Object.entries(usage).reduce((acc, [platform, count]) => {
      acc[platform] = {
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(2) : 0,
      };
      return acc;
    }, {});
  }

  /**
   * Analyze content patterns in ads.
   *
   * @param {Array} ads - Array of ads
   * @returns {Object} Content pattern analysis
   * @private
   */
  _analyzeContentPatterns(ads) {
    const headlines = ads.map(ad => ad.headline).filter(Boolean);
    const descriptions = ads.map(ad => ad.description).filter(Boolean);

    const headlineKeywords = this._extractKeywords(headlines);
    const descriptionKeywords = this._extractKeywords(descriptions);

    const avgHeadlineLength = headlines.length > 0
      ? headlines.reduce((sum, h) => sum + h.length, 0) / headlines.length
      : 0;

    const avgDescriptionLength = descriptions.length > 0
      ? descriptions.reduce((sum, d) => sum + d.length, 0) / descriptions.length
      : 0;

    return {
      topHeadlineKeywords: headlineKeywords.slice(0, 5),
      topDescriptionKeywords: descriptionKeywords.slice(0, 5),
      avgHeadlineLength: Math.round(avgHeadlineLength),
      avgDescriptionLength: Math.round(avgDescriptionLength),
      adTypes: this._analyzeAdTypes(ads),
    };
  }

  /**
   * Extract keywords from text.
   *
   * @param {Array} texts - Array of text strings
   * @returns {Array} Keywords sorted by frequency
   * @private
   */
  _extractKeywords(texts) {
    const words = texts
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * Analyze ad types distribution.
   *
   * @param {Array} ads - Array of ads
   * @returns {Object} Ad type distribution
   * @private
   */
  _analyzeAdTypes(ads) {
    const types = {};
    ads.forEach(ad => {
      const type = ad.adType || 'unknown';
      types[type] = (types[type] || 0) + 1;
    });

    const total = ads.length;
    return Object.entries(types).reduce((acc, [type, count]) => {
      acc[type] = {
        count,
        percentage: total > 0 ? ((count / total) * 100).toFixed(2) : 0,
      };
      return acc;
    }, {});
  }

  /**
   * Analyze bidding behavior from metrics.
   *
   * @param {Object} metrics - Performance metrics
   * @returns {Object} Bidding behavior analysis
   * @private
   */
  _analyzeBiddingBehavior(metrics) {
    const ctr = metrics.adMetrics?.adClicks > 0 && metrics.adMetrics?.adImpressions > 0
      ? (metrics.adMetrics.adClicks / metrics.adMetrics.adImpressions) * 100
      : 0;

    const cpc = metrics.adMetrics?.adClicks > 0 && metrics.adMetrics?.estimatedAdSpend > 0
      ? metrics.adMetrics.estimatedAdSpend / metrics.adMetrics.adClicks
      : 0;

    return {
      estimatedCTR: ctr.toFixed(2),
      estimatedCPC: cpc.toFixed(2),
      aggressiveBidding: ctr > 2 && cpc > 1,
      conservativeBidding: ctr < 1 && cpc < 0.5,
      adFrequency: metrics.adMetrics?.adImpressions || 0,
    };
  }

  /**
   * Estimate monthly ad budget.
   *
   * @param {Object} metrics - Performance metrics
   * @returns {Object} Budget estimation
   * @private
   */
  _estimateBudget(metrics) {
    const dailySpend = metrics.adMetrics?.estimatedAdSpend || 0;
    const monthlySpend = dailySpend * 30;

    return {
      daily: dailySpend.toFixed(2),
      monthly: monthlySpend.toFixed(2),
      currency: 'USD',
      confidence: dailySpend > 0 ? 'high' : 'low',
    };
  }

  /**
   * Generate recommendations based on analysis.
   *
   * @param {Array} ads - Array of ads
   * @param {Object} metrics - Performance metrics
   * @returns {Array} Recommendations
   * @private
   */
  _generateRecommendations(ads, metrics) {
    const recommendations = [];

    if (metrics.adMetrics?.adImpressions > 100000) {
      recommendations.push({
        type: 'opportunity',
        message: 'High ad visibility - consider bidding on similar keywords',
        priority: 'medium',
      });
    }

    if (metrics.trafficSources?.paid > 30) {
      recommendations.push({
        type: 'warning',
        message: 'Competitor heavily invests in paid traffic - expect high keyword costs',
        priority: 'high',
      });
    }

    const organic = metrics.trafficSources?.organic || 0;
    if (organic > 50) {
      recommendations.push({
        type: 'opportunity',
        message: 'Strong organic presence - focus on SEO and content marketing',
        priority: 'low',
      });
    }

    if (ads.length > 50) {
      recommendations.push({
        type: 'insight',
        message: 'Active competitor with diverse ad portfolio - monitor regularly',
        priority: 'medium',
      });
    }

    return recommendations;
  }
}
