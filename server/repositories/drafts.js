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
        proposed_by TEXT DEFAULT 'ai',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_at TEXT,
        reviewed_by TEXT,
        rejection_reason TEXT,
        execution_result TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_status ON approval_drafts(status);
      CREATE INDEX IF NOT EXISTS idx_drafts_created ON approval_drafts(created_at);
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

  create({ type, summary, details, proposedBy = 'ai', campaignId, approvalRequestId = null }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO approval_drafts (id, type, summary, details_json, proposed_by, campaign_id, approval_request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, summary, details ? JSON.stringify(details) : null, proposedBy, campaignId || null, approvalRequestId || null);
    return this.findById(id);
  }

  approve(id, { reviewedBy, executionResult } = {}) {
    const stmt = this.db.prepare(`
      UPDATE approval_drafts
      SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ?,
          execution_result = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const result = stmt.run(reviewedBy || null, executionResult || null, id);
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

  count(status) {
    if (status) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM approval_drafts WHERE status = ?').get(status);
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM approval_drafts').get();
    return row.count;
  }
}
