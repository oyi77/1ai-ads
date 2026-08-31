/**
 * Content Scheduler Queue Repository
 *
 * Handles all DB operations for the content_queue table used by ContentScheduler.
 * Extracted from content-scheduler.js to follow the repository pattern (DIP).
 */

const CONTENT_QUEUE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS content_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    page_id TEXT,
    platform TEXT,
    file_path TEXT,
    caption TEXT DEFAULT '',
    hashtags TEXT DEFAULT '[]',
    hook TEXT DEFAULT '',
    cta TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    scheduled_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    category TEXT DEFAULT '',
    style TEXT DEFAULT '',
    product_desc TEXT DEFAULT '',
    video_id TEXT,
    permalink_url TEXT,
    posted_at INTEGER,
    error TEXT,
    updated_at INTEGER
  )
`;

export class ContentSchedulerQueueRepository {
  constructor(db) {
    this.db = db;
    this._createTable();
  }

  _createTable() {
    this.db.exec(CONTENT_QUEUE_SCHEMA);
  }

  insert(item) {
    const stmt = this.db.prepare(`
      INSERT INTO content_queue (id, user_id, page_id, platform, file_path, caption, hashtags, hook, cta, status, scheduled_at, created_at, category, style, product_desc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      item.id, item.pageId, item.platform, item.filePath,
      item.caption || '', JSON.stringify(item.hashtags || []),
      item.hook || '', item.cta || '', item.status,
      item.scheduledAt, item.createdAt,
      item.category || '', item.style || '', item.productDesc || '',
    );
    return item.id;
  }

  findPendingByPage(pageId, now, userId) {
    if (userId) {
      return this.db.prepare(
        'SELECT * FROM content_queue WHERE user_id = ? AND page_id = ? AND status = ? AND scheduled_at <= ? ORDER BY created_at ASC'
      ).all(userId, pageId, 'pending', now);
    }
    return this.db.prepare(
      'SELECT * FROM content_queue WHERE page_id = ? AND status = ? AND scheduled_at <= ? ORDER BY created_at ASC'
    ).all(pageId, 'pending', now);
  }

  findPendingAll(now) {
    return this.db.prepare(
      'SELECT * FROM content_queue WHERE status = ? AND scheduled_at <= ? ORDER BY created_at ASC'
    ).all('pending', now);
  }

  updateCompleted(id, { caption, hashtags, videoId, permalinkUrl, postedAt }) {
    this.db.prepare(`
      UPDATE content_queue SET status = ?, caption = ?, hashtags = ?, video_id = ?, permalink_url = ?, posted_at = ?, error = NULL, updated_at = ?
      WHERE id = ?
    `).run('completed', caption, JSON.stringify(hashtags), videoId, permalinkUrl, postedAt, postedAt, id);
  }

  updateFailed(id, errorMsg, updatedAt) {
    this.db.prepare(`
      UPDATE content_queue SET status = ?, error = ?, updated_at = ? WHERE id = ?
    `).run('failed', errorMsg, updatedAt, id);
  }

  updateStatus(id, status, updatedAt) {
    this.db.prepare(
      'UPDATE content_queue SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, updatedAt, id);
  }

  getStatusCounts() {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM content_queue').get().c;
    const pending = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'pending'").get().c;
    const generating = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'generating_caption'").get().c;
    const uploading = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'uploading'").get().c;
    const completed = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'completed'").get().c;
    const failed = this.db.prepare("SELECT COUNT(*) as c FROM content_queue WHERE status = 'failed'").get().c;
    return { total, pending, generating, uploading, completed, failed };
  }

  findByStatus(status, limit, userId) {
    if (userId && status) {
      return this.db.prepare('SELECT * FROM content_queue WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?').all(userId, status, limit);
    }
    if (userId) {
      return this.db.prepare('SELECT * FROM content_queue WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
    }
    if (status) {
      return this.db.prepare('SELECT * FROM content_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
    }
    return this.db.prepare('SELECT * FROM content_queue ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  findById(id, userId) {
    if (userId) {
      return this.db.prepare('SELECT * FROM content_queue WHERE id = ? AND user_id = ?').get(id, userId);
    }
    return this.db.prepare('SELECT * FROM content_queue WHERE id = ?').get(id);
  }

  cancelById(id, updatedAt, userId) {
    if (userId) {
      this.db.prepare('UPDATE content_queue SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run('cancelled', updatedAt, id, userId);
      return;
    }
    this.db.prepare('UPDATE content_queue SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', updatedAt, id);
  }
}