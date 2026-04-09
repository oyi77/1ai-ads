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

const log = createLogger('ad-research');
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

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
    if (!query) {
      log.error('Search query is required');
      throw new Error('Search query is required');
    }

    log.info('Searching Meta Ad Library', { query, country, limit });

    const token = this._getToken();
    const params = new URLSearchParams({
      search_terms: query,
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus,
      ad_type: 'ALL',
      fields: DEFAULT_FIELDS,
      limit: String(Math.min(limit, 500)),
      access_token: token,
    });

    if (mediaType && mediaType !== 'ALL') {
      params.set('media_type', mediaType);
    }

    const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      log.error('Meta API error in ad search', { error: data.error.message, code: data.error.code });
      throw new PlatformError(`Meta API error: ${data.error.message}`, 'meta', data.error.code);
    }

    const result = {
      ads: (data.data || []).map(this._formatAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
      nextCursor: data.paging?.cursors?.after || null,
    };

    log.info('Ad search completed', { total: result.total, hasMore: result.hasMore });
    return result;
  }

  /**
   * Search ads by a specific competitor page ID.
   */
  async searchByPage({ pageId, country = 'ID', activeStatus = 'ACTIVE', limit = 100 }) {
    if (!pageId) throw new ConfigurationError('Page ID is required');

    const token = this._getToken();
    const params = new URLSearchParams({
      search_page_ids: pageId,
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: activeStatus,
      ad_type: 'ALL',
      fields: DEFAULT_FIELDS,
      limit: String(Math.min(limit, 500)),
      access_token: token,
    });

    const url = `${GRAPH_API_BASE}/ads_archive?${params}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      throw new PlatformError(`Meta API error: ${data.error.message}`, 'meta', data.error.code);
    }

    return {
      ads: (data.data || []).map(this._formatAd),
      total: data.data?.length || 0,
      hasMore: !!data.paging?.next,
    };
  }

  /**
   * Resolve a Facebook page name/URL to a page ID.
   */
  async resolvePageId(pageNameOrUrl) {
    log.info('Resolving Facebook page ID', { input: pageNameOrUrl });

    const token = this._getToken();

    // If it looks like a URL, extract the page name
    let identifier = pageNameOrUrl;
    const urlMatch = pageNameOrUrl.match(/facebook\.com\/([^/?]+)/);
    if (urlMatch) identifier = urlMatch[1];

    const url = `${GRAPH_API_BASE}/${encodeURIComponent(identifier)}?fields=id,name,fan_count,category&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      log.error('Failed to resolve Facebook page', { error: data.error.message });
      throw new PlatformError(`Could not resolve page: ${data.error.message}`, 'meta', data.error.code);
    }

    const result = {
      id: data.id,
      name: data.name,
      fanCount: data.fan_count,
      category: data.category,
    };

    log.info('Facebook page resolved', { name: result.name, id: result.id });
    return result;
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
