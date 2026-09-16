import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { isRuleDue, filterCampaignsForRule } from '../../../server/bot/scheduler/helpers.js';
import { CampaignsRepository } from '../../../server/repositories/campaigns.js';

function memDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE campaigns (
    id TEXT PRIMARY KEY, user_id TEXT, platform TEXT NOT NULL, campaign_id TEXT NOT NULL,
    name TEXT, status TEXT, budget REAL, spend REAL, revenue REAL,
    impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
    roas REAL, last_synced DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, campaign_id))`);
  return db;
}

describe('rule-guard scope + interval', () => {
  it('isRuleDue: interval 60 dilewati kalau baru dievaluasi', () => {
    const now = Date.now();
    expect(isRuleDue({ intervalMinutes: 60, lastEvaluatedAt: new Date(now - 5 * 60000).toISOString() }, now)).toBe(false);
    expect(isRuleDue({ intervalMinutes: 60, lastEvaluatedAt: new Date(now - 61 * 60000).toISOString() }, now)).toBe(true);
    expect(isRuleDue({ intervalMinutes: 60 }, now)).toBe(true);
    expect(isRuleDue({ intervalMinutes: 0 }, now)).toBe(true);
  });

  it('filterCampaignsForRule: hanya akun rule + legacy NULL ikut', () => {
    const camps = [
      { id: 'a', account_id: 'act_A' },
      { id: 'b', account_id: 'act_B' },
      { id: 'c', account_id: null },
    ];
    const out = filterCampaignsForRule(camps, { accountId: 'act_A' }).map(c => c.id).sort();
    expect(out).toEqual(['a', 'c']);
  });

  it('filterCampaignsForRule: toleran prefix act_', () => {
    const camps = [{ id: 'a', account_id: 'act_123' }];
    expect(filterCampaignsForRule(camps, { accountId: '123' }).length).toBe(1);
    expect(filterCampaignsForRule(camps, { accountId: 'act_123' }).length).toBe(1);
    expect(filterCampaignsForRule(camps, { accountId: 'act_999' }).length).toBe(0);
  });

  it('filterCampaignsForRule: tanpa accountId = semua', () => {
    const camps = [{ id: 'a', account_id: 'x' }, { id: 'b', account_id: null }];
    expect(filterCampaignsForRule(camps, {}).length).toBe(2);
  });

  it('upsert simpan account_id, sync tanpa akun tidak menimpa', () => {
    const db = memDb();
    const repo = new CampaignsRepository(db);
    const id = repo.upsert({ platform: 'meta', campaign_id: 'x1', account_id: 'act_A', name: 'W', status: 'active', userId: 'u1' });
    expect(db.prepare('SELECT account_id FROM campaigns WHERE id=?').get(id).account_id).toBe('act_A');
    repo.upsert({ platform: 'meta', campaign_id: 'x1', name: 'W', status: 'active', userId: 'u1' });
    expect(db.prepare('SELECT account_id FROM campaigns WHERE id=?').get(id).account_id).toBe('act_A');
    db.close();
  });
});
