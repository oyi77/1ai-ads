import config from '../config/index.js';
import { WebSocketServer } from 'ws';
import { createLogger } from '../lib/logger.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { MetaAdsAPI } from './meta/index.js';

const log = createLogger('realtime-service');

export class RealtimeService {
  constructor(metaApi, campaignsRepo, { platformAccountsRepo = null, settingsRepo = null } = {}) {
    this.metaApi = metaApi;
    this.campaignsRepo = campaignsRepo;
    this.platformAccountsRepo = platformAccountsRepo;
    this.settingsRepo = settingsRepo;
    this.wss = null;
    this.clients = new Set();
    this.metrics = new Map(); // campaignId -> latest metrics
    this.pollInterval = null;
    this.POLL_MS = config.intervals.realtimePoll;
  }

  /**
   * Resolve the Meta client bound to the campaign OWNER's token (multi-tenant),
   * falling back to the system client when the owner has no bound account.
   * Background polling must not read cross-user campaigns with a system token.
   */
  _metaApiForOwner(campaign) {
    const ownerId = campaign?.user_id || campaign?.created_by;
    if (ownerId && this.platformAccountsRepo) {
      const token = resolveOwnerPlatformToken('meta', ownerId, {
        platformAccountsRepo: this.platformAccountsRepo,
        settingsRepo: this.settingsRepo,
      });
      if (token) {
        const api = new MetaAdsAPI(this.settingsRepo);
        api.setActiveAccount(null, token);
        return api;
      }
    }
    return this.metaApi;
  }

  /**
   * Attach WebSocket server to an HTTP server
   */
  _handleConnection(ws, req) {
    log.info('Client connected', { ip: req.socket.remoteAddress });
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: 'snapshot', data: Object.fromEntries(this.metrics), timestamp: new Date().toISOString() }));
    ws.on('close', () => { this.clients.delete(ws); log.info('Client disconnected', { remaining: this.clients.size }); });
    ws.on('error', (err) => { log.error('WebSocket error', { error: err.message }); this.clients.delete(ws); });
  }

  attach(server) {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws/realtime') {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
      } else { socket.destroy(); }
    });
    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    log.info('WebSocket server attached', { path: '/ws/realtime' });
  }

  /**
   * Start polling Meta API for campaign metrics
   */
  startPolling() {
    if (this.pollInterval) return;
    log.info('Starting metric polling', { intervalMs: this.POLL_MS });
    this._poll(); // immediate first poll
    this.pollInterval = setInterval(() => this._poll(), this.POLL_MS);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      log.info('Polling stopped');
    }
  }

  /**
   * Poll Meta API for all active campaigns
   */
  _buildMetricFromInsights(campaign, data) {
    const spend = parseFloat(data.spend || 0);
    const conversions = this._extractConversions(data);
    return {
      campaign_id: campaign.campaign_id,
      name: campaign.name, status: campaign.status,
      spend, clicks: parseInt(data.clicks || 0), impressions: parseInt(data.impressions || 0),
      conversions, ctr: parseFloat(data.ctr || 0), cpc: parseFloat(data.cpc || 0),
      roas: spend > 0 && conversions > 0 ? (campaign.revenue || 0) / spend : null,
      timestamp: new Date().toISOString(),
    };
  }

  async _poll() {
    try {
      const result = this.campaignsRepo.findAll ? this.campaignsRepo.findAll({}) : { data: [] };
      const campaigns = result.data || [];
      // Only Meta has a real-time API path here; skip other platform rows so we
      // don't fire Meta requests against google/tiktok campaign ids.
      const activeCampaigns = campaigns.filter(c => (c.platform === 'meta' || !c.platform) && (c.status === 'ACTIVE' || c.status === 'active'));

      // Group by owner+account so we can fetch ONE batched insights call per
      // account instead of N individual calls — avoids Meta "User request limit
      // reached" (code 17) when many campaigns are active.
      const byOwner = new Map(); // "ownerId:accountId" -> { api, accountId, campaignIds: [] }
      for (const campaign of activeCampaigns) {
        const ownerId = campaign?.user_id || campaign?.created_by;
        if (!ownerId) continue;
        const key = `${ownerId}:${campaign.account_id || ''}`;
        if (!byOwner.has(key)) {
          const api = this._metaApiForOwner(campaign);
          byOwner.set(key, { api, accountId: campaign.account_id, campaignIds: [] });
        }
        byOwner.get(key).campaignIds.push(campaign);
      }

      for (const [, { api, accountId, campaignIds }] of byOwner) {
        try {
          const ids = campaignIds.map(c => c.campaign_id).filter(Boolean);
          if (!ids.length) continue;
          // campaigns table has no account_id column (it's in platform_accounts.
          // credentials.ad_account_id). When accountId is unavailable, the
          // batched insights call is skipped and the group produces no metrics
          // (all-zero). The proper fix requires resolving account_id from the
          // owner's platform accounts — tracked separately.
          const insightsMap = accountId
            ? await api.getMultiCampaignInsights(ids, { datePreset: 'today', accountId })
            : {};
          for (const campaign of campaignIds) {
            const cid = campaign.campaign_id;
            const insights = insightsMap[cid] || {};
            const metric = this._buildMetricFromInsights(campaign, insights);
            this.metrics.set(cid, metric);
            this._broadcast({ type: 'metric_update', data: metric });
          }
        } catch (err) {
          log.warn('Failed to poll owner account', { accountId, error: err.message });
        }
      }
      log.debug('Poll complete', { active: activeCampaigns.length, groups: byOwner.size, clients: this.clients.size });
    } catch (err) {
      log.error('Poll failed', { error: err.message });
    }
  }

  /**
   * Extract conversions from Meta insights actions array
   */
  _extractConversions(data) {
    const actions = data.actions || [];
    for (const action of actions) {
      if (['purchase', 'offsite_conversion.fb_pixel_purchase', 'lead'].includes(action.action_type)) {
        return parseInt(action.value || 0);
      }
    }
    return 0;
  }

  /**
   * Broadcast message to all connected clients
   */
  _broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }

  /**
   * Get current metrics snapshot (REST fallback)
   */
  getMetrics() {
    return {
      campaigns: Object.fromEntries(this.metrics),
      connected_clients: this.clients.size,
      last_poll: new Date().toISOString(),
    };
  }

  /**
   * Force refresh a specific campaign
   */
  async refreshCampaign(campaignId) {
    try {
      const campaign = this.campaignsRepo.getById ? this.campaignsRepo.getById(campaignId) : null;
      const api = this._metaApiForOwner(campaign || { campaign_id: campaignId });
      const insights = await api.getCampaignInsights(campaignId, {
        datePreset: 'today', fields: 'spend,impressions,clicks,actions,ctr,cpc,cpm',
      });
      const data = insights || {};
      const metric = {
        campaign_id: campaignId, spend: parseFloat(data.spend || 0),
        clicks: parseInt(data.clicks || 0), impressions: parseInt(data.impressions || 0),
        conversions: this._extractConversions(data), ctr: parseFloat(data.ctr || 0),
        cpc: parseFloat(data.cpc || 0), timestamp: new Date().toISOString(),
      };
      this.metrics.set(campaignId, metric);
      this._broadcast({ type: 'metric_update', data: metric });
      return metric;
    } catch (err) {
      log.error('Refresh failed', { campaignId, error: err.message });
      throw err;
    }
  }
}
