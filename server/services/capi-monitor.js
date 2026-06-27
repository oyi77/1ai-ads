import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('capi-monitor');

export class CapiMonitor {
  /**
   * @param {Object} metaApi - MetaAdsAPI instance
   * @param {Object} db - better-sqlite3 database instance
   */
  constructor(metaApi, db) {
    this.meta = metaApi;
    this.db = db;
    this._interval = null;
    this._ensureTable();
  }

  // ── Schema Bootstrap ─────────────────────────────────────────

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capi_health (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        status TEXT DEFAULT 'unknown',
        match_rate REAL,
        deduplication_rate REAL,
        event_count INTEGER DEFAULT 0,
        errors TEXT DEFAULT '[]',
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_capi_health_account ON capi_health(account_id, checked_at);
    `);
  }

  // ── Health Check ─────────────────────────────────────────────

  /**
   * Check Conversions API health for an account.
   * @param {string} accountId
   * @returns {Promise<Object>}
   */
  async checkHealth(accountId) {
    if (!accountId) throw new Error('accountId is required');

    log.info('checkHealth', { accountId });

    let status = 'unknown';
    const matchRate = null;
    const deduplicationRate = null;
    let eventCount = 0;
    const errors = [];

    try {
      // Try Meta CAPI diagnostics endpoint
      const diagnostics = await this.meta.apiGet(`/${accountId}/events`, {
        fields: 'event_stats,event_value',
        access_token: this.meta._getToken?.() || '',
      });

      if (diagnostics?.data) {
        eventCount = diagnostics.data.length || 0;
      }
    } catch (err) {
      log.debug('checkHealth: events endpoint unavailable', { error: err.message });
    }

    try {
      // Try dataset/CAPI health endpoint (requires Marketing API)
      const datasetInfo = await this.meta.apiGet(`/${accountId}`, {
        fields: 'pixel_id,capi_enabled',
      });

      if (datasetInfo?.capi_enabled) {
        status = 'active';
      }
    } catch {
      // Endpoint may not be available
    }

    // Fallback: check recent conversion events via campaign insights
    try {
      const insights = await this.meta.getAccountInsights(accountId, { datePreset: 'last_7d' });
      if (insights?.conversions > 0) {
        status = status === 'unknown' ? 'likely_active' : status;
        eventCount = eventCount || insights.conversions;
      }
    } catch {
      // Not critical
    }

    // Determine overall status
    if (status === 'unknown') {
      status = eventCount > 0 ? 'likely_active' : 'no_data';
    }

    const record = {
      id: crypto.randomUUID(),
      accountId,
      status,
      matchRate,
      deduplicationRate,
      eventCount,
      errors,
      checkedAt: new Date().toISOString(),
    };

    // Persist snapshot
    try {
      this.db.prepare(`
        INSERT INTO capi_health (id, account_id, status, match_rate, deduplication_rate, event_count, errors, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(record.id, accountId, status, matchRate, deduplicationRate, eventCount, JSON.stringify(errors));
    } catch (err) {
      log.warn('checkHealth: snapshot save failed', { error: err.message });
    }

    return {
      accountId,
      status,
      matchRate,
      deduplicationRate,
      eventCount,
      errors,
      checkedAt: record.checkedAt,
    };
  }

  /**
   * Get historical health snapshots for an account.
   * @param {string} accountId
   * @param {number} days
   * @returns {Array}
   */
  getHealthHistory(accountId, days = 30) {
    return this.db.prepare(`
      SELECT * FROM capi_health
      WHERE account_id = ?
        AND checked_at >= DATE('now', '-${days} days')
      ORDER BY checked_at DESC
    `).all(accountId);
  }

  // ── Periodic Monitoring ──────────────────────────────────────

  /**
   * Start periodic health monitoring (every 6 hours).
   * @param {Function} getAccountIds - async () => string[] of account IDs to monitor
   */
  start(getAccountIds) {
    if (this._interval) return;

    log.info('Starting CAPI health monitor (6h interval)');

    // Run once on start
    this._checkAll(getAccountIds).catch(err =>
      log.error('start: initial check failed', { error: err.message })
    );

    // Every 6 hours
    this._interval = setInterval(() => {
      this._checkAll(getAccountIds).catch(err =>
        log.error('periodic check failed', { error: err.message })
      );
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Stop periodic monitoring.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      log.info('CAPI health monitor stopped');
    }
  }

  /**
   * Run health check on all accounts.
   * @param {Function} getAccountIds
   */
  async _checkAll(getAccountIds) {
    let accountIds;
    try {
      accountIds = await getAccountIds();
    } catch (err) {
      log.error('_checkAll: failed to get account IDs', { error: err.message });
      return;
    }

    if (!accountIds?.length) {
      log.debug('_checkAll: no accounts to check');
      return;
    }

    log.info('_checkAll: checking accounts', { count: accountIds.length });

    for (const accountId of accountIds) {
      try {
        const health = await this.checkHealth(accountId);
        if (health.status === 'no_data' && health.eventCount === 0) {
          log.warn('CAPI health alert: no events detected', { accountId });
        }
      } catch (err) {
        log.error('_checkAll: account check failed', { accountId, error: err.message });
      }
    }
  }
}
