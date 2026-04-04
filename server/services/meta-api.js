/**
 * Direct Meta Graph API client for ads management.
 * Uses fetch against graph.facebook.com - no MCP subprocess needed.
 * Confirmed working with real token and real ad accounts.
 */

const API_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export class MetaAdsAPI {
  constructor(settingsRepo) {
    this.settingsRepo = settingsRepo;
  }

  _getToken() {
    if (process.env.FB_SYSTEM_TOKEN) {
      return process.env.FB_SYSTEM_TOKEN;
    }
    const creds = this.settingsRepo.getCredentials('meta');
    if (!creds?.access_token) {
      throw new Error('Meta access token not configured. Go to Settings to add it.');
    }
    return creds.access_token;
  }

  async _get(path, params = {}) {
    const token = this._getToken();
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('access_token', token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    return data;
  }

  async _post(path, body = {}) {
    const token = this._getToken();
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set('access_token', token);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    return data;
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
      fields: 'campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
      date_preset: datePreset,
    });
    return this._parseInsights(data.data?.[0]);
  }

  async getAccountInsights(accountId, { datePreset = 'last_30d' } = {}) {
    const data = await this._get(`/${accountId}/insights`, {
      fields: 'spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
      date_preset: datePreset,
    });
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

  async createCampaign(accountId, { name, objective, status = 'PAUSED', dailyBudget, specialAdCategories = [] }) {
    const body = {
      name,
      objective,
      status,
      special_ad_categories: specialAdCategories,
    };
    if (dailyBudget) body.daily_budget = Math.round(dailyBudget * 100); // Meta expects cents
    const data = await this._post(`/${accountId}/campaigns`, body);
    return { id: data.id };
  }

  async createAdSet(accountId, campaignId, { name, dailyBudget, targeting, billingEvent = 'IMPRESSIONS', optimizationGoal = 'LINK_CLICKS', startTime }) {
    const body = {
      name,
      campaign_id: campaignId,
      daily_budget: Math.round(dailyBudget * 100),
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      targeting,
      status: 'PAUSED',
    };
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
    const data = await this._post(`/${campaignId}`, body);
    return { success: true, id: campaignId };
  }

  async updateAdSet(adsetId, updates = {}) {
    const body = {};
    if (updates.status) body.status = updates.status;
    if (updates.dailyBudget !== undefined) body.daily_budget = Math.round(updates.dailyBudget * 100);
    if (updates.targeting) body.targeting = updates.targeting;
    const data = await this._post(`/${adsetId}`, body);
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
    } catch {
      // Fallback: get page info only
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
    const token = this._getToken();
    const url = new URL(`${BASE}/ads_archive`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('ad_reached_countries', JSON.stringify([country]));
    url.searchParams.set('ad_active_status', 'ACTIVE');
    url.searchParams.set('ad_type', 'ALL');
    url.searchParams.set('fields', 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,publisher_platforms,spend,impressions');
    url.searchParams.set('limit', String(limit));
    if (query) url.searchParams.set('search_terms', query);

    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) throw new Error(`Ad Library API: ${data.error.message}`);
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

    const costPerAction = {};
    for (const c of (raw.cost_per_action_type || [])) {
      costPerAction[c.action_type] = parseFloat(c.value);
    }

    return {
      spend: parseFloat(raw.spend || 0),
      impressions: parseInt(raw.impressions || 0),
      clicks: parseInt(raw.clicks || 0),
      ctr: parseFloat(raw.ctr || 0),
      cpc: parseFloat(raw.cpc || 0),
      linkClicks: actions.link_click || 0,
      landingPageViews: actions.landing_page_view || 0,
      videoViews: actions.video_view || 0,
      conversions: actions.onsite_conversion?.total_messaging_connection || actions.purchase || 0,
      postEngagement: actions.post_engagement || 0,
      costPerLinkClick: costPerAction.link_click || 0,
      costPerLandingPageView: costPerAction.landing_page_view || 0,
      dateStart: raw.date_start,
      dateStop: raw.date_stop,
    };
  }
}
