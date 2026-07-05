/**
 * BoostRecommendationsRepository — persists boost score records and approval state.
 * Table: boost_recommendations
 */
export class BoostRecommendationsRepository {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS boost_recommendations (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id              TEXT NOT NULL,
        page_id              TEXT NOT NULL,
        boost_score          REAL NOT NULL,
        suggested_budget_idr TEXT,
        suggested_duration_days INTEGER DEFAULT 3,
        target_audience_json TEXT,
        status               TEXT NOT NULL DEFAULT 'pending',
        reviewed_by          TEXT,
        reviewed_at          TEXT,
        ad_campaign_id       TEXT,
        created_at           TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  }

  /** Create a new recommendation. Returns the inserted row. */
  create({ post_id, page_id, boost_score, suggested_budget_idr, suggested_duration_days = 3, target_audience_json = null }) {
    const info = this.db.prepare(`
      INSERT INTO boost_recommendations
        (post_id, page_id, boost_score, suggested_budget_idr, suggested_duration_days, target_audience_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(post_id, page_id, boost_score, suggested_budget_idr ?? null, suggested_duration_days, target_audience_json);
    return this.findById(info.lastInsertRowid);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM boost_recommendations WHERE id = ?').get(id) ?? null;
  }

  /** List by status. Pass null to get all. */
  findByStatus(status = null, { limit = 50, offset = 0 } = {}) {
    if (status) {
      return this.db.prepare(
        'SELECT * FROM boost_recommendations WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(status, limit, offset);
    }
    return this.db.prepare(
      'SELECT * FROM boost_recommendations ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  /** Update status + optional reviewer + campaign id. */
  updateStatus(id, { status, reviewed_by = null, ad_campaign_id = null }) {
    const valid = ['pending', 'approved', 'rejected', 'boosted'];
    if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`);
    this.db.prepare(`
      UPDATE boost_recommendations
      SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), ad_campaign_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, reviewed_by, ad_campaign_id, id);
    return this.findById(id);
  }
}
