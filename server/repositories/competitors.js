import { v4 as uuidv4 } from 'uuid';

export class CompetitorsRepository {
  constructor(db) {
    this.db = db;
  }

  create({ url, platform, adData, snapshotType }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO competitor_snapshots (id, url, platform, ad_data, snapshot_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, url, platform || null, JSON.stringify(adData || {}), snapshotType || 'auto');
    return this.findById(id);
  }

  findById(id) {
    const row = this.db.prepare('SELECT * FROM competitor_snapshots WHERE id = ?').get(id);
    if (row && row.ad_data) row.ad_data = JSON.parse(row.ad_data);
    return row;
  }

  findByUrl(url) {
    const rows = this.db.prepare('SELECT * FROM competitor_snapshots WHERE url = ? ORDER BY captured_at DESC').all(url);
    return rows.map(r => { if (r.ad_data) r.ad_data = JSON.parse(r.ad_data); return r; });
  }

  findAll() {
    const rows = this.db.prepare('SELECT * FROM competitor_snapshots ORDER BY captured_at DESC').all();
    return rows.map(r => { if (r.ad_data) r.ad_data = JSON.parse(r.ad_data); return r; });
  }

  findLatest() {
    const rows = this.db.prepare(`
      SELECT cs.* FROM competitor_snapshots cs
      INNER JOIN (
        SELECT url, MAX(captured_at) as max_date FROM competitor_snapshots GROUP BY url
      ) latest ON cs.url = latest.url AND cs.captured_at = latest.max_date
      ORDER BY cs.captured_at DESC
    `).all();
    return rows.map(r => { if (r.ad_data) r.ad_data = JSON.parse(r.ad_data); return r; });
  }

  remove(id) {
    return this.db.prepare('DELETE FROM competitor_snapshots WHERE id = ?').run(id);
  }

  removeByUrl(url) {
    return this.db.prepare('DELETE FROM competitor_snapshots WHERE url = ?').run(url);
  }
}
