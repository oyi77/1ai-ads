import { describe, it, expect } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { runMigrations } from '../../../db/migrations/index.js';
import { DraftsRepository } from '../../../server/repositories/drafts.js';

function fkCount(db) {
  return db.prepare('PRAGMA foreign_key_list(approval_drafts)').all().length;
}

describe('approval_drafts campaign_id FK removal (migration 030)', () => {
  it('rebuilds a legacy table carrying the 016 FK and accepts unknown campaign ids', () => {
    // Simulate a pre-030 production DB: full baseline, but approval_drafts
    // carries the FK added by 016_approvals.sql (plus user_id from 028) and
    // 030 is not yet applied.
    const db = createDatabase(':memory:');
    db.exec(`
      DROP TABLE approval_drafts;
      CREATE TABLE approval_drafts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json TEXT,
        proposed_by TEXT DEFAULT 'ai',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        reviewed_at TEXT,
        reviewed_by TEXT,
        approval_request_id TEXT,
        rejection_reason TEXT,
        execution_result TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id TEXT
      );
    `);
    db.prepare("DELETE FROM _migrations WHERE name = '030_drafts_drop_campaign_fk.sql'").run();

    expect(fkCount(db)).toBe(1); // legacy state has the FK

    runMigrations(db); // applies 030 rebuild

    expect(fkCount(db)).toBe(0);
    const repo = new DraftsRepository(db);
    const draft = repo.create({
      type: 'ai_optimize',
      summary: 'AI menyarankan pause untuk Kampanye Live',
      details: { action: { type: 'pause' }, campaign: { id: '120249618208040530', name: 'Live Meta Campaign' } },
      proposedBy: 'ai',
      userId: null,
      campaignId: '120249618208040530', // NOT in local campaigns table
    });
    expect(draft.id).toBeTruthy();
    expect(draft.campaign_id).toBe('120249618208040530');
    db.close();
  });

  it('fresh databases never get the FK', () => {
    const db = createDatabase(':memory:');
    expect(fkCount(db)).toBe(0);
    db.close();
  });
});
