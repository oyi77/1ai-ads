import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../lib/logger.js';

const log = createLogger('drafts-repo');

export class DraftsRepository {
  constructor(db, settingsRepo = null) {
    this.db = db;
    this.settingsRepo = settingsRepo;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_drafts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json TEXT,
        user_id TEXT,
        proposed_by TEXT DEFAULT 'ai',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_at TEXT,
        reviewed_by TEXT,
        rejection_reason TEXT,
        execution_result TEXT,
        campaign_id TEXT,
        approval_request_id TEXT,
        rule_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_status ON approval_drafts(status);
      CREATE INDEX IF NOT EXISTS idx_drafts_created ON approval_drafts(created_at);
      CREATE INDEX IF NOT EXISTS idx_drafts_user ON approval_drafts(user_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_campaign ON approval_drafts(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_request ON approval_drafts(approval_request_id);
    `);
    // Tabel legacy (pre-048, mis. hasil rebuild 030 di DB lama) belum punya
    // rule_id — tambahkan idempoten agar index di bawah tidak pecah.
    try {
      const cols = this.db.prepare('PRAGMA table_info(approval_drafts)').all().map((c) => c.name);
      if (!cols.includes('rule_id')) {
        this.db.exec('ALTER TABLE approval_drafts ADD COLUMN rule_id TEXT');
      }
      // Kolom pre-050 (visibilitas gagal + reminder) belum ada di DB lama.
      if (!cols.includes('last_error')) {
        this.db.exec('ALTER TABLE approval_drafts ADD COLUMN last_error TEXT');
      }
      if (!cols.includes('reminded_at')) {
        this.db.exec('ALTER TABLE approval_drafts ADD COLUMN reminded_at TEXT');
      }
    } catch { /* kolom sudah ada / race — index di bawah yang vonis */ }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_drafts_rule ON approval_drafts(rule_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_rule_status ON approval_drafts(rule_id, status);
    `);
    log.debug('approval_drafts table ready');
  }

  findAll({ status, campaignId, page = 1, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (campaignId) { where.push('campaign_id = ?'); params.push(campaignId); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM approval_drafts ${whereClause}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM approval_drafts ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM approval_drafts WHERE id = ?').get(id) || null;
  }
  findByUser(userId, { status, page = 1, limit = 50 } = {}) {
    const params = [userId];
    let where = 'user_id = ?';
    if (status) { where += ' AND status = ?'; params.push(status); }
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM approval_drafts WHERE ${where}`).get(...params).count;
    const offset = (page - 1) * limit;
    const data = this.db.prepare(
      `SELECT * FROM approval_drafts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return { data, total, page, limit };
  }

  create({ type, summary, details, proposedBy = 'ai', userId = null, campaignId, approvalRequestId = null, ruleId = null }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO approval_drafts (id, type, summary, details_json, user_id, proposed_by, campaign_id, approval_request_id, rule_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, summary, details ? JSON.stringify(details) : null, userId || null, proposedBy, campaignId || null, approvalRequestId || null, ruleId || null);
    return this.findById(id);
  }

  approve(id, { reviewedBy, executionResult } = {}) {
    // Receipts must stay readable: an object result would land in the TEXT
    // column as "[object Object]". Stringify non-strings; blank stays NULL.
    const receipt = executionResult === undefined || executionResult === null
      ? null
      : (typeof executionResult === 'string' ? executionResult.trim() : JSON.stringify(executionResult));
    const stmt = this.db.prepare(`
      UPDATE approval_drafts
      SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ?,
          execution_result = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(reviewedBy || null, receipt || null, id);
    if (result.changes === 0) return null;
    log.info('draft approved', { id, reviewedBy });
    return this.findById(id);
  }

  reject(id, { reviewedBy, rejectionReason } = {}) {
    const stmt = this.db.prepare(`
      UPDATE approval_drafts
      SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by = ?,
          rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(reviewedBy || null, rejectionReason || null, id);
    if (result.changes === 0) return null;
    log.info('draft rejected', { id, reviewedBy });
    return this.findById(id);
  }

  /** Catat sebab gagal eksekusi tanpa ubah status (tetap pending, retryable). */
  noteExecutionFailure(id, message) {
    this.db.prepare(
      "UPDATE approval_drafts SET last_error = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(String(message || '').slice(0, 500), id);
    return this.findById(id);
  }

  /** Draft pending lama yang belum diingatkan (buat cron reminder anti-spam). */
  findStalePending({ olderThanMinutes = 60, limit = 100 } = {}) {
    return this.db.prepare(
      `SELECT * FROM approval_drafts WHERE status = 'pending'
       AND datetime(created_at) <= datetime('now', '-' || ? || ' minutes')
       AND (reminded_at IS NULL OR datetime(reminded_at) <= datetime('now', '-' || ? || ' minutes'))
       ORDER BY created_at ASC LIMIT ?`
    ).all(olderThanMinutes, olderThanMinutes, limit);
  }

  markReminded(id) {
    this.db.prepare("UPDATE approval_drafts SET reminded_at = datetime('now') WHERE id = ?").run(id);
  }
  /** Riwayat draft satu rule (buat "terakhir match" + laporan kinerja). */
  findByRuleId(ruleId, { status = null, limit = 50 } = {}) {
    const where = ['rule_id = ?'];
    const params = [ruleId];
    if (status) { where.push('status = ?'); params.push(status); }
    const data = this.db.prepare(
      `SELECT * FROM approval_drafts WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit);
    return { data, total: data.length };
  }

  findPendingForRuleCampaign(ruleName, campaignId, ruleId = null) {
    // `_` dan `%` adalah wildcard LIKE; escape agar nama seperti "ROAS_Guard"
    // tidak match summary aturan lain.
    const escaped = String(ruleName ?? '').replace(/[\\%_]/g, (ch) => `\\${ch}`);
    // ruleId ada: exact match dulu; fallback summary HANYA untuk baris legacy
    // ber-rule_id NULL (tanpa ini, draft rule lain dengan nama mirip ikut ke-dedup).
    if (ruleId) {
      return this.db.prepare(
        "SELECT id FROM approval_drafts WHERE campaign_id = ? AND status = 'pending' AND (rule_id = ? OR (rule_id IS NULL AND (summary LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\'))) LIMIT 1"
      ).get(campaignId, ruleId, `%Rule ${escaped}%`, `%Aturan \"${escaped}\"%`) || null;
    }
    // Tanpa ruleId (legacy caller): cocokkan kedua format summary.
    // Format lama "Rule NAME:" vs baru 'Aturan "NAME":' — satu pola selalu miss.
    return this.db.prepare(
      "SELECT id FROM approval_drafts WHERE campaign_id = ? AND status = 'pending' AND (summary LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\') LIMIT 1"
    ).get(campaignId, `%Rule ${escaped}%`, `%Aturan \"${escaped}\"%`) || null;
  }
}
