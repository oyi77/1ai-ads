import { v4 as uuidv4 } from 'uuid';

export class PaymentsRepository {
  constructor(db) {
    this.db = db;
  }

  create({ userId, orderId, amount, currency, provider, providerRef, metadata }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO payments (id, user_id, order_id, amount, currency, provider, provider_ref, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, orderId || null, amount, currency || 'IDR', provider || 'payment', providerRef || null, JSON.stringify(metadata || {}));
    return this.findById(id);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  }

  findByUserId(userId, { limit } = {}) {
    let query = 'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC';
    const params = [userId];
    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    return this.db.prepare(query).all(...params);
  }

  findByOrderId(orderId) {
    return this.db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
  }

  updateStatus(id, status) {
    this.db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status, id);
    return this.findById(id);
  }

  updateMetadata(id, metadata) {
    this.db.prepare('UPDATE payments SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), id);
    return this.findById(id);
  }

  findPlanById(planId) {
    return this.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) || null;
  }
  getPaymentConfig(planName) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`payment_plan_${planName}`);
    return row ? JSON.parse(row.value) : null;
  }

  getAllPlans() {
    return this.db.prepare('SELECT * FROM plans ORDER BY tier').all();
  }

  findAll() {
    return this.db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all();
  }

  // API Keys
  createApiKey({ userId, name, keyHash, keyPrefix, scopes, rateLimitTier, expiresAt }) {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, rate_limit_tier, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, keyHash, keyPrefix, JSON.stringify(scopes || []), rateLimitTier || 'standard', expiresAt || null);
    return this.findApiKeyById(id);
  }

  findApiKeyById(id) {
    return this.db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  }

  findApiKeyByHash(keyHash) {
    return this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash);
  }

  findApiKeysByUserId(userId) {
    return this.db.prepare('SELECT * FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC').all(userId);
  }

  revokeApiKey(id, userId) {
    this.db.prepare('UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(id, userId);
    return this.findApiKeyById(id);
  }

  updateApiKeyLastUsed(id) {
    this.db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  }

  updateApiKey(id, userId, { name, scopes, rateLimitTier, expiresAt }) {
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (scopes !== undefined) { updates.push('scopes = ?'); params.push(JSON.stringify(scopes)); }
    if (rateLimitTier !== undefined) { updates.push('rate_limit_tier = ?'); params.push(rateLimitTier); }
    if (expiresAt !== undefined) { updates.push('expires_at = ?'); params.push(expiresAt); }
    if (updates.length === 0) return this.findApiKeyById(id);
    params.push(id, userId);
    this.db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    return this.findApiKeyById(id);
  }

  // Team Members
  addTeamMember(params) {
    const { teamOwnerId, userId, email, role, status, inviteToken, expiresAt } = params;
    this.db.prepare(`
      INSERT INTO team_members (id, team_owner_id, user_id, email, role, status, invite_token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), teamOwnerId, userId, email, role,
      status || 'pending', inviteToken || null, expiresAt || null
    );
    const row = inviteToken
      ? this.findTeamInviteByToken(inviteToken)
      : this.findTeamMember(teamOwnerId, userId);
    return row;
  }

  findTeamMember(teamOwnerId, userId) {
    return this.db.prepare('SELECT * FROM team_members WHERE team_owner_id = ? AND user_id = ?').get(teamOwnerId, userId);
  }

  findTeamInviteByToken(token) {
    return this.db.prepare('SELECT * FROM team_members WHERE invite_token = ?').get(token) || null;
  }

  findTeamMembershipByUserId(userId) {
    return this.db.prepare('SELECT * FROM team_members WHERE user_id = ?').all(userId);
  }

  findTeamMembersByOwner(teamOwnerId) {
    return this.db.prepare(
      `SELECT tm.*, u.username AS user_username
         FROM team_members tm
         LEFT JOIN users u ON u.id = tm.user_id
        WHERE tm.team_owner_id = ?
        ORDER BY tm.invited_at DESC`
    ).all(teamOwnerId);
  }

  // Case-insensitive: the invite UI and signup both normalise email, but a
  // stored "User@X.com" must not slip a second invite past the unique check.
  findTeamMemberByOwnerAndEmail(teamOwnerId, email) {
    return this.db.prepare(
      'SELECT * FROM team_members WHERE team_owner_id = ? AND lower(email) = lower(?)'
    ).get(teamOwnerId, email) || null;
  }

  // Scoped to a still-pending, unexpired row so a replayed or stale token is
  // rejected, and the token is cleared so an accepted link is single-use.
  acceptTeamInvite(inviteId, userId) {
    const res = this.db.prepare(`
      UPDATE team_members
         SET user_id = ?, status = 'active', accepted_at = CURRENT_TIMESTAMP, invite_token = NULL
       WHERE id = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `).run(userId, inviteId);
    if (res.changes === 0) return null;
    return this.db.prepare('SELECT * FROM team_members WHERE id = ?').get(inviteId);
  }

  updateTeamMemberRole(id, teamOwnerId, role) {
    const res = this.db.prepare(
      "UPDATE team_members SET role = ? WHERE id = ? AND team_owner_id = ? AND status != 'revoked'"
    ).run(role, id, teamOwnerId);
    if (res.changes === 0) return null;
    return this.db.prepare('SELECT * FROM team_members WHERE id = ?').get(id);
  }

  revokeTeamMember(id, teamOwnerId) {
    const res = this.db.prepare(`
      UPDATE team_members
         SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, invite_token = NULL
       WHERE id = ? AND team_owner_id = ? AND status != 'revoked'
    `).run(id, teamOwnerId);
    if (res.changes === 0) return null;
    return this.db.prepare('SELECT * FROM team_members WHERE id = ?').get(id);
  }

 
   // Usage meters (usage_meters table, migration 035)
   getCurrentPeriodMeters(userId) {
     return this.db.prepare(
       'SELECT * FROM usage_meters WHERE user_id = ? ORDER BY period_start DESC'
     ).all(userId);
   }
 
   getUsageMetersByUser(userId, start, end) {
     return this.db.prepare(
       'SELECT * FROM usage_meters WHERE user_id = ? AND period_start >= ? AND period_end <= ? ORDER BY period_start ASC'
     ).all(userId, start, end);
   }
 
   incrementUsageMeter(userId, meterKey, periodStart, periodEnd) {
     this.db.prepare(`
       INSERT INTO usage_meters (id, user_id, meter_key, period_start, period_end, count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, meter_key, period_start, period_end)
       DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP
     `).run(uuidv4(), userId, meterKey, periodStart, periodEnd);
     return this.db.prepare(
       'SELECT * FROM usage_meters WHERE user_id = ? AND meter_key = ? AND period_start = ?'
     ).get(userId, meterKey, periodStart);
   }
 
   // Milestones (milestones table, migration 035)
   getUnlockedMilestones(userId) {
     return this.db.prepare(
       'SELECT * FROM milestones WHERE user_id = ? ORDER BY achieved_at ASC'
     ).all(userId);
   }
 
   recordMilestone(userId, key, metadata = {}) {
     this.db.prepare(`
       INSERT OR IGNORE INTO milestones (id, user_id, milestone_key, metadata)
       VALUES (?, ?, ?, ?)
     `).run(uuidv4(), userId, key, typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
     return this.db.prepare(
       'SELECT * FROM milestones WHERE user_id = ? AND milestone_key = ?'
     ).get(userId, key);
   }
 }
