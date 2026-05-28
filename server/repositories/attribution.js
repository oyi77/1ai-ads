import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const log = createLogger('attribution-repo');

export class AttributionRepository {
  constructor(db) {
    this.db = db;
  }

  create({ ad_id, campaign_id, shopee_order_id, shopee_revenue, ad_spend, match_method }) {
    const id = uuidv4();
    try {
      this.db.prepare(`
        INSERT INTO attributions (id, ad_id, campaign_id, shopee_order_id, shopee_revenue, ad_spend, match_method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, ad_id, campaign_id, shopee_order_id, shopee_revenue || 0, ad_spend || 0, match_method || 'taglink');
      log.info('Attribution created', { id, ad_id, campaign_id, shopee_order_id });
      return this.findById(id);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint')) {
        log.info('Attribution already exists', { shopee_order_id, campaign_id });
        return this.findByOrderAndCampaign(shopee_order_id, campaign_id);
      }
      throw err;
    }
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM attributions WHERE id = ?').get(id) || null;
  }

  findByOrderAndCampaign(shopee_order_id, campaign_id) {
    return this.db.prepare('SELECT * FROM attributions WHERE shopee_order_id = ? AND campaign_id = ?').get(shopee_order_id, campaign_id) || null;
  }

  getByCampaignId(campaign_id, { limit = 100 } = {}) {
    return this.db.prepare('SELECT * FROM attributions WHERE campaign_id = ? ORDER BY matched_at DESC LIMIT ?').all(campaign_id, limit);
  }

  getRecent({ limit = 50 } = {}) {
    return this.db.prepare('SELECT * FROM attributions ORDER BY matched_at DESC LIMIT ?').all(limit);
  }

  getDashboard(campaign_id) {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(ad_spend), 0) AS total_ad_spend,
        COALESCE(SUM(shopee_revenue), 0) AS total_revenue,
        COUNT(*) AS total_attributions,
        CASE WHEN SUM(ad_spend) > 0 THEN ROUND(SUM(shopee_revenue) / SUM(ad_spend), 2) ELSE 0 END AS roas
      FROM attributions
      WHERE campaign_id = ?
    `).get(campaign_id);

    return {
      campaign_id,
      total_ad_spend: row.total_ad_spend,
      total_revenue: row.total_revenue,
      total_attributions: row.total_attributions,
      roas: row.roas,
    };
  }
}
