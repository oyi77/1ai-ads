import { v4 as uuid } from 'uuid';

export class CampaignsRepository {
  constructor(db) {
    this.db = db;
  }

  findAll({ platform, userId } = {}) {
    if (platform && userId) {
      const data = this.db.prepare('SELECT * FROM campaigns WHERE platform = ? AND (user_id = ? OR user_id = ?) ORDER BY created_at DESC').all(platform, userId, 'system');
      return { data, total: data.length };
    } else if (userId) {
      const data = this.db.prepare('SELECT * FROM campaigns WHERE user_id = ? OR user_id = ? ORDER BY created_at DESC').all(userId, 'system');
      return { data, total: data.length };
    } else if (platform) {
      const data = this.db.prepare('SELECT * FROM campaigns WHERE platform = ? ORDER BY created_at DESC').all(platform);
      return { data, total: data.length };
    }
    const data = this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    return { data, total: data.length };
  }

  upsert(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO campaigns (id, user_id, platform, campaign_id, name, status, budget, spend, revenue, impressions, clicks, conversions, roas, last_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id, platform = excluded.platform,
        campaign_id = excluded.campaign_id, name = excluded.name, status = excluded.status,
        budget = excluded.budget, spend = excluded.spend, revenue = excluded.revenue,
        impressions = excluded.impressions, clicks = excluded.clicks, conversions = excluded.conversions,
        roas = excluded.roas, last_synced = CURRENT_TIMESTAMP
    `).run(
      id, data.userId || data.user_id || 'system', data.platform, data.campaign_id, data.name || null, data.status || null,
      data.budget || null, data.spend || null, data.revenue || null,
      data.impressions || 0, data.clicks || 0, data.conversions || 0,
      data.roas || null
    );
    return id;
  }

  getDashboardMetrics(userId) {
    let sql = `
      SELECT
        COALESCE(SUM(spend), 0) as total_spend,
        SUM(revenue) as total_revenue,
        COALESCE(SUM(impressions), 0) as total_impressions,
        COALESCE(SUM(clicks), 0) as total_clicks,
        COALESCE(SUM(conversions), 0) as total_conversions
      FROM campaigns`;
    if (userId) {
      sql += ' WHERE user_id = ? OR user_id = ?';
    }
    const row = this.db.prepare(sql).get(...(userId ? [userId, 'system'] : []));

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

  getMetricsByPlatform(userId) {
    let sql = `
      SELECT
        platform,
        COALESCE(SUM(spend), 0) as spend,
        COALESCE(SUM(revenue), 0) as revenue,
        COALESCE(SUM(impressions), 0) as impressions,
        COALESCE(SUM(clicks), 0) as clicks,
        COALESCE(SUM(conversions), 0) as conversions
      FROM campaigns`;
    if (userId) {
      sql += ' WHERE (user_id = ? OR user_id = ?)';
    }
    sql += `
      GROUP BY platform
      ORDER BY spend DESC`;
    const params = userId ? [userId, 'system'] : [];
    return this.db.prepare(sql).all(...params).map(row => ({
      platform: row.platform,
      spend: row.spend,
      revenue: row.revenue,
      roas: row.spend > 0 && row.revenue > 0 ? row.revenue / row.spend : 0,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      conversions: row.conversions,
    }));
  }

  getTopCampaigns(limit = 5, userId) {
    let sql = `
      SELECT name, platform, spend, revenue, roas, status
      FROM campaigns
      WHERE spend > 0 AND revenue > 0`;
    if (userId) {
      sql += ' AND (user_id = ? OR user_id = ?)';
    }
    sql += `
      ORDER BY roas DESC
      LIMIT ?`;
    const params = userId ? [userId, 'system', limit] : [limit];
    return this.db.prepare(sql).all(...params);
  }

  findById(id, userId) {
    let sql = 'SELECT * FROM campaigns WHERE id = ?';
    if (userId) {
      sql += ' AND (user_id = ? OR user_id = ?)';
    }
    const params = userId ? [id, userId, 'system'] : [id];
    const row = this.db.prepare(sql).get(...params);
    if (!row) return null;
    const stats = this.db.prepare(`
      SELECT COALESCE(SUM(spend),0) as spend,
             COALESCE(SUM(revenue),0) as revenue,
             COALESCE(SUM(roas),0) as roas,
             COALESCE(SUM(impressions),0) as impressions,
             COALESCE(SUM(clicks),0) as clicks
      FROM campaigns WHERE id = ?
    `).get(id);
    return {
      ...row,
      stats: {
        spend: stats.spend || 0,
        revenue: stats.revenue || 0,
        roas: stats.roas || 0,
        impressions: stats.impressions || 0,
        clicks: stats.clicks || 0,
      }
    };
  }

  getById(id) {
    return this.findById(id);
  }

  findActive(userId) {
    if (userId) {
      return this.db.prepare('SELECT * FROM campaigns WHERE status = ? AND user_id = ?').all('ACTIVE', userId).map(row => ({
        ...row,
        stats: { spend: row.spend, revenue: row.revenue, roas: row.roas, impressions: row.impressions, clicks: row.clicks },
      }));
    }
    return this.db.prepare('SELECT * FROM campaigns WHERE status = ?').all('ACTIVE').map(row => ({
      ...row,
      stats: { spend: row.spend, revenue: row.revenue, roas: row.roas, impressions: row.impressions, clicks: row.clicks },
    }));
  }

  getByUserId(userId) {
    if (userId) {
      return this.db.prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(row => ({
        ...row,
        stats: { spend: row.spend, revenue: row.revenue, roas: row.roas, impressions: row.impressions, clicks: row.clicks },
      }));
    }
    return this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all().map(row => ({
      ...row,
      stats: { spend: row.spend, revenue: row.revenue, roas: row.roas, impressions: row.impressions, clicks: row.clicks },
    }));
  }

  update(id, data, userId) {
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        fields.push(`${key} = ?`);
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return false;
    let sql = `UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    if (userId) {
      sql += ` AND (user_id = ? OR user_id = 'system')`;
      values.push(userId);
    }
    const result = this.db.prepare(sql).run(...values);
    return result.changes > 0;
  }

  findByCampaignId(metaCampaignId) {
    return this.db.prepare("SELECT * FROM campaigns WHERE campaign_id = ?").get(metaCampaignId) || null;
  }

  getAds(campaignId) {
    return this.db.prepare('SELECT * FROM ads WHERE campaign_id = ?').all(campaignId).map(row => ({
      ...row,
      stats: { spend: row.spend, revenue: row.revenue, roas: row.roas },
    }));
  }

  create(data) {
    return this.upsert(data);
  }
  ownsAccount(accountId, userId) {
    if (userId === null || accountId === null) return false;
    const row = this.db
      .prepare('SELECT 1 FROM campaigns WHERE campaign_id = ? AND user_id = ? LIMIT 1')
      .get(accountId, userId);
    return !!row;
  }
}
