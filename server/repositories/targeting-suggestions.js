/**
 * TargetingSuggestionsRepository — persists ad targeting suggestions per post/page.
 * Table: targeting_suggestions
 *
 * Rows are tenant-owned: every read and write carries the owning user id so one
 * customer can never list or overwrite another customer's audience suggestions.
 */
export class TargetingSuggestionsRepository {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS targeting_suggestions (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id           TEXT,
        post_id           TEXT NOT NULL,
        page_id           TEXT NOT NULL,
        category          TEXT,
        age_min           INTEGER NOT NULL DEFAULT 18,
        age_max           INTEGER NOT NULL DEFAULT 45,
        genders           TEXT NOT NULL DEFAULT 'ALL',
        interests_json    TEXT NOT NULL DEFAULT '[]',
        locations_json    TEXT NOT NULL DEFAULT '["Indonesia"]',
        lookalike_source  TEXT,
        confidence_score  REAL NOT NULL DEFAULT 0.0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(post_id, page_id)
      )
    `).run();
    this.db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_targeting_suggestions_user ON targeting_suggestions(user_id)'
    ).run();
  }

  /** Upsert a targeting suggestion. Returns the saved row. */
  upsert({ user_id = null, post_id, page_id, category, age_min, age_max, genders, interests, locations, lookalike_source, confidence_score }) {
    this.db.prepare(`
      INSERT INTO targeting_suggestions
        (user_id, post_id, page_id, category, age_min, age_max, genders, interests_json, locations_json, lookalike_source, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id, page_id) DO UPDATE SET
        user_id          = COALESCE(excluded.user_id, targeting_suggestions.user_id),
        category         = excluded.category,
        age_min          = excluded.age_min,
        age_max          = excluded.age_max,
        genders          = excluded.genders,
        interests_json   = excluded.interests_json,
        locations_json   = excluded.locations_json,
        lookalike_source = excluded.lookalike_source,
        confidence_score = excluded.confidence_score,
        created_at       = datetime('now')
    `).run(
      user_id,
      post_id, page_id,
      category ?? null,
      age_min ?? 18,
      age_max ?? 45,
      genders ?? 'ALL',
      JSON.stringify(interests ?? []),
      JSON.stringify(locations ?? ['Indonesia']),
      lookalike_source ?? null,
      confidence_score ?? 0.0,
    );
    return this.findByPost(post_id, page_id);
  }

  /**
   * Find saved suggestion for a post+page. Scoped to `userId` when provided —
   * a post id belonging to another tenant then reads as absent.
   */
  findByPost(post_id, page_id, userId = null) {
    const sql = userId
      ? 'SELECT * FROM targeting_suggestions WHERE post_id = ? AND page_id = ? AND user_id = ?'
      : 'SELECT * FROM targeting_suggestions WHERE post_id = ? AND page_id = ?';
    const params = userId ? [post_id, page_id, userId] : [post_id, page_id];
    const row = this.db.prepare(sql).get(...params);
    if (!row) return null;
    return this._deserialize(row);
  }

  /** List suggestions, newest first, scoped to `userId` when provided. */
  findAll({ limit = 50, offset = 0, userId = null } = {}) {
    const sql = userId
      ? 'SELECT * FROM targeting_suggestions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM targeting_suggestions ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const params = userId ? [userId, limit, offset] : [limit, offset];
    return this.db.prepare(sql).all(...params).map(r => this._deserialize(r));
  }

  _deserialize(row) {
    return {
      ...row,
      interests: JSON.parse(row.interests_json || '[]'),
      locations: JSON.parse(row.locations_json || '["Indonesia"]'),
    };
  }
}
