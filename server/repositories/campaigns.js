import { v4 as uuid } from 'uuid';

export class CampaignsRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ platform } = {}) {
    if (platform) {
      const data = this.db.prepare('SELECT * FROM campaigns WHERE platform = ? ORDER BY created_at DESC').all(platform);
      return { data, total: data.length };
    }
    const data = this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    return { data, total: data.length };
  }

  upsert(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT OR REPLACE INTO campaigns (id, platform, campaign_id, name, status, budget, spend, revenue, impressions, clicks, conversions, roas, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id, data.platform, data.campaign_id, data.name || null, data.status || null,
      data.budget || null, data.spend || null, data.revenue || null,
      data.impressions || 0, data.clicks || 0, data.conversions || 0,
      data.roas || null
    );
    return id;
  }

  getDashboardMetrics() {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(spend), 0) as total_spend,
        SUM(revenue) as total_revenue,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(clicks), 0) as total_clicks,
        COALESCE(SUM(conversions), 0) as total_conversions
      FROM campaigns
    `).get();

    const total_spend = row.total_spend;
    const total_revenue = row.total_revenue; // null if no revenue data

    return {
      total_spend,
      total_revenue: total_revenue || null,
      total_impressions: row.total_impressions,
      total_clicks: row.total_clicks,
      total_conversions: row.total_conversions,
      avg_roas: total_spend > 0 && total_revenue > 0 ? total_revenue / total_spend : 0,
      avg_ctr: row.total_impressions > 0 ? (row.total_clicks / row.total_impressions) * 100 : 0,
      avg_cpc: row.total_clicks > 0 ? total_spend / row.total_clicks : 0,
      avg_cpa: row.total_conversions > 0 ? total_spend / row.total_conversions : 0,
    };
  }

  getMetricsByPlatform() {
    return this.db.prepare(`
      SELECT
        platform,
        COALESCE(SUM(spend), 0) as spend,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(clicks), 0) as clicks,
        COALESCE(SUM(conversions), 0) as conversions
      FROM campaigns
      GROUP BY platform
      ORDER BY spend DESC
    `).all().map(row => ({
      platform: row.platform,
      spend: row.spend,
      revenue: row.revenue,
      roas: row.spend > 0 && row.revenue > 0 ? row.revenue / row.spend : 0,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      conversions: row.conversions,
    }));
  }

  getTopCampaigns(limit = 5) {
    return this.db.prepare(`
      SELECT name, platform, spend, revenue, roas, status
      FROM campaigns
      WHERE spend > 0 AND revenue > 0
      ORDER BY roas DESC
      LIMIT ?
    `).all(limit);
  }
}
