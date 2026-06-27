import { createLogger } from '../lib/logger.js';

const log = createLogger('attribution-service');

const MATCH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AttributionService {
  /**
   * @param {import('../repositories/attribution.js').AttributionRepository} attributionRepo
   * @param {import('./shopee-adapter.js').ShopeeAdapter} shopeeAdapter
   * @param {object} [campaignsRepo] - optional, for ad_spend lookup
   * @param {object} [adsRepo] - optional, for ad click data
   */
  constructor(attributionRepo, shopeeAdapter, campaignsRepo, adsRepo) {
    this.attributionRepo = attributionRepo;
    this.shopeeAdapter = shopeeAdapter;
    this.campaignsRepo = campaignsRepo;
    this.adsRepo = adsRepo;
  }

  /**
   * Match orders to ad clicks by product ID + time window (24h).
   * @param {Array} orders - Shopee orders with product_id, order_id, revenue, created_at
   * @param {Array} adClicks - ad clicks with ad_id, campaign_id, product_id, clicked_at
   * @returns {Array} matches
   */
  matchOrdersToAds(orders, adClicks) {
    if (!orders?.length || !adClicks?.length) return [];
    const matches = [];
    for (const order of orders) {
      const best = this._findBestMatch(order, adClicks);
      if (best) matches.push(best);
    }
    log.info('Matched orders to ads', { orders: orders.length, clicks: adClicks.length, matches: matches.length });
    return matches;
  }

  _findBestMatch(order, adClicks) {
    const orderTime = new Date(order.created_at || order.created_at_ts).getTime();
    if (isNaN(orderTime)) return null;
    const candidates = adClicks
      .filter(click => this._isClickMatch(order, click, orderTime))
      .sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at));
    if (candidates.length === 0) return null;
    return {
      ad_id: candidates[0].ad_id,
      campaign_id: candidates[0].campaign_id,
      shopee_order_id: order.order_id,
      shopee_revenue: order.revenue || order.amount || 0,
      match_method: 'product_time',
    };
  }

  _isClickMatch(order, click, orderTime) {
    if (click.product_id && order.product_id && click.product_id !== order.product_id) return false;
    const clickTime = new Date(click.clicked_at).getTime();
    return !isNaN(clickTime) && (orderTime - clickTime) >= 0 && (orderTime - clickTime) <= MATCH_WINDOW_MS;
  }

  /**
   * Get attribution dashboard for a campaign.
   */
  async getAttributionDashboard(campaignId) {
    const dashboard = this.attributionRepo.getDashboard(campaignId);
    log.info('Dashboard fetched', { campaignId });
    return dashboard;
  }

  async processNewOrders(params = {}) {
    log.info('Processing new orders');
    const orders = await this.shopeeAdapter.fetchOrders(params);
    if (!orders.length) { log.info('No orders to process'); return { processed: 0, matched: 0 }; }

    const adClicks = this._buildAdClicks(params);
    const matches = this.matchOrdersToAds(orders, adClicks);
    const stored = this._storeMatches(matches);

    log.info('Order processing complete', { orders: orders.length, matched: matches.length, stored });
    return { processed: orders.length, matched: matches.length, stored };
  }

  _buildAdClicks(params) {
    if (!this.adsRepo || !params.campaign_id) return [];
    try {
      const ads = this.adsRepo.findByCampaignId ? this.adsRepo.findByCampaignId(params.campaign_id) : [];
      return ads.map(ad => ({ ad_id: ad.id, campaign_id: params.campaign_id, product_id: ad.product, clicked_at: ad.created_at }));
    } catch (err) {
      log.warn('Failed to fetch ad clicks', { error: err.message });
      return [];
    }
  }

  _storeMatches(matches) {
    let stored = 0;
    for (const match of matches) {
      try { this.attributionRepo.create(match); stored++; }
      catch (err) { log.warn('Failed to store attribution', { error: err.message }); }
    }
    return stored;
  }

  // --- Multi-touch attribution models ---

  calculateFirstTouch(touchpoints) {
    if (!touchpoints || !touchpoints.length) return [];
    return [{ adId: touchpoints[0].adId, weight: 1.0 }];
  }

  calculateLastTouch(touchpoints) {
    if (!touchpoints || !touchpoints.length) return [];
    return [{ adId: touchpoints[touchpoints.length - 1].adId, weight: 1.0 }];
  }

  calculateLinear(touchpoints) {
    if (!touchpoints || !touchpoints.length) return [];
    const weight = 1 / touchpoints.length;
    return touchpoints.map(tp => ({ adId: tp.adId, weight }));
  }

  calculateTimeDecay(touchpoints, halfLifeDays = 7) {
    if (!touchpoints || !touchpoints.length) return [];
    const now = Date.now();
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
    const raw = touchpoints.map(tp => {
      const age = now - new Date(tp.timestamp || tp.clicked_at || Date.now()).getTime();
      return { adId: tp.adId, rawWeight: Math.pow(0.5, age / halfLifeMs) };
    });
    const total = raw.reduce((s, r) => s + r.rawWeight, 0);
    return total > 0 ? raw.map(r => ({ adId: r.adId, weight: r.rawWeight / total })) : raw.map(r => ({ adId: r.adId, weight: 0 }));
  }

  calculatePositionBased(touchpoints) {
    if (!touchpoints || !touchpoints.length) return [];
    if (touchpoints.length === 1) return [{ adId: touchpoints[0].adId, weight: 1.0 }];
    if (touchpoints.length === 2) return touchpoints.map(tp => ({ adId: tp.adId, weight: 0.5 }));
    const middleWeight = 0.2 / (touchpoints.length - 2);
    return touchpoints.map((tp, i) => ({
      adId: tp.adId,
      weight: i === 0 ? 0.4 : i === touchpoints.length - 1 ? 0.4 : middleWeight,
    }));
  }

  calculateAttribution(touchpoints, model = 'linear') {
    const models = {
      first_touch: this.calculateFirstTouch,
      last_touch: this.calculateLastTouch,
      linear: this.calculateLinear,
      time_decay: this.calculateTimeDecay,
      position_based: this.calculatePositionBased,
    };
    const fn = models[model] || models.linear;
    return { model, results: fn.call(this, touchpoints) };
  }
}
