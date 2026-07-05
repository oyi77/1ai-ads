/**
 * TargetingSuggestionsRepository — persists ad targeting suggestions per post/page.
 * Table: targeting_suggestions
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
  }

  /** Upsert a targeting suggestion. Returns the saved row. */
  upsert({ post_id, page_id, category, age_min, age_max, genders, interests, locations, lookalike_source, confidence_score }) {
    this.db.prepare(`
      INSERT INTO targeting_suggestions
        (post_id, page_id, category, age_min, age_max, genders, interests_json, locations_json, lookalike_source, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id, page_id) DO UPDATE SET
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

  /** Find saved suggestion for a post+page. Returns null if absent. */
  findByPost(post_id, page_id) {
    const row = this.db.prepare(
      'SELECT * FROM targeting_suggestions WHERE post_id = ? AND page_id = ?'
    ).get(post_id, page_id);
    if (!row) return null;
    return this._deserialize(row);
  }

  /** List all suggestions, newest first. */
  findAll({ limit = 50, offset = 0 } = {}) {
    return this.db.prepare(
      'SELECT * FROM targeting_suggestions ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset).map(r => this._deserialize(r));
  }

  _deserialize(row) {
    return {
      ...row,
      interests: JSON.parse(row.interests_json || '[]'),
      locations: JSON.parse(row.locations_json || '["Indonesia"]'),
    };
  }
}
