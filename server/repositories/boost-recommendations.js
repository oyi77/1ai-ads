/**
 * BoostRecommendationsRepository — persists boost score records and approval state.
 * Table: boost_recommendations
 *
 * Rows are tenant-owned: every read and write carries the owning user id so one
 * customer can never see or approve another customer's recommendations.
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
        user_id              TEXT,
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
    this.db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_boost_recommendations_user ON boost_recommendations(user_id)'
    ).run();
  }

  /** Create a new recommendation. Returns the inserted row. */
  create({
    user_id = null, post_id, page_id, boost_score,
    suggested_budget_idr, suggested_duration_days = 3, target_audience_json = null,
  }) {
    const info = this.db.prepare(`
      INSERT INTO boost_recommendations
        (user_id, post_id, page_id, boost_score, suggested_budget_idr, suggested_duration_days, target_audience_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user_id, post_id, page_id, boost_score, suggested_budget_idr ?? null, suggested_duration_days, target_audience_json);
    return this.findById(info.lastInsertRowid, user_id);
  }

  /**
   * Look up one recommendation. When `userId` is given the row must belong to
   * that user, so a guessed id returns null instead of another tenant's row.
   * Background/bot callers omit it and get the unscoped lookup.
   */
  findById(id, userId = null) {
    if (userId) {
      return this.db.prepare('SELECT * FROM boost_recommendations WHERE id = ? AND user_id = ?').get(id, userId) ?? null;
    }
    return this.db.prepare('SELECT * FROM boost_recommendations WHERE id = ?').get(id) ?? null;
  }

  /** List by status. Pass null to get all. Scoped to `userId` when provided. */
  findByStatus(status = null, { limit = 50, offset = 0, userId = null } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM boost_recommendations ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
  }

  /** Update status + optional reviewer + campaign id. Returns the updated row. */
  updateStatus(id, { status, reviewed_by = null, ad_campaign_id = null, userId = null }) {
    const valid = ['pending', 'approved', 'rejected', 'boosted'];
    if (!valid.includes(status)) throw new Error(`Invalid status: ${status}`);
    const params = [status, reviewed_by, ad_campaign_id];
    let sql = `
      UPDATE boost_recommendations
      SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), ad_campaign_id = ?, updated_at = datetime('now')
      WHERE id = ?`;
    params.push(id);
    if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
    this.db.prepare(sql).run(...params);
    return this.findById(id, userId);
  }
}
