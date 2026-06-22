import config from '../config/index.js';
import { WebSocketServer } from 'ws';
import { createLogger } from '../lib/logger.js';

const log = createLogger('realtime-service');

export class RealtimeService {
  constructor(metaApi, campaignsRepo) {
    this.metaApi = metaApi;
    this.campaignsRepo = campaignsRepo;
    this.wss = null;
    this.clients = new Set();
    this.metrics = new Map(); // campaignId -> latest metrics
    this.pollInterval = null;
    this.POLL_MS = config.intervals.realtimePoll;
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
      const campaigns = this.campaignsRepo.getAll ? this.campaignsRepo.getAll() : [];
      const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');

      for (const campaign of activeCampaigns) {
        try {
          const insights = await this.metaApi.getCampaignInsights(campaign.campaign_id, {
            date_preset: 'today', fields: 'spend,impressions,clicks,actions,cost_per_action_type,ctr,cpc,cpm',
          });
          const data = insights?.data?.[0] || {};
          const metric = this._buildMetricFromInsights(campaign, data);
          this.metrics.set(campaign.campaign_id, metric);
          this._broadcast({ type: 'metric_update', data: metric });
        } catch (err) {
          log.warn('Failed to poll campaign', { campaignId: campaign.campaign_id, error: err.message });
        }
      }
      log.debug('Poll complete', { campaigns: activeCampaigns.length, clients: this.clients.size });
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
      const insights = await this.metaApi.getCampaignInsights(campaignId, {
        date_preset: 'today', fields: 'spend,impressions,clicks,actions,ctr,cpc,cpm',
      });
      const data = insights?.data?.[0] || {};
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
