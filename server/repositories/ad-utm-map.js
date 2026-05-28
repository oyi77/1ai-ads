import { v4 as uuidv4 } from 'uuid';

export class AdUtmMapRepository {
  constructor(db) {
    this.db = db;
  }

  create({ ad_id, campaign_id, destination_url, utm_params = {} }) {
    const id = uuidv4();
    const { source = 'meta', medium = 'paid', campaign, content } = utm_params;
    this.db.prepare(`
      INSERT OR REPLACE INTO ad_utm_map (id, ad_id, campaign_id, destination_url, utm_source, utm_medium, utm_campaign, utm_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ad_id, campaign_id, destination_url, source, medium, campaign || campaign_id, content || ad_id);
    return this.getByAdId(ad_id);
  }

  getByAdId(ad_id) {
    return this.db.prepare('SELECT * FROM ad_utm_map WHERE ad_id = ?').get(ad_id) || null;
  }

  incrementClicks(ad_id) {
    this.db.prepare('UPDATE ad_utm_map SET click_count = click_count + 1 WHERE ad_id = ?').run(ad_id);
    return this.getByAdId(ad_id);
  }
}
