import fs from 'fs';
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

    const backups = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.backup'))
      .sort()
      .reverse();

    for (const old of backups.slice(7)) {
      fs.unlinkSync(join(backupDir, old));
    }
  } catch (err) {
    log.error('Database backup failed', { error: err.message });
  }
}
