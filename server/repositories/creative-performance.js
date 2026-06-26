import { v4 as uuid } from 'uuid';

export class CreativePerformanceRepository {
  constructor(db) {
    this.db = db;
  }

  upsert(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO creative_performance (id, ad_id, campaign_id, platform, snapshot_date, impressions, clicks, spend, conversions, ctr, cpc, frequency, reach, hook, body, image_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ad_id, snapshot_date) DO UPDATE SET
        impressions = excluded.impressions,
        clicks = excluded.clicks,
        spend = excluded.spend,
        conversions = excluded.conversions,
        ctr = excluded.ctr,
        cpc = excluded.cpc,
        frequency = excluded.frequency,
        reach = excluded.reach,
        hook = excluded.hook,
        body = excluded.body,
        image_hash = excluded.image_hash
    `).run(
      id,
      data.adId,
      data.campaignId,
      data.platform,
      data.snapshotDate,
      data.impressions ?? 0,
      data.clicks ?? 0,
      data.spend ?? 0,
      data.conversions ?? 0,
      data.ctr ?? null,
      data.cpc ?? null,
      data.frequency ?? null,
      data.reach ?? 0,
      data.hook ?? null,
      data.body ?? null,
      data.imageHash ?? null
    );
    return id;
  }

  getByAd(adId, lookbackDays = 7) {
    return this.db.prepare(`
      SELECT * FROM creative_performance
      WHERE ad_id = ? AND snapshot_date >= date('now', ?)
      ORDER BY snapshot_date DESC
    `).all(adId, `-${lookbackDays} days`);
  }

  getByCampaign(campaignId, lookbackDays = 7) {
    return this.db.prepare(`
      SELECT * FROM creative_performance
      WHERE campaign_id = ? AND snapshot_date >= date('now', ?)
      ORDER BY snapshot_date DESC
    `).all(campaignId, `-${lookbackDays} days`);
  }
}
