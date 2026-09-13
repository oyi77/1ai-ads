/**
 * Bot Scheduler job — db-backup.
 *
 * Extracted verbatim from ../scheduler.js. Registered via setupDbBackup(bot, deps).
 */
import cron from 'node-cron';
import config from '../../../config/index.js';
import { backupDatabase } from '../../../../db/backup.js';
import { log } from '../helpers.js';

/**
 * Register the db-backup cron job.
 * @param { telegram: object } bot — Telegram bot instance
 * @param { repos: object, services: object } deps
 */
export function setupDbBackup(bot, deps) {
  // ────────────────────────────────────────────────────────────
  // 11. Database Backup — every 6 hours
  // ────────────────────────────────────────────────────────────
  cron.schedule('0 */6 * * *', () => {
    log.info('Running database backup job');
    try {
      backupDatabase(config.dbPath, process.cwd());
    } catch (err) {
      log.error('Backup cron job failed', { error: err.message });
    }
  });
}
