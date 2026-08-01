import fs from 'fs';
import Database from 'better-sqlite3';
import { join } from 'path';
import { createLogger } from '../server/lib/logger.js';

const log = createLogger('backup');

export function backupDatabase(dbPath, rootDir) {
  try {
    const backupDir = join(rootDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = join(backupDir, `adforge.db.${timestamp}.backup`);

    fs.copyFileSync(dbPath, backupPath);
    log.info(`Database backed up to ${backupPath}`);

    // Integrity check on the backup
    try {
      const backupDb = new Database(backupPath, { readonly: true });
      const result = backupDb.pragma('integrity_check');
      backupDb.close();
      if (result[0]?.integrity_check !== 'ok') {
        log.error('Backup integrity check failed', { backupPath, result });
      } else {
        log.info('Backup integrity check passed', { backupPath });
      }
    } catch (checkErr) {
      log.error('Backup integrity check error', { backupPath, error: checkErr.message });
    }

    // Retention: keep the newest 7 backup timestamps, deleting the .backup
    // file AND its -shm/-wal sidecars for older timestamps. Grouping by
    // timestamp (instead of by .backup suffix) prevents sidecars from
    // accumulating forever.
    const KEEP = 7;
    const files = fs.readdirSync(backupDir);
    const byTimestamp = new Map();
    for (const f of files) {
      const m = f.match(/^adforge\.db\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(\.backup(-shm|-wal)?)?$/);
      if (!m) continue;
      if (!byTimestamp.has(m[1])) byTimestamp.set(m[1], []);
      byTimestamp.get(m[1]).push(f);
    }

    const oldTimestamps = [...byTimestamp.keys()].sort().reverse().slice(KEEP);
    for (const ts of oldTimestamps) {
      for (const f of byTimestamp.get(ts)) {
        fs.unlinkSync(join(backupDir, f));
      }
    }
  } catch (err) {
    log.error('Database backup failed', { error: err.message });
  }
}
