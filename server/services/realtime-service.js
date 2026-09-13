import config from '../config/index.js';
import { WebSocketServer } from 'ws';
import { createLogger } from '../lib/logger.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { MetaAdsAPI } from './meta/index.js';
import { verifyToken } from '../lib/auth.js';
import { ACCESS_COOKIE } from '../lib/auth-cookies.js';

const log = createLogger('realtime-service');

/**
 * Resolve the authenticated user id from a WS upgrade request. Browsers
 * send the httpOnly access cookie automatically; there is no other
 * credential channel on a WebSocket handshake. Returns null when absent
 * or invalid — the caller must destroy the socket (fail-closed).
 */
function userIdFromUpgrade(req) {
  try {
    const header = req?.headers?.cookie || '';
    const pair = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${ACCESS_COOKIE}=`));
    if (!pair) return null;
    const payload = verifyToken(decodeURIComponent(pair.slice(ACCESS_COOKIE.length + 1)));
    return payload?.id || null;
  } catch {
    return null;
  }
}
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
   * Resolve the Meta client bound to the campaign OWNER's token (multi-tenant).
   * Returns null when the owner has no bound account — the poll loop skips
   * those campaigns instead of reading them with the operator credential.
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
    return null;
  }

  /**
   * Attach WebSocket server to an HTTP server. Upgrade requests without a
   * valid access cookie are destroyed — previously ANY anonymous connection
   * received every tenant's live metrics snapshot + broadcast.
   */
  _handleConnection(ws, req, userId) {
    ws.userId = userId || null;
    log.info('Client connected', { ip: req.socket.remoteAddress, userId });
    this.clients.add(ws);
    ws.send(JSON.stringify({ type: 'snapshot', data: this._snapshotFor(userId), timestamp: new Date().toISOString() }));
    ws.on('close', () => { this.clients.delete(ws); log.info('Client disconnected', { remaining: this.clients.size }); });
    ws.on('error', (err) => { log.error('WebSocket error', { error: err.message }); this.clients.delete(ws); });
  }

  /** Metrics snapshot scoped to one owner's campaigns. */
  _snapshotFor(userId) {
    const out = {};
    for (const [cid, m] of this.metrics) {
      if (!userId || m?.owner === userId) out[cid] = m;
    }
    return out;
  }

  attach(server) {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws/realtime') {
        const userId = userIdFromUpgrade(req);
        if (!userId) { socket.destroy(); return; }
        this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req, userId));
      } else { socket.destroy(); }
    });
    this.wss.on('connection', (ws, req, userId) => this._handleConnection(ws, req, userId));
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
      owner: campaign.user_id || campaign.created_by || null,
      name: campaign.name, status: campaign.status,
      spend, clicks: parseInt(data.clicks || 0), impressions: parseInt(data.impressions || 0),
      conversions, ctr: parseFloat(data.ctr || 0), cpc: parseFloat(data.cpc || 0),
      roas: spend > 0 && conversions > 0 ? (campaign.revenue || 0) / spend : null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Poll Meta API for all active campaigns
   */
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
        // campaigns rows don't carry account_id — it lives in
        // platform_accounts.credentials.ad_account_id. Resolve it per owner so
        // the batched insights call gets a real account.
        // Multi-tenancy: resolve ALL Meta accounts for this owner so each
        // account gets its own batched insights call. Campaigns without
        // account_id are polled against all of the owner's accounts.
        const accountIds = [];
        if (campaign.account_id) {
          accountIds.push(campaign.account_id);
        } else if (this.platformAccountsRepo) {
          const accounts = this.platformAccountsRepo.findAllActiveByUserAndPlatform?.(ownerId, 'meta') || [];
          for (const acct of accounts) {
            const id = acct?.credentials?.ad_account_id || acct?.ad_account_id || '';
            if (id) accountIds.push(id);
          }
        }
        for (const acctId of accountIds) {
          const key = `${ownerId}:${acctId}`;
          if (!byOwner.has(key)) {
            const api = this._metaApiForOwner(campaign);
            if (!api) {
              log.debug('Skipping poll group - owner has no bound Meta token', { ownerId, acctId });
              continue;
            }
            byOwner.set(key, { api, accountId: acctId, campaignIds: [] });
          }
          byOwner.get(key).campaignIds.push(campaign);
        }
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
            this._broadcast({ type: 'metric_update', data: metric }, metric.owner);
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
   * Broadcast a message to connected clients of ONE owner. The owner id
   * comes from the metric itself — a client never receives another
   * tenant's spend/clicks/revenue. Messages without an owner (system
   * notices) still go to every open client.
   */
  _broadcast(message, ownerId = undefined) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState !== 1) continue; // OPEN
      if (ownerId !== undefined && client.userId !== undefined && client.userId !== ownerId) continue;
      client.send(payload);
    }
  }

  /**
   * Metrics snapshot scoped to one owner (REST fallback). Operational
   * counters stay global; campaign data is filtered.
   */
  getMetrics(userId = undefined) {
    return {
      campaigns: this._snapshotFor(userId),
      connected_clients: this.clients.size,
      last_poll: new Date().toISOString(),
    };
  }

  /**
   * Force-refresh one campaign. Scoped: a caller can only refresh their
   * OWN campaign (404 otherwise), and only with their own bound token
   * (clear error when unbound — never the operator credential).
   */
  async refreshCampaign(campaignId, userId = undefined) {
    try {
      const campaign = typeof this.campaignsRepo?.findById === 'function'
        ? this.campaignsRepo.findById(campaignId, userId)
        : null;
      if (!campaign) {
        const err = new Error('Campaign not found');
        err.statusCode = 404;
        throw err;
      }
      const api = this._metaApiForOwner(campaign);
      if (!api) throw new Error('Meta account not connected. Connect your account in Settings.');
      const insights = await api.getCampaignInsights(campaignId, {
        datePreset: 'today', fields: 'spend,impressions,clicks,actions,ctr,cpc,cpm',
      });
      const data = insights || {};
      const metric = {
        campaign_id: campaignId, owner: campaign.user_id || campaign.created_by || null,
        spend: parseFloat(data.spend || 0),
        clicks: parseInt(data.clicks || 0), impressions: parseInt(data.impressions || 0),
        conversions: this._extractConversions(data), ctr: parseFloat(data.ctr || 0),
        cpc: parseFloat(data.cpc || 0), timestamp: new Date().toISOString(),
      };
      this.metrics.set(campaignId, metric);
      this._broadcast({ type: 'metric_update', data: metric }, metric.owner);
      return metric;
    } catch (err) {
      log.error('Refresh failed', { campaignId, error: err.message });
      throw err;
    }
  }
}
