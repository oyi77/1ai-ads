import { v4 as uuid } from 'uuid';

export class ReportingRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reporting_snapshots (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        snapshot_date DATE NOT NULL,
        platform TEXT NOT NULL,
        account_id TEXT,
        campaign_id TEXT,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        spend REAL DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        ctr REAL DEFAULT 0,
        cpc REAL DEFAULT 0,
        cpa REAL DEFAULT 0,
        roas REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_user_date ON reporting_snapshots(user_id, snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_reporting_snapshots_platform ON reporting_snapshots(platform, snapshot_date);
    `);
  }

  createSnapshot(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO reporting_snapshots (id, user_id, snapshot_date, platform, account_id, campaign_id, impressions, clicks, spend, conversions, revenue, ctr, cpc, cpa, roas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.snapshotDate, data.platform, data.accountId || null, data.campaignId || null,
      data.impressions || 0, data.clicks || 0, data.spend || 0, data.conversions || 0, data.revenue || 0,
      data.ctr || 0, data.cpc || 0, data.cpa || 0, data.roas || 0
    );
    return id;
  }

  getSnapshots(userId, { startDate, endDate, platforms, groupBy = 'date' } = {}) {
    let query = 'SELECT * FROM reporting_snapshots WHERE user_id = ?';
    const params = [userId];

    if (startDate) { query += ' AND snapshot_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND snapshot_date <= ?'; params.push(endDate); }
    if (platforms && platforms.length > 0) {
      query += ` AND platform IN (${platforms.map(() => '?').join(',')})`;
      params.push(...platforms);
    }

    if (groupBy === 'platform') {
      query = `
        SELECT 
          platform,
          SUM(impressions) as impressions,
          SUM(clicks) as clicks,
          SUM(spend) as spend,
          SUM(conversions) as conversions,
          SUM(revenue) as revenue,
          CASE WHEN SUM(impressions) > 0 THEN CAST(SUM(clicks) AS REAL) / SUM(impressions) * 100 ELSE 0 END as ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
          CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END as cpa,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas
        FROM reporting_snapshots
        WHERE user_id = ?
      `;
      if (startDate) query += ' AND snapshot_date >= ?';
      if (endDate) query += ' AND snapshot_date <= ?';
      if (platforms && platforms.length > 0) {
        query += ` AND platform IN (${platforms.map(() => '?').join(',')})`;
      }
      query += ' GROUP BY platform';
    } else {
      query += ' ORDER BY snapshot_date DESC';
    }

    return this.db.prepare(query).all(...params);
  }

  getTotals(userId, { startDate, endDate, platforms } = {}) {
    let query = `
      SELECT 
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(spend) as spend,
        SUM(conversions) as conversions,
        SUM(revenue) as revenue
      FROM reporting_snapshots
      WHERE user_id = ?
    `;
    const params = [userId];

    if (startDate) { query += ' AND snapshot_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND snapshot_date <= ?'; params.push(endDate); }
    if (platforms && platforms.length > 0) {
      query += ` AND platform IN (${platforms.map(() => '?').join(',')})`;
      params.push(...platforms);
    }

    const row = this.db.prepare(query).get(...params);
    if (!row) return null;

    return {
      ...row,
      ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
      cpc: row.clicks > 0 ? row.spend / row.clicks : 0,
      cpa: row.conversions > 0 ? row.spend / row.conversions : 0,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
    };
  }

  getTopCampaigns(userId, { startDate, endDate, limit = 10 } = {}) {
    let query = `
      SELECT 
        campaign_id,
        platform,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        SUM(spend) as spend,
        SUM(conversions) as conversions,
        SUM(revenue) as revenue
      FROM reporting_snapshots
      WHERE user_id = ? AND campaign_id IS NOT NULL
    `;
    const params = [userId];

    if (startDate) { query += ' AND snapshot_date >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND snapshot_date <= ?'; params.push(endDate); }

    query += ` GROUP BY campaign_id, platform ORDER BY spend DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }
}
