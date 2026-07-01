/**
 * Cleanup Repository — Data access for cleanup operations.
 * Extracted from DataCleanup service (SRP: service handles scheduling, repo handles SQL).
 */
export class CleanupRepository {
  constructor(db) {
    this.db = db;
  }

  deleteProcessedWebhookEvents(olderThanDays = 30) {
    const cutoff = `-${olderThanDays} days`;
    return this.db.prepare(
      "DELETE FROM webhook_events WHERE processed = 1 AND created_at < datetime('now', ?)"
    ).run(cutoff).changes;
  }

  deleteExecutedSchedules(olderThanDays = 90) {
    const cutoff = `-${olderThanDays} days`;
    return this.db.prepare(
      "DELETE FROM schedules WHERE status = 'executed' AND updated_at < datetime('now', ?)"
    ).run(cutoff).changes;
  }

  deleteExpiredRefreshTokens() {
    return this.db.prepare(
      "DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"
    ).run().changes;
  }

  deleteOldPerformanceHistory(olderThanDays = 90) {
    const cutoff = `-${olderThanDays} days`;
    return this.db.prepare(
      "DELETE FROM performance_history WHERE snapshot_date < date('now', ?)"
    ).run(cutoff).changes;
  }
}
