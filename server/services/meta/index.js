import { safeFetch } from '../../lib/platform-client.js';
import config from '../../config/index.js';
import { BasePlatformApiClient } from '../../lib/base-platform-api.js';
import { ConfigurationError } from '../../lib/errors.js';
import { FacebookAdsApi } from 'facebook-nodejs-business-sdk';

const BASE = `https://graph.facebook.com/${config.metaApiVersion}`;

export class MetaAdsAPI extends BasePlatformApiClient {
  /**
   * @param {object|string} settingsRepoOrToken - SettingsRepo instance or explicit token string
   */
  constructor(settingsRepoOrToken) {
    // Support both: new MetaAdsAPI(settingsRepo) AND new MetaAdsAPI('token-string')
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('meta', settingsRepo, { baseUrl: BASE });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
  }

  /**
   * Factory method for creating a MetaAdsAPI with an explicit token.
   * Prefer this over the dual constructor for clarity.
   */
  static withToken(token) {
    return new MetaAdsAPI(token);
  }

  // Meta uses access_token as query param, not Bearer header
  _getToken() {
    // 1. Explicit token (set via constructor or setActiveAccount)
    if (this._explicitToken) return this._explicitToken;
    // 2. System token from .env (backward compat)
    if (!this._userScoped && config.fbSystemToken) return config.fbSystemToken;
    // 3. Active platform account from platform_accounts table
    if (!this._userScoped && this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('meta');
      if (typeof creds === 'string' && creds.length > 10) return creds;
      if (creds?.access_token) return creds.access_token;
      if (creds?.token) return creds.token;
    }
    throw new ConfigurationError('Meta access token not configured. Connect a Facebook account in Settings.');
  }

  // Convert '/me/adaccounts' → ['v19.0', 'me', 'adaccounts'] for SDK array-path mode
  _sdkPath(path) {
    return [config.metaApiVersion, ...path.split('/').filter(Boolean)];
  }

  // Override: uses SDK (array-path mode) as primary, safeFetch as fallback
  async _get(path, params = {}) {
    const token = this._getToken();
    try {
      const api = FacebookAdsApi.init(token);
      return await api.call('GET', this._sdkPath(path), params);
    } catch {
      const url = new URL(`${this._baseUrl}${path}`);
      url.searchParams.set('access_token', token);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
      const res = await safeFetch('meta', url.toString());
      return await res.json();
    }
  }

  // Override: uses SDK as primary, safeFetch as fallback
  async _post(path, body = {}) {
    const token = this._getToken();
    try {
      const api = FacebookAdsApi.init(token);
      return await api.call('POST', this._sdkPath(path), body);
    } catch {
      const url = new URL(`${this._baseUrl}${path}`);
      url.searchParams.set('access_token', token);
      const res = await safeFetch('meta', url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json();
    }
  }

  // Aliases for backward compatibility with orchestrator/agent
  async apiGet(path, params) { return this._get(path, params); }
  async apiPost(path, body) { return this._post(path, body); }
  async apiUpdate(path, body) { return this._post(path, body); }
  async apiDelete(path) {
    const token = this._getToken();
    try {
      const api = FacebookAdsApi.init(token);
      return await api.call('DELETE', this._sdkPath(path));
    } catch {
      const url = new URL(`${this._baseUrl}${path}`);
      url.searchParams.set('access_token', token);
      const res = await safeFetch('meta', url.toString(), { method: 'DELETE' });
      return await res.json();
    }
  }

  // --- Account Management ---

  async getMe() {
    return this._get('/me', { fields: 'id,name' });
  }

  async getAdAccounts() {
    const data = await this._get('/me/adaccounts', {
      fields: 'id,name,account_status,currency,balance,amount_spent',
      limit: '50',
    });
    return (data.data || []).map(a => ({
      id: a.id,
      name: a.name,
      status: a.account_status === 1 ? 'active' : a.account_status === 2 ? 'disabled' : 'unknown',
      currency: a.currency,
      balance: parseFloat(a.balance || 0),
      amountSpent: parseFloat(a.amount_spent || 0),
    }));
  }

  /** Alias for getAdAccounts — satisfies the platform interface contract. */
  async getAccounts() { return this.getAdAccounts(); }


  // --- Campaign Management ---

  async getCampaigns(accountId, { limit = 50 } = {}) {
    const data = await this._get(`/${accountId}/campaigns`, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time',
      limit: String(limit),
    });
    return (data.data || []).map(c => ({
      id: c.id,
      name: c.name,
      status: (c.status || '').toLowerCase(),
      objective: c.objective,
      dailyBudget: parseFloat(c.daily_budget || 0),
      lifetimeBudget: parseFloat(c.lifetime_budget || 0),
      createdTime: c.created_time,
      updatedTime: c.updated_time,
    }));
  }

  async getCampaignInsights(campaignId, { datePreset = 'last_30d' } = {}) {
    const data = await this._get(`/${campaignId}/insights`, {
      fields: 'campaign_name,spend,impressions,clicks,ctr,cpc,actions,action_values,cost_per_action_type',
      date_preset: datePreset,
    });
    return this._parseInsights(data.data?.[0]);
  }

  async getMultiCampaignInsights(campaignIds, { datePreset = 'last_30d', accountId = null } = {}) {
    if (!campaignIds.length) return {};

    // Preferred path: ONE account-level insights call with a campaign.id IN
    // filter. Avoids both the deprecated `GET /?ids=...` form (Meta returns
    // 500 code 100 "The ids query parameter is deprecated in v26.0+") and the
    // N per-object requests of the fan-out below. Meta omits campaigns with
    // no data in range, so absent ids map to null; consumers treat null as
    // empty (`insights[id] || {}`).
    if (accountId) {
      const filtering = JSON.stringify([
        { field: 'campaign.id', operator: 'IN', value: campaignIds },
      ]);
      const data = await this._get(`/${accountId}/insights`, {
        level: 'campaign',
        filtering,
        fields: 'campaign_id,spend,impressions,clicks,ctr,cpc,actions,action_values,cost_per_action_type',
        limit: '100',
        date_preset: datePreset,
      });
      const byId = {};
      for (const row of data.data || []) {
        if (row.campaign_id) byId[row.campaign_id] = this._parseInsights(row);
      }
      const allResults = {};
      for (const id of campaignIds) allResults[id] = byId[id] ?? null;
      return allResults;
    }

    // Fallback (no accountId given): per-campaign parallel fan-out.
    const results = await Promise.allSettled(
      campaignIds.map((id) => this.getCampaignInsights(id, { datePreset }))
    );
    const fanout = {};
    campaignIds.forEach((id, i) => {
      fanout[id] = results[i].status === 'fulfilled' ? results[i].value : null;
    });
    return fanout;
  }

  /**
   * Hour-of-day performance breakdown (dayparting insight).
   * Uses the Marketing API `breakdowns=time_of_day` (values 0-23, account tz),
   * aggregated across the requested window — the data behind competitor
   * dayparting heatmaps (Madgicx/Revealbot tier).
   */
  async getAccountInsightsByHour(accountId, { datePreset = 'last_7d' } = {}) {
    const params = {
      fields: 'spend,impressions,clicks,actions,action_values',
      // v22 removed time_of_day; advertiser-timezone hourly is the supported dayparting breakdown
      breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
      date_preset: datePreset,
      limit: '100',
    };
    const data = await this._get(`/${accountId}/insights`, params);
    const buckets = {};
    for (const row of (data.data || [])) {
      // hourly_stats_aggregated_by_* rows carry the window in
      // hourly_stats_aggregated_by_*_time_zone: "HH:00:00 - HH:59:59".
      // Legacy time_of_day carried it as a plain number.
      let hour = parseInt(row.time_of_day ?? NaN, 10);
      if (!Number.isFinite(hour)) {
        const tzKey = Object.keys(row).find(k => k.startsWith('hourly_stats_aggregated_by'));
        const win = tzKey ? String(row[tzKey]) : '';
        const hm = win.match(/^(\d{1,2}):/);
        if (hm) hour = parseInt(hm[1], 10);
      }
      if (!Number.isFinite(hour)) hour = parseInt(row.hour ?? 0, 10) % 24;
      if (!Number.isFinite(hour)) hour = 0;
      if (!buckets[hour]) {
        buckets[hour] = { hour, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, purchases: 0, revenue: 0 };
      }
      const b = buckets[hour];
      b.spend += parseFloat(row.spend || 0);
      b.impressions += parseInt(row.impressions || 0);
      b.clicks += parseInt(row.clicks || 0);
      let parsed;
      try { parsed = this._parseInsights(row); } catch { parsed = null; }
      if (parsed) {
        b.linkClicks += parsed.linkClicks || 0;
        b.purchases += parsed.conversions || 0;
        b.revenue += parsed.revenue || 0;
      }
    }
    return Object.values(buckets)
      .map(b => ({
        ...b,
        ctr: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0,
        cpc: b.clicks > 0 ? b.spend / b.clicks : null,
        roas: b.spend > 0 ? b.revenue / b.spend : null,
      }))
      .sort((a, b) => a.hour - b.hour);
  }

  async getAccountInsights(accountId, { datePreset = 'last_30d', timeRange = null, attributionWindows = null } = {}) {
    const params = {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,action_values,cost_per_action_type',
    };
    if (timeRange) {
      // Meta custom window: { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' }
      params.time_range = JSON.stringify(timeRange);
    } else {
      params.date_preset = datePreset;
    }
    if (attributionWindows?.length) {
      // e.g. ['7d_click','1d_view'] — switches the attribution model
      params.attribution_window = JSON.stringify(attributionWindows);
    }
    const data = await this._get(`/${accountId}/insights`, params);
    return this._parseInsights(data.data?.[0]);
  }

  // --- Ad Creatives ---

  async getAds(accountId, { limit = 50 } = {}) {
    const data = await this._get(`/${accountId}/ads`, {
      fields: 'id,name,status,creative{id,title,body,image_url,thumbnail_url,link_url,call_to_action_type}',
      limit: String(limit),
    });
    return (data.data || []).map(ad => ({
      id: ad.id,
      name: ad.name,
      status: (ad.status || '').toLowerCase(),
      creative: ad.creative ? {
        id: ad.creative.id,
        title: ad.creative.title,
        body: ad.creative.body,
        imageUrl: ad.creative.image_url || ad.creative.thumbnail_url,
        linkUrl: ad.creative.link_url,
        ctaType: ad.creative.call_to_action_type,
      } : null,
    }));
  }

  // --- Campaign WRITE Operations ---

  async createCampaign(accountId, { name, objective, status = 'PAUSED', dailyBudget, specialAdCategories = [], isAdsetBudgetSharing }) {
    this.log.info('Creating Meta campaign', { accountId, name, objective });
    // Meta v22+ requires is_adset_budget_sharing_enabled to be explicit
    // (error_subcode 4834011) — never omit it.
    // When is_adset_budget_sharing_enabled is FALSE, the ad set owns its
    // budget — do NOT set daily_budget on the campaign (rejected with
    // error_subcode 4834002). When TRUE, set daily_budget on the campaign
    // (CBO) and NOT on the ad set.
    const body = {
      name,
      objective,
      status,
      special_ad_categories: specialAdCategories,
      is_adset_budget_sharing_enabled: isAdsetBudgetSharing ?? false,
    };
    if (isAdsetBudgetSharing && dailyBudget) body.daily_budget = Math.round(dailyBudget * 100);
    const data = await this._post(`/${accountId}/campaigns`, body);
    this.log.info('Campaign created successfully', { campaignId: data.id });
    return { id: data.id };
  }
  async createAdSet(accountId, campaignId, { name, dailyBudget, targeting, billingEvent = 'IMPRESSIONS', optimizationGoal = 'LINK_CLICKS', startTime, isCbo }) {
    const body = {
      name,
      campaign_id: campaignId,
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      // When the ad set carries no budget (campaign-level CBO), LOWEST_COST
      // strategies demand a bid_amount (error_subcode 1815857) — use the bid-cap
      // strategy with a minimal bid. When the ad set owns its budget,
      // LOWEST_COST_WITHOUT_CAP with daily_budget is valid.
      bid_strategy: dailyBudget && !isCbo ? 'LOWEST_COST_WITHOUT_CAP' : 'LOWEST_COST_WITH_BID_CAP',
      // v22 requires explicit advantage_audience toggle
      targeting: { ...(targeting || { geo_locations: { countries: ['ID'] }, age_min: 18 }), targeting_automation: { advantage_audience: 0 } },
      status: 'PAUSED',
    };
    if (dailyBudget && !isCbo) body.daily_budget = Math.round(dailyBudget * 100);
    else body.bid_amount = 500; // minimal bid (IDR) — required without ad-set budget
    if (startTime) body.start_time = startTime;
    const data = await this._post(`/${accountId}/adsets`, body);
    return { id: data.id };
  }

  async createAdCreative(accountId, { name, pageId, message, headline, description, linkUrl, imageHash, ctaType = 'LEARN_MORE' }) {
    const linkData = {
      message,
      link: linkUrl,
      name: headline,
    };
    if (description) linkData.description = description;
    if (imageHash) linkData.image_hash = imageHash;
    if (ctaType) {
      linkData.call_to_action = { type: ctaType, value: { link: linkUrl } };
    }

    const data = await this._post(`/${accountId}/adcreatives`, {
      name: name || `Creative_${Date.now()}`,
      object_story_spec: {
        page_id: pageId,
        link_data: linkData,
      },
    });
    return { id: data.id };
  }


  async createAd(accountId, { adsetId, creativeId, name, status = 'PAUSED' }) {
    const data = await this._post(`/${accountId}/ads`, {
      name: name || `Ad_${Date.now()}`,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status,
    });
    return { id: data.id };
  }

  async uploadAdImage(accountId, imageUrl) {
    // Upload image from URL using the bytes endpoint
    const data = await this._post(`/${accountId}/adimages`, { url: imageUrl });
    const images = data.images || {};
    const firstKey = Object.keys(images)[0];
    if (!firstKey) throw new Error('Image upload failed: no image returned');
    return { hash: images[firstKey].hash, url: images[firstKey].url };
  }

  async updateCampaign(campaignId, updates = {}) {
    const body = {};
    if (updates.name) body.name = updates.name;
    if (updates.status) body.status = updates.status;
    if (updates.dailyBudget !== undefined) body.daily_budget = Math.round(updates.dailyBudget * 100);
    const _data = await this._post(`/${campaignId}`, body);
    return { success: true, id: campaignId };
  }

  async updateAd(adId, updates = {}) {
    const body = {};
    if (updates.status) body.status = updates.status;
    if (Object.keys(body).length === 0) throw new Error('No valid fields to update');
    return this._post(`/${adId}`, body);
  }

  async duplicateCampaign(accountId, campaignId, { suffix = ' (Copy)' } = {}) {
    // Large campaigns exceed Meta's deep-copy object limit ("terlalu besar");
    // fall back to a shallow copy (campaign shell only) so the action still
    // succeeds — user re-imports adsets/ads via Sync afterwards.
    const attempt = async (deepCopy) => this._post(`/${campaignId}/copies`, {
      deep_copy: deepCopy,
      status_option: 'PAUSED',
      rename_options: { rename_suffix: suffix },
    });
    let shallow = false;
    let data;
    try {
      data = await attempt(true);
    } catch (deepErr) {
      // _post throws only 'meta API returned {status}' — the rich Meta message
      // (e.g. subcode 1885194 'copy request too large') is logged upstream.
      // Any deep-copy failure retries once as a shallow copy.
      this.log.warn('Deep copy failed — retrying as shallow copy', { campaignId, error: String(deepErr?.message || deepErr).slice(0, 120) });
      shallow = true;
      try {
        data = await attempt(false);
      } catch (shallowErr) {
        throw shallowErr;
      }
    }
    const newId = data.copied_campaign_id;
    this.log.info('Campaign duplicated', { campaignId, newId, shallow });
    return { originalId: campaignId, newCampaignId: newId, shallow };
  }

  async updateAdSet(adsetId, updates = {}) {
    const body = {};
    if (updates.status) body.status = updates.status;
    if (updates.dailyBudget !== undefined) body.daily_budget = Math.round(updates.dailyBudget * 100);
    if (updates.targeting) body.targeting = updates.targeting;
    const _data = await this._post(`/${adsetId}`, body);
    return { success: true, id: adsetId };
  }

  async getTargetingOptions(query) {
    const data = await this._get('/search', {
      type: 'adinterest',
      q: query,
      limit: '20',
    });
    return (data.data || []).map(t => ({
      id: t.id,
      name: t.name,
      audienceSize: t.audience_size || t.audience_size_lower_bound,
      path: t.path || [],
      topic: t.topic,
    }));
  }

  async getPages() {
    const data = await this._get('/me/accounts', {
      fields: 'id,name,category,access_token',
      limit: '50',
    });
    return (data.data || []).map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
    }));
  }

  // --- Ad Spy (competitor pages) ---

  async getPageAds(pageId) {
    // Get ads running from a specific page via ads_archive
    // Note: requires Ad Library API access. Falls back to page info if not available.
    try {
      const data = await this._get('/ads_archive', {
        search_page_ids: pageId,
        ad_reached_countries: JSON.stringify(['ID']),
        ad_active_status: 'ALL',
        ad_type: 'ALL',
        fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,publisher_platforms',
        limit: '50',
      });
      return { source: 'ads_archive', ads: data.data || [] };
    } catch (err) {
      this.log.debug('Ads archive unavailable, falling back to page info', { pageId, error: err.message });
      const page = await this._get(`/${pageId}`, {
        fields: 'id,name,category,fan_count,about,website',
      });
      return { source: 'page_info', page, ads: [] };
    }
  }

  async searchPages(query) {
    const data = await this._get('/search', {
      type: 'adpage',
      q: query,
      fields: 'id,name,category,fan_count,verification_status',
      limit: '10',
    });
    return data.data || [];
  }

  async getAdLibrary({ query, country = 'ID', limit = 20 } = {}) {
    const params = {
      ad_reached_countries: JSON.stringify([country]),
      ad_active_status: 'ACTIVE',
      ad_type: 'ALL',
      fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,publisher_platforms,spend,impressions',
      limit: String(limit),
    };
    if (query) params.search_terms = query;
    const data = await this._get('/ads_archive', params);
    return data.data || [];
  }

  // --- Sync all accounts + campaigns + insights ---

  async syncAllAccounts() {
    const accounts = await this.getAdAccounts();
    const results = [];

    for (const account of accounts) {
      if (account.status !== 'active') continue;

      try {
        const campaigns = await this.getCampaigns(account.id);
        const insights = await this.getAccountInsights(account.id).catch(() => null);

        results.push({
          account,
          campaigns,
          insights,
          syncedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          account,
          campaigns: [],
          insights: null,
          error: err.message,
          syncedAt: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  _parseInsights(raw) {
    if (!raw) return null;

    const actions = {};
    for (const a of (raw.actions || [])) {
      actions[a.action_type] = parseInt(a.value);
    }

    const actionValues = {};
    for (const v of (raw.action_values || [])) {
      actionValues[v.action_type] = parseFloat(v.value);
    }

    const costPerAction = {};
    for (const c of (raw.cost_per_action_type || [])) {
      costPerAction[c.action_type] = parseFloat(c.value);
    }

    // Extract revenue from purchase values
    const revenue = actionValues.purchase
      || actionValues.onsite_conversion?.post_save
      || actionValues.offsite_conversion?.fb_pixel_purchase
      || 0;

    return {
      spend: parseFloat(raw.spend || 0),
      impressions: parseInt(raw.impressions || 0),
      clicks: parseInt(raw.clicks || 0),
      ctr: parseFloat(raw.ctr || 0),
      cpc: parseFloat(raw.cpc || 0),
      revenue: revenue,
      linkClicks: actions.link_click || 0,
      landingPageViews: actions.landing_page_view || 0,
      videoViews: actions.video_view || 0,
      conversions: actions.purchase || actions.onsite_conversion?.total_messaging_connection || 0,
      postEngagement: actions.post_engagement || 0,
      costPerLinkClick: costPerAction.link_click || 0,
      costPerLandingPageView: costPerAction.landing_page_view || 0,
      dateStart: raw.date_start,
      dateStop: raw.date_stop,
    };
  }
}
