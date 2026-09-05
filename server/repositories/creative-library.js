import { v4 as uuid } from 'uuid';

export class CreativeLibraryRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS creative_library (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'image',
        file_url TEXT,
        thumbnail_url TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        duration INTEGER,
        mime_type TEXT,
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_creative_library_user ON creative_library(user_id);
      CREATE INDEX IF NOT EXISTS idx_creative_library_type ON creative_library(type);
      
      CREATE TABLE IF NOT EXISTS creative_campaigns (
        id TEXT PRIMARY KEY,
        creative_id TEXT NOT NULL,
        campaign_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creative_id) REFERENCES creative_library(id) ON DELETE CASCADE,
        UNIQUE(creative_id, campaign_id, platform)
      );
      CREATE INDEX IF NOT EXISTS idx_creative_campaigns_creative ON creative_campaigns(creative_id);
      CREATE INDEX IF NOT EXISTS idx_creative_campaigns_campaign ON creative_campaigns(campaign_id);
    `);
  }

  list({ userId, type, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM creative_library WHERE user_id = ?';
    const params = [userId];
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const data = this.db.prepare(query).all(...params);
    const total = this.db.prepare('SELECT COUNT(*) as count FROM creative_library WHERE user_id = ?' + (type ? ' AND type = ?' : '')).get(...([userId, ...(type ? [type] : [])]));
    
    return { 
      data: (data || []).map(item => ({
        ...item,
        tags: typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : (item.tags || []),
        metadata: typeof item.metadata === 'string' ? JSON.parse(item.metadata || '{}') : (item.metadata || {}),
      })), 
      total: total?.count || 0, 
      page: Math.floor(offset / limit) + 1, 
      limit 
    };
  }

  findAll(userId, { type, limit = 50, offset = 0 } = {}) {
    return this.list({ userId, type, limit, offset });
  }

  findById(id, userId) {
    return this.db.prepare('SELECT * FROM creative_library WHERE id = ? AND user_id = ?').get(id, userId);
  }

  create(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO creative_library (id, user_id, name, type, file_url, thumbnail_url, file_size, width, height, duration, mime_type, tags, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.name, data.type || 'image', data.fileUrl || '', data.thumbnailUrl || null,
      data.fileSize || null, data.width || null, data.height || null, data.duration || null,
      data.mimeType || null, JSON.stringify(data.tags || []), JSON.stringify(data.metadata || {})
    );
    return this.findById(id, data.userId);
  }

  update(id, userId, data) {
    const fields = [];
    const values = [];
    
    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.thumbnailUrl) { fields.push('thumbnail_url = ?'); values.push(data.thumbnailUrl); }
    if (data.tags) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)); }
    if (data.metadata) { fields.push('metadata = ?'); values.push(JSON.stringify(data.metadata)); }
    
    if (fields.length === 0) return this.findById(id, userId);
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);
    
    this.db.prepare(`UPDATE creative_library SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return this.findById(id, userId);
  }

  delete(id, userId) {
    return this.db.prepare('DELETE FROM creative_library WHERE id = ? AND user_id = ?').run(id, userId);
  }

  incrementUsage(id) {
    this.db.prepare('UPDATE creative_library SET usage_count = usage_count + 1 WHERE id = ?').run(id);
  }

  getTopPerformers({ userId, limit = 10 } = {}) {
    return this.db.prepare('SELECT * FROM creative_library WHERE user_id = ? ORDER BY usage_count DESC LIMIT ?').all(userId, limit);
  }

  attachToCampaign(creativeId, campaignId, platform) {
    const id = uuid();
    this.db.prepare(`
      INSERT OR REPLACE INTO creative_campaigns (id, creative_id, campaign_id, platform)
      VALUES (?, ?, ?, ?)
    `).run(id, creativeId, campaignId, platform);
    this.incrementUsage(creativeId);
    return { id, creativeId, campaignId, platform };
  }

  getCampaignCreatives(campaignId, platform) {
    return this.db.prepare(`
      SELECT cl.* FROM creative_library cl
      JOIN creative_campaigns cc ON cl.id = cc.creative_id
      WHERE cc.campaign_id = ? AND cc.platform = ?
    `).all(campaignId, platform);
  }
}
