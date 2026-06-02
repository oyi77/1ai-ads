/**
 * Meta Ad Library API client for competitor ad research.
 * Uses the public ads_archive Graph API endpoint.
 * Docs: https://developers.facebook.com/docs/graph-api/reference/ads_archive/
 *
 * Rate limit: ~200 calls/hour per access token.
 * Spend/impressions data only available for political/EU ads.
 */

import { createLogger } from '../lib/logger.js';
import { ConfigurationError, PlatformError } from '../lib/errors.js';
import config from '../config/index.js';

const log = createLogger('ad-research');
const GRAPH_API_BASE = `https://graph.facebook.com/${config.metaApiVersion}`;

const DEFAULT_FIELDS = [
  'id', 'page_name', 'page_id',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
  'ad_snapshot_url', 'ad_delivery_start_time', 'ad_delivery_stop_time',
  'publisher_platforms', 'languages', 'estimated_audience_size',
  'spend', 'impressions', 'currency',
].join(',');

export class AdResearchService {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  _getToken() {
    const creds = this.settingsRepo.getCredentials('meta');
    if (!creds?.access_token) {
      throw new ConfigurationError('Meta access token not configured. Go to Settings to add it.');
    }
    return creds.access_token;
  }

  /**
   * Search ads by keyword across the Meta Ad Library.
   */
  async searchAds({ query, country = 'ID', activeStatus = 'ALL', mediaType, limit = 50 }) {
    if (!query) throw new Error('Search query is required');
    log.info('Searching Meta Ad Library', { query, country, limit });

    const params = this._buildSearchParams({ query, country, activeStatus, mediaType, limit });
    const data = await this._fetchArchive(params);

    const result = {
      ads: (data.data || []).map(this._formatAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
      nextCursor: data.paging?.cursors?.after || null,
    };
    log.info('Ad search completed', { total: result.total, hasMore: result.hasMore });
    return result;
  }

  async searchByPage({ pageId, country = 'ID', activeStatus = 'ACTIVE', limit = 100 }) {
    if (!pageId) throw new ConfigurationError('Page ID is required');
    const params = this._buildPageParams({ pageId, country, activeStatus, limit });
    const data = await this._fetchArchive(params);
    return {
      ads: (data.data || []).map(this._formatAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
    };
  }

  async resolvePageId(pageNameOrUrl) {
    log.info('Resolving Facebook page ID', { input: pageNameOrUrl });
    const identifier = this._extractPageIdentifier(pageNameOrUrl);
    const token = this._getToken();
    const url = `${GRAPH_API_BASE}/${encodeURIComponent(identifier)}?fields=id,name,fan_count,category&access_token=${token}`;
    const data = await this._fetchJson(url);

    if (data.error) throw new PlatformError(`Could not resolve page: ${data.error.message}`, 'meta', data.error.code);
    log.info('Facebook page resolved', { name: data.name, id: data.id });
    return { id: data.id, name: data.name, fanCount: data.fan_count, category: data.category };
  }

  _extractPageIdentifier(pageNameOrUrl) {
    const urlMatch = pageNameOrUrl.match(/facebook\.com\/([^/?]+)/);
    return urlMatch ? urlMatch[1] : pageNameOrUrl;
  }

  _buildSearchParams({ query, country, activeStatus, mediaType, limit }) {
    const params = new URLSearchParams({
      search_terms: query, ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus, ad_type: 'ALL', fields: DEFAULT_FIELDS,
      limit: String(Math.min(limit, 500)), access_token: this._getToken(),
    });
    if (mediaType && mediaType !== 'ALL') params.set('media_type', mediaType);
    return params;
  }

  _buildPageParams({ pageId, country, activeStatus, limit }) {
    return new URLSearchParams({
      search_page_ids: pageId, ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus, ad_type: 'ALL', fields: DEFAULT_FIELDS,
      limit: String(Math.min(limit, 500)), access_token: this._getToken(),
    });
  }

  async _fetchArchive(params) {
    const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
    const data = await this._fetchJson(url);
    if (data.error) {
      log.error('Meta API error in ad search', { error: data.error.message, code: data.error.code });
      throw new PlatformError(`Meta API error: ${data.error.message}`, 'meta', data.error.code);
    }
    return data;
  }

  async _fetchJson(url) {
    const res = await fetch(url);
    return res.json();
  }

  _formatAd(ad) {
    return {
      id: ad.id,
      pageName: ad.page_name,
      pageId: ad.page_id,
      bodies: ad.ad_creative_bodies || [],
      titles: ad.ad_creative_link_titles || [],
      descriptions: ad.ad_creative_link_descriptions || [],
      captions: ad.ad_creative_link_captions || [],
      snapshotUrl: ad.ad_snapshot_url,
      deliveryStart: ad.ad_delivery_start_time,
      deliveryStop: ad.ad_delivery_stop_time,
      platforms: ad.publisher_platforms || [],
      languages: ad.languages || [],
      audienceSize: ad.estimated_audience_size || null,
      spend: ad.spend || null,
      impressions: ad.impressions || null,
      currency: ad.currency || null,
    };
  }
}
