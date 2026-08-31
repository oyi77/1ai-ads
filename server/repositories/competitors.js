import { v4 as uuidv4 } from 'uuid';

export class CompetitorsRepository {
  constructor(db) {
    this.db = db;
  }

  create({ url, platform, adData, snapshotType, userId }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO competitor_snapshots (id, url, platform, ad_data, snapshot_type, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, url, platform || null, JSON.stringify(adData || {}), snapshotType || 'auto', userId || null);
    return this.findById(id);
  }

  findById(id, userId) {
    const row = userId
      ? this.db.prepare('SELECT * FROM competitor_snapshots WHERE id = ? AND user_id = ?').get(id, userId)
      : this.db.prepare('SELECT * FROM competitor_snapshots WHERE id = ?').get(id);
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

  remove(id, userId) {
    if (userId) {
      return this.db.prepare('DELETE FROM competitor_snapshots WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
    }
    return this.db.prepare('DELETE FROM competitor_snapshots WHERE id = ?').run(id).changes > 0;
  }

  removeByUrl(url, userId) {
    if (userId) {
      return this.db.prepare('DELETE FROM competitor_snapshots WHERE url = ? AND user_id = ?').run(url, userId).changes > 0;
    }
    return this.db.prepare('DELETE FROM competitor_snapshots WHERE url = ?').run(url).changes > 0;
  }
}
