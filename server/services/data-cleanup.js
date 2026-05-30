import { createLogger } from '../lib/logger.js';

const log = createLogger('data-cleanup');

export class DataCleanup {
  constructor(db) {
    this.db = db;
    this._interval = null;
  }

  start(intervalMs = 7 * 24 * 60 * 60 * 1000) {
    log.info('DataCleanup started (runs weekly)');
    this._interval = setInterval(() => this.run(), intervalMs);
    setTimeout(() => this.run(), 60 * 1000);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  run() {
    try {
      const results = {};

      results.webhookEvents = this.db.prepare(
        "DELETE FROM webhook_events WHERE processed = 1 AND created_at < datetime('now', '-30 days')"
      ).run().changes;

      results.schedules = this.db.prepare(
        "DELETE FROM schedules WHERE status = 'executed' AND updated_at < datetime('now', '-90 days')"
      ).run().changes;

      results.refreshTokens = this.db.prepare(
        "DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"
      ).run().changes;

      const total = Object.values(results).reduce((sum, n) => sum + n, 0);
      if (total > 0) {
        log.info('Data cleanup completed', results);
      }
      return results;
    } catch (err) {
      log.error('Data cleanup failed', { error: err.message });
      return { error: err.message };
    }
  }
}
