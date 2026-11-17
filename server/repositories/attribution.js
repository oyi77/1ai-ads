import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const log = createLogger('attribution-repo');

export class AttributionRepository {
  constructor(db) {
    this.db = db;
  }

  // ── Ad clicks (migration 054) ─────────────────────────────

  /**
   * Record a click event. Accepts the subset of columns the caller has —
   * unknown/undefined fields are skipped, never stored as NULL noise.
   */
  recordClick({
    ad_id, campaign_id, product_id, user_id,
    clicked_at, ip_hash, user_agent, referer,
    utm_source, utm_medium, utm_campaign,
  }) {
    if (!ad_id || !clicked_at) {
      throw new Error('recordClick requires ad_id and clicked_at');
    }
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO ad_clicks (id, ad_id, campaign_id, product_id, user_id, clicked_at,
                             ip_hash, user_agent, referer, utm_source, utm_medium, utm_campaign)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, ad_id, campaign_id ?? null, product_id ?? null, user_id ?? null, clicked_at,
      ip_hash ?? null, user_agent ?? null, referer ?? null,
      utm_source ?? null, utm_medium ?? null, utm_campaign ?? null,
    );
    return id;
  }

  /**
   * Clicks for the product_time matcher — one row per click, scoped by
   * product_id (when present) and the standard 24-hour lookback.
   */
  findClicks({ campaign_id, product_id, sinceMs = 24 * 60 * 60 * 1000 } = {}) {
    const since = new Date(Date.now() - sinceMs).toISOString();
    const where = ['clicked_at >= ?'];
    const params = [since];
    if (campaign_id) { where.push('campaign_id = ?'); params.push(campaign_id); }
    if (product_id) { where.push('product_id = ?'); params.push(product_id); }
    return this.db.prepare(
      `SELECT id, ad_id, campaign_id, product_id, clicked_at
         FROM ad_clicks
        WHERE ${where.join(' AND ')}
        ORDER BY clicked_at DESC`
    ).all(...params);
  }

  // ── Attributions (pre-existing) ───────────────────────────

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
    const whereClause = campaign_id ? 'WHERE campaign_id = ?' : '';
    const params = campaign_id ? [campaign_id] : [];
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(ad_spend), 0) AS total_ad_spend,
        COALESCE(SUM(shopee_revenue), 0) AS total_revenue,
        COUNT(*) AS total_attributions,
        CASE WHEN SUM(ad_spend) > 0 THEN ROUND(SUM(shopee_revenue) / SUM(ad_spend), 2) ELSE 0 END AS roas
      FROM attributions
      ${whereClause}
    `).get(...params);

    return {
      campaign_id: campaign_id || 'all',
      total_ad_spend: row.total_ad_spend,
      total_revenue: row.total_revenue,
      total_attributions: row.total_attributions,
      roas: row.roas,
    };
  }
}
