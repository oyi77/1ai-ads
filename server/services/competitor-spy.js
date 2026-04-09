/**
 * Competitor Spy Service
 *
 * Provides real‑world competitor information by fetching each competitor's
 * homepage and extracting basic metadata (title and description). Integrates
 * with AdIntelligenceService to fetch and monitor competitor advertising data.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CompetitorsRepository } from '../repositories/competitors.js';
import { AdIntelligenceService } from './ad-intelligence.js';

const log = createLogger('competitor-spy');

export class CompetitorSpyService {
  constructor(db, adIntelligence = null) {
    this.db = db;
    this.adIntelligence = adIntelligence;
    this.competitorsRepo = new CompetitorsRepository(db);
  }

  /**
   * Monitor a competitor by fetching their ads and saving a snapshot.
   *
   * @param {string} competitorId - Competitor ID or domain
   * @param {string} userId - User ID requesting the monitoring
   * @param {Object} options - Monitoring options
   * @param {string} options.platform - Platform filter (e.g., 'google', 'facebook')
   * @returns {Promise<Object>} Monitoring result with snapshot data
   */
  async monitorCompetitor(competitorId, userId, options = {}) {
    const { platform } = options;
    const domain = this._extractDomain(competitorId);

    log.info('Starting competitor monitoring', {
      competitorId,
      domain,
      platform,
      userId,
    });

    if (!this.adIntelligence) {
      log.warn('AdIntelligenceService not available, using basic monitoring only');
      return this._performBasicMonitoring(domain, userId);
    }

    try {
      const adData = await this.adIntelligence.getCompetitorAds(domain, { platform });

      const snapshot = this.competitorsRepo.create({
        url: domain,
        platform,
        adData,
        snapshotType: 'monitor',
      });

      log.info('Competitor monitoring completed', {
        competitorId,
        domain,
        platform,
        adsCount: adData.ads?.length || 0,
        snapshotId: snapshot.id,
      });

      return {
        success: true,
        competitorId,
        domain,
        platform,
        adsCount: adData.ads?.length || 0,
        totalSpend: adData.ads?.reduce((sum, ad) => sum + (ad.metrics?.spend || 0), 0) || 0,
        totalImpressions: adData.ads?.reduce((sum, ad) => sum + (ad.metrics?.impressions || 0), 0) || 0,
        totalClicks: adData.ads?.reduce((sum, ad) => sum + (ad.metrics?.clicks || 0), 0) || 0,
        avgCTR: this._calculateAvgCTR(adData.ads),
        snapshotId: snapshot.id,
        capturedAt: snapshot.captured_at,
      };
    } catch (error) {
      log.error('Failed to monitor competitor with AdIntelligenceService', {
        competitorId,
        domain,
        platform,
        error: error.message,
      });

      return {
        success: false,
        competitorId,
        domain,
        platform,
        error: error.message,
      };
    }
  }

  /**
   * Get aggregated metrics for a competitor.
   *
   * @param {string} competitorId - Competitor ID or domain
   * @returns {Promise<Object>} Aggregated competitor metrics
   */
  async getCompetitorMetrics(competitorId) {
    const domain = this._extractDomain(competitorId);

    log.info('Fetching competitor metrics', { competitorId, domain });

    const snapshots = this.competitorsRepo.findByUrl(domain);

    if (!snapshots || snapshots.length === 0) {
      log.warn('No snapshots found for competitor', { competitorId, domain });
      return {
        competitorId,
        domain,
        hasData: false,
        message: 'No monitoring data available for this competitor',
      };
    }

    const latestSnapshot = snapshots[0];
    const allAds = snapshots.flatMap(s => s.ad_data?.ads || []);

    const metrics = {
      competitorId,
      domain,
      hasData: true,
      snapshotCount: snapshots.length,
      lastCapturedAt: latestSnapshot.captured_at,
      totalAds: allAds.length,
      activeAds: allAds.filter(ad => ad.status === 'active').length,
      totalSpend: allAds.reduce((sum, ad) => sum + (ad.metrics?.spend || 0), 0),
      totalImpressions: allAds.reduce((sum, ad) => sum + (ad.metrics?.impressions || 0), 0),
      totalClicks: allAds.reduce((sum, ad) => sum + (ad.metrics?.clicks || 0), 0),
      avgCTR: this._calculateAvgCTR(allAds),
      avgCPC: this._calculateAvgCPC(allAds),
      platforms: this._aggregatePlatformMetrics(allAds),
      adTypes: this._aggregateAdTypeMetrics(allAds),
      topPerformingAds: this._getTopPerformingAds(allAds, 5),
      recentTrends: this._calculateRecentTrends(snapshots.slice(0, 10)),
    };

    log.info('Competitor metrics calculated', {
      competitorId,
      domain,
      totalAds: metrics.totalAds,
      totalSpend: metrics.totalSpend,
      avgCTR: metrics.avgCTR,
    });

    return metrics;
  }

  /**
   * Helper: extract domain from competitor ID.
   *
   * @param {string} competitorId - Competitor ID or domain
   * @returns {string} Extracted domain
   * @private
   */
  _extractDomain(competitorId) {
    if (competitorId.includes('/')) {
      return new URL(competitorId).hostname.replace('www.', '');
    }
    return competitorId.replace('www.', '');
  }

  /**
   * Perform basic monitoring without AdIntelligenceService.
   *
   * @param {string} domain - Domain to monitor
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Basic monitoring result
   * @private
   */
  async _performBasicMonitoring(domain, userId) {
    const html = await this._fetchHtml(domain);
    const meta = this._extractMeta(html);

    const basicData = {
      title: meta.title || domain,
      description: meta.description,
      capturedAt: new Date().toISOString(),
      source: 'basic',
    };

    const snapshot = this.competitorsRepo.create({
      url: domain,
      platform: null,
      adData: basicData,
      snapshotType: 'basic',
    });

    log.info('Basic competitor monitoring completed', {
      domain,
      title: basicData.title,
      snapshotId: snapshot.id,
    });

    return {
      success: true,
      competitorId: domain,
      domain,
      platform: null,
      basic: true,
      title: basicData.title,
      snapshotId: snapshot.id,
      capturedAt: snapshot.captured_at,
    };
  }

  /**
   * Helper: fetch a URL and return its HTML text.
   *
   * @param {string} url - URL to fetch
   * @returns {Promise<string|null>} HTML text or null on failure
   * @private
   */
  async _fetchHtml(url) {
    try {
      const resp = await fetch(url, { timeout: 15000 });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      log.error(`Failed to fetch ${url}`, { message: e.message });
      return null;
    }
  }

  /**
   * Helper: extract title and meta description from HTML.
   *
   * @param {string} html - HTML content
   * @returns {Object} Object with title and description
   * @private
   */
  _extractMeta(html) {
    const result = { title: '', description: '' };
    if (!html) return result;
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].trim();
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (descMatch) result.description = descMatch[1].trim();
    return result;
  }

  /**
   * Calculate average CTR from ads array.
   *
   * @param {Array} ads - Array of ads
   * @returns {number} Average CTR
   * @private
   */
  _calculateAvgCTR(ads) {
    if (!ads || ads.length === 0) return 0;
    const adsWithCTR = ads.filter(ad => ad.metrics?.ctr > 0);
    if (adsWithCTR.length === 0) return 0;
    const sum = adsWithCTR.reduce((acc, ad) => acc + ad.metrics.ctr, 0);
    return parseFloat((sum / adsWithCTR.length).toFixed(2));
  }

  /**
   * Calculate average CPC from ads array.
   *
   * @param {Array} ads - Array of ads
   * @returns {number} Average CPC
   * @private
   */
  _calculateAvgCPC(ads) {
    if (!ads || ads.length === 0) return 0;
    const adsWithCPC = ads.filter(ad => {
      const cpc = (ad.metrics?.spend || 0) / (ad.metrics?.clicks || 1);
      return cpc > 0;
    });
    if (adsWithCPC.length === 0) return 0;
    const sum = adsWithCPC.reduce((acc, ad) => {
      const cpc = (ad.metrics?.spend || 0) / (ad.metrics?.clicks || 1);
      return acc + cpc;
    }, 0);
    return parseFloat((sum / adsWithCPC.length).toFixed(2));
  }

  /**
   * Aggregate metrics by platform.
   *
   * @param {Array} ads - Array of ads
   * @returns {Object} Platform-specific metrics
   * @private
   */
  _aggregatePlatformMetrics(ads) {
    const platforms = {};
    ads.forEach(ad => {
      const platform = ad.platform || 'unknown';
      if (!platforms[platform]) {
        platforms[platform] = { count: 0, spend: 0, impressions: 0, clicks: 0 };
      }
      platforms[platform].count++;
      platforms[platform].spend += ad.metrics?.spend || 0;
      platforms[platform].impressions += ad.metrics?.impressions || 0;
      platforms[platform].clicks += ad.metrics?.clicks || 0;
    });
    return platforms;
  }

  /**
   * Aggregate metrics by ad type.
   *
   * @param {Array} ads - Array of ads
   * @returns {Object} Ad type metrics
   * @private
   */
  _aggregateAdTypeMetrics(ads) {
    const types = {};
    ads.forEach(ad => {
      const type = ad.adType || 'unknown';
      if (!types[type]) {
        types[type] = { count: 0, spend: 0, clicks: 0 };
      }
      types[type].count++;
      types[type].spend += ad.metrics?.spend || 0;
      types[type].clicks += ad.metrics?.clicks || 0;
    });
    return types;
  }

  /**
   * Get top performing ads by CTR.
   *
   * @param {Array} ads - Array of ads
   * @param {number} limit - Maximum number of ads to return
   * @returns {Array} Top performing ads
   * @private
   */
  _getTopPerformingAds(ads, limit = 5) {
    return ads
      .filter(ad => ad.metrics?.ctr > 0)
      .sort((a, b) => b.metrics.ctr - a.metrics.ctr)
      .slice(0, limit)
      .map(ad => ({
        id: ad.id,
        headline: ad.headline,
        platform: ad.platform,
        ctr: ad.metrics.ctr,
        clicks: ad.metrics.clicks,
        spend: ad.metrics.spend,
      }));
  }

  /**
   * Calculate recent trends from snapshots.
   *
   * @param {Array} snapshots - Array of recent snapshots
   * @returns {Object} Trend data
   * @private
   */
  _calculateRecentTrends(snapshots) {
    if (snapshots.length < 2) {
      return { hasTrendData: false };
    }

    const recent = snapshots[0];
    const previous = snapshots[snapshots.length - 1];

    const recentAds = recent.ad_data?.ads || [];
    const previousAds = previous.ad_data?.ads || [];

    const recentSpend = recentAds.reduce((sum, ad) => sum + (ad.metrics?.spend || 0), 0);
    const previousSpend = previousAds.reduce((sum, ad) => sum + (ad.metrics?.spend || 0), 0);

    const recentImpressions = recentAds.reduce((sum, ad) => sum + (ad.metrics?.impressions || 0), 0);
    const previousImpressions = previousAds.reduce((sum, ad) => sum + (ad.metrics?.impressions || 0), 0);

    return {
      hasTrendData: true,
      spendChange: parseFloat(((recentSpend - previousSpend) / (previousSpend || 1) * 100).toFixed(2)),
      impressionsChange: parseFloat(((recentImpressions - previousImpressions) / (previousImpressions || 1) * 100).toFixed(2)),
      periodDays: Math.ceil((new Date(recent.captured_at) - new Date(previous.captured_at)) / (1000 * 60 * 60 * 24)),
    };
  }
}

/**
 * Legacy function: Returns competitor data for backward compatibility.
 * Each object contains:
 *   - `name`: extracted page title (fallback to hostname)
 *   - `website`: the URL
 *   - `description`: meta description (or empty string)
 *   - `features`: empty array (can be populated later)
 *
 * If a single URL is provided, fetches only that URL.
 * Otherwise, loads URLs from env or uses a sane fallback.
 *
 * @deprecated Use CompetitorSpyService class instead
 */
export async function getCompetitorData(url) {
  let urls = [];

  if (url) {
    urls = [url];
  } else {
    const envList = config.competitorUrls;
    const fallback = [
      'https://www.google.com',
      'https://www.facebook.com',
      'https://www.amazon.com'
    ];
    urls = envList ? envList.split(/\s*,\s*/) : fallback;
  }

  const service = new CompetitorSpyService(null);
  const results = [];
  for (const u of urls) {
    const html = await service._fetchHtml(u);
    const meta = service._extractMeta(html);
    const hostname = (new URL(u)).hostname.replace('www.', '');
    results.push({
      name: meta.title || hostname,
      website: u,
      description: meta.description,
      features: []
    });
  }
  if (!results.length) {
    results.push({
      name: 'No competitor data available',
      website: '#',
      description: '',
      features: []
    });
  }
  return url ? results[0] : results;
}
