/**
 * Competitor Spy Service
 *
 * Provides real‑world competitor information by fetching each competitor's
 * homepage and extracting basic metadata (title and description). Integrates
 * with AdIntelligenceService to fetch and monitor competitor advertising data.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('competitor-spy');

export class CompetitorSpyService {
  constructor(db, adIntelligence = null, adSpireAdapter = null, competitorsRepo = null) {
    this.db = db;
    this.adIntelligence = adIntelligence;
    this.adSpireAdapter = adSpireAdapter;
    this.competitorsRepo = competitorsRepo;
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
    log.info('Starting competitor monitoring', { competitorId, domain, platform, userId });

    const intelligenceService = this.adIntelligence ||
      (this.adSpireAdapter?.isAvailable() ? this.adSpireAdapter : null);

    if (!intelligenceService) {
      log.warn('No ad intelligence service available, using basic monitoring only');
      return this._performBasicMonitoring(domain, userId);
    }

    try {
      const adData = await intelligenceService.getCompetitorAds(domain, { platform });
      return this._buildMonitorSuccess(competitorId, domain, platform, adData);
    } catch (error) {
      log.error('Failed to monitor competitor with AdIntelligenceService', {
        competitorId, domain, platform, error: error.message,
      });
      return { success: false, competitorId, domain, platform, error: error.message };
    }
  }

  _buildMonitorSuccess(competitorId, domain, platform, adData) {
    const snapshot = this.competitorsRepo.create({
      url: competitorId, platform: platform || null, adData, snapshotType: 'monitor',
    });

    log.info('Competitor monitoring completed', {
      competitorId, domain, platform, adsCount: adData.ads?.length || 0, snapshotId: snapshot.id,
    });

    return {
      success: true, competitorId, domain, platform: platform || null,
      adsCount: adData.ads?.length || 0,
      totalSpend: adData.ads?.reduce((s, a) => s + (a.metrics?.spend || 0), 0) || 0,
      totalImpressions: adData.ads?.reduce((s, a) => s + (a.metrics?.impressions || 0), 0) || 0,
      totalClicks: adData.ads?.reduce((s, a) => s + (a.metrics?.clicks || 0), 0) || 0,
      avgCTR: this._calculateAvgCTR(adData.ads),
      snapshotId: snapshot.id, capturedAt: snapshot.captured_at,
    };
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

    const snapshots = this.competitorsRepo.findByUrl(competitorId);
    if (!snapshots || snapshots.length === 0) {
      log.warn('No snapshots found for competitor', { competitorId, domain });
      return { competitorId, domain, hasData: false, message: 'No monitoring data available for this competitor' };
    }

    return this._computeMetrics(competitorId, domain, snapshots);
  }

  _computeMetrics(competitorId, domain, snapshots) {
    const allAds = snapshots.flatMap(s => s.ad_data?.ads || []);
    const latestSnapshot = snapshots[0];
    const adsAgg = this._aggregateAdsData(allAds);

    const metrics = {
      competitorId, domain, hasData: true, snapshotCount: snapshots.length,
      lastCapturedAt: latestSnapshot.captured_at,
      ...adsAgg,
      avgCTR: this._calculateAvgCTR(allAds), avgCPC: this._calculateAvgCPC(allAds),
      platforms: this._aggregatePlatformMetrics(allAds),
      adTypes: this._aggregateAdTypeMetrics(allAds),
      topPerformingAds: this._getTopPerformingAds(allAds, 5),
      recentTrends: this._calculateRecentTrends(snapshots.slice(0, 10)),
    };
    log.info('Competitor metrics calculated', { competitorId, domain, totalAds: metrics.totalAds, totalSpend: metrics.totalSpend, avgCTR: metrics.avgCTR });
    return metrics;
  }

  _aggregateAdsData(allAds) {
    return {
      totalAds: allAds.length,
      activeAds: allAds.filter(ad => ad.status === 'active').length,
      totalSpend: allAds.reduce((s, a) => s + (a.metrics?.spend || 0), 0),
      totalImpressions: allAds.reduce((s, a) => s + (a.metrics?.impressions || 0), 0),
      totalClicks: allAds.reduce((s, a) => s + (a.metrics?.clicks || 0), 0),
    };
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
  async _performBasicMonitoring(domain, _userId) {
    const html = await this._fetchHtml(domain);
    const meta = this._extractMeta(html);
    const basicData = this._buildBasicData(domain, meta);

    const snapshot = this.competitorsRepo.create({
      url: domain, platform: null, adData: basicData, snapshotType: 'basic',
    });

    log.info('Basic competitor monitoring completed', { domain, title: basicData.title, snapshotId: snapshot.id });
    return { success: true, competitorId: domain, domain, platform: null, basic: true, title: basicData.title, snapshotId: snapshot.id, capturedAt: snapshot.captured_at };
  }

  _buildBasicData(domain, meta) {
    return { title: meta.title || domain, description: meta.description, capturedAt: new Date().toISOString(), source: 'basic' };
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

const DEFAULT_COMPETITOR_URLS = [
  'https://www.google.com',
  'https://www.facebook.com',
  'https://www.amazon.com',
];

function _resolveUrls(url) {
  if (url) return [url];
  const envList = config.competitorUrls;
  return envList ? envList.split(/\s*,\s*/) : DEFAULT_COMPETITOR_URLS;
}

function _extractSiteData(html, url) {
  const service = new CompetitorSpyService(null);
  const meta = service._extractMeta(html);
  const hostname = new URL(url).hostname.replace('www.', '');
  return { name: meta.title || hostname, website: url, description: meta.description, features: [] };
}

function _emptyResult() {
  return { name: 'No competitor data available', website: '#', description: '', features: [] };
}

export async function getCompetitorData(url) {
  const urls = _resolveUrls(url);
  const service = new CompetitorSpyService(null);
  const results = [];

  for (const u of urls) {
    const html = await service._fetchHtml(u);
    results.push(_extractSiteData(html, u));
  }

  if (!results.length) results.push(_emptyResult());
  return url ? results[0] : results;
}
