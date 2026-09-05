import { v4 as uuid } from 'uuid';

export class MonitoringRepository {
  constructor(db) {
    this.db = db;
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitoring_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        platform TEXT,
        campaign_id TEXT,
        message TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        is_read BOOLEAN DEFAULT 0,
        is_resolved BOOLEAN DEFAULT 0,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_user ON monitoring_alerts(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_type ON monitoring_alerts(alert_type, created_at);
      
      CREATE TABLE IF NOT EXISTS monitoring_rules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        metric TEXT NOT NULL,
        operator TEXT NOT NULL,
        threshold REAL NOT NULL,
        lookback_hours INTEGER DEFAULT 24,
        notification_channels TEXT DEFAULT '["telegram"]',
        is_active BOOLEAN DEFAULT 1,
        last_triggered DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_monitoring_rules_user ON monitoring_rules(user_id, is_active);
    `);
  }

  // Alerts
  createAlert(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO monitoring_alerts (id, user_id, alert_type, severity, platform, campaign_id, message, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.alertType, data.severity || 'info', data.platform || null, data.campaignId || null, data.message, JSON.stringify(data.details || {}));
    return id;
  }

  getAlerts(userId, { isRead, isResolved, limit = 50, offset = 0 } = {}) {
    let query = 'SELECT * FROM monitoring_alerts WHERE user_id = ?';
    const params = [userId];
    
    if (isRead !== undefined) { query += ' AND is_read = ?'; params.push(isRead ? 1 : 0); }
    if (isResolved !== undefined) { query += ' AND is_resolved = ?'; params.push(isResolved ? 1 : 0); }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    return this.db.prepare(query).all(...params);
  }

  markAsRead(id, userId) {
    return this.db.prepare('UPDATE monitoring_alerts SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  }

  resolve(id, userId) {
    return this.db.prepare('UPDATE monitoring_alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, userId);
  }

  getUnreadCount(userId) {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM monitoring_alerts WHERE user_id = ? AND is_read = 0').get(userId);
    return row?.count || 0;
  }

  // Monitoring rules
  findAllRules(userId, { isActive } = {}) {
    let query = 'SELECT * FROM monitoring_rules WHERE user_id = ?';
    const params = [userId];
    
    if (isActive !== undefined) { query += ' AND is_active = ?'; params.push(isActive ? 1 : 0); }
    
    query += ' ORDER BY created_at DESC';
    return this.db.prepare(query).all(...params);
  }

  findRuleById(id, userId) {
    return this.db.prepare('SELECT * FROM monitoring_rules WHERE id = ? AND user_id = ?').get(id, userId);
  }

  createRule(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT INTO monitoring_rules (id, user_id, name, metric, operator, threshold, lookback_hours, notification_channels, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.name, data.metric, data.operator, data.threshold, data.lookbackHours || 24, JSON.stringify(data.notificationChannels || ['telegram']), data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1);
    return this.findRuleById(id, data.userId);
  }

  updateRule(id, userId, data) {
    const fields = [];
    const values = [];
    
    if (data.name) { fields.push('name = ?'); values.push(data.name); }
    if (data.metric) { fields.push('metric = ?'); values.push(data.metric); }
    if (data.operator) { fields.push('operator = ?'); values.push(data.operator); }
    if (data.threshold !== undefined) { fields.push('threshold = ?'); values.push(data.threshold); }
    if (data.lookbackHours) { fields.push('lookback_hours = ?'); values.push(data.lookbackHours); }
    if (data.notificationChannels) { fields.push('notification_channels = ?'); values.push(JSON.stringify(data.notificationChannels)); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
    
    if (fields.length === 0) return this.findRuleById(id, userId);
    
    values.push(id, userId);
    this.db.prepare(`UPDATE monitoring_rules SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    return this.findRuleById(id, userId);
  }

  deleteRule(id, userId) {
    return this.db.prepare('DELETE FROM monitoring_rules WHERE id = ? AND user_id = ?').run(id, userId);
  }

  updateRuleTrigger(id) {
    this.db.prepare('UPDATE monitoring_rules SET last_triggered = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }
}
