import { createLogger } from '../lib/logger.js';
import { randomUUID } from 'crypto';

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
    const matches = [];
    if (!orders?.length || !adClicks?.length) return matches;

    for (const order of orders) {
      const orderTime = new Date(order.created_at || order.created_at_ts).getTime();
      if (isNaN(orderTime)) continue;

      const candidates = adClicks.filter(click => {
        if (click.product_id && order.product_id && click.product_id !== order.product_id) {
          return false;
        }
        const clickTime = new Date(click.clicked_at).getTime();
        return !isNaN(clickTime) && (orderTime - clickTime) >= 0 && (orderTime - clickTime) <= MATCH_WINDOW_MS;
      });

      if (candidates.length > 0) {
        // Pick most recent click
        candidates.sort((a, b) => new Date(b.clicked_at) - new Date(a.clicked_at));
        matches.push({
          ad_id: candidates[0].ad_id,
          campaign_id: candidates[0].campaign_id,
          shopee_order_id: order.order_id,
          shopee_revenue: order.revenue || order.amount || 0,
          match_method: 'product_time',
        });
      }
    }

    log.info('Matched orders to ads', { orders: orders.length, clicks: adClicks.length, matches: matches.length });
    return matches;
  }

  /**
   * Get attribution dashboard for a campaign.
   */
  async getAttributionDashboard(campaignId) {
    const dashboard = this.attributionRepo.getDashboard(campaignId);
    log.info('Dashboard fetched', { campaignId });
    return dashboard;
  }

  /**
   * Fetch new orders from Shopee, match to ads, and store attributions.
   */
  async processNewOrders(params = {}) {
    log.info('Processing new orders');
    const orders = await this.shopeeAdapter.fetchOrders(params);
    if (!orders.length) {
      log.info('No orders to process');
      return { processed: 0, matched: 0 };
    }

    // Build ad clicks from repo if available
    let adClicks = [];
    if (this.adsRepo && params.campaign_id) {
      try {
        const ads = this.adsRepo.findByCampaignId ? this.adsRepo.findByCampaignId(params.campaign_id) : [];
        adClicks = ads.map(ad => ({
          ad_id: ad.id,
          campaign_id: params.campaign_id,
          product_id: ad.product,
          clicked_at: ad.created_at,
        }));
      } catch (err) {
        log.warn('Failed to fetch ad clicks', { error: err.message });
      }
    }

    const matches = this.matchOrdersToAds(orders, adClicks);
    let stored = 0;
    for (const match of matches) {
      try {
        this.attributionRepo.create(match);
        stored++;
      } catch (err) {
        log.warn('Failed to store attribution', { error: err.message });
      }
    }

    log.info('Order processing complete', { orders: orders.length, matched: matches.length, stored });
    return { processed: orders.length, matched: matches.length, stored };
  }
}
