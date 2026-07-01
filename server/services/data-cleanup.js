import config from '../config/index.js';
import { CleanupRepository } from '../repositories/cleanup.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('data-cleanup');

export class DataCleanup {
  constructor(db, cleanupRepo = undefined) {
    this.cleanupRepo = cleanupRepo || new CleanupRepository(db);
    this._interval = null;
  }

  start(intervalMs = 7 * 24 * 60 * 60 * 1000) {
    log.info('DataCleanup started (runs weekly)');
    this._interval = setInterval(() => this.run(), intervalMs);
    setTimeout(() => this.run(), config.intervals.cleanupInitialDelay);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  run() {
    try {
      const results = {
        webhookEvents: this.cleanupRepo.deleteProcessedWebhookEvents(30),
        schedules: this.cleanupRepo.deleteExecutedSchedules(90),
        refreshTokens: this.cleanupRepo.deleteExpiredRefreshTokens(),
        performanceHistory: this.cleanupRepo.deleteOldPerformanceHistory(90),
      };

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
