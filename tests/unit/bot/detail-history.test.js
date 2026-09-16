import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

// Riwayat rule + laporan kinerja + migrasi rule_id.

const { DraftsRepository } = await import('../../../server/repositories/drafts.js');
const { ruleHistory } = await import('../../../server/bot/commands/monitor.js');

function memDb() {
  const db = new Database(':memory:');
  return db;
}

function seedDraft(db, over = {}) {
  const id = over.id || `d-${Math.random().toString(36).slice(2, 9)}`;
  db.prepare(
    `INSERT INTO approval_drafts (id, type, summary, details_json, user_id, proposed_by, status, campaign_id, rule_id, created_at)
     VALUES (?, 'rule_pause', ?, ?, 'u1', 'ai', ?, 'c1', ?, datetime('now'))`
  ).run(
    id,
    over.summary || 'Aturan "R1": Belanja lebih dari Rp 10.000 → dimatiin di Promo',
    over.details_json || JSON.stringify({ action: { type: 'pause' }, campaign: { name: 'Promo' } }),
    over.status || 'pending',
    over.rule_id !== undefined ? over.rule_id : 'r1',
  );
  return id;
}

describe('migrasi 048 + repo rule_id', () => {
  it('file 048 tambah kolom + index di tabel lama', () => {
    const db = memDb();
    db.exec(`CREATE TABLE approval_drafts (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, summary TEXT NOT NULL,
      details_json TEXT, user_id TEXT, proposed_by TEXT DEFAULT 'ai',
      status TEXT DEFAULT 'pending', reviewed_at TEXT, reviewed_by TEXT,
      rejection_reason TEXT, execution_result TEXT, campaign_id TEXT,
      approval_request_id TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    )`);
    const sql = readFileSync('db/migrations/048_drafts_rule_id.sql', 'utf8');
    db.exec(sql);
    const cols = db.prepare('PRAGMA table_info(approval_drafts)').all().map((c) => c.name);
    expect(cols).toContain('rule_id');
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_drafts_rule'").get();
    expect(idx).toBeTruthy();
    db.close();
  });

  it('create simpan ruleId + findByRuleId baca balik', () => {
    const db = memDb();
    const repo = new DraftsRepository(db);
    const d = repo.create({ type: 'rule_pause', summary: 's', userId: 'u1', ruleId: 'r9' });
    expect(d.rule_id).toBe('r9');
    const found = repo.findByRuleId('r9');
    expect(found.data).toHaveLength(1);
    expect(repo.findByRuleId('nope').data).toHaveLength(0);
    db.close();
  });
});

describe('ruleHistory — dari rule_id dan summary lama', () => {
  it('hitung total/approved/rejected/pending + terakhir', () => {
    const db = memDb();
    new DraftsRepository(db);
    seedDraft(db, { id: 'a1', status: 'approved', rule_id: 'r1' });
    seedDraft(db, { id: 'a2', status: 'rejected', rule_id: 'r1' });
    seedDraft(db, { id: 'a3', status: 'pending', rule_id: 'r1' });
    seedDraft(db, { id: 'b1', status: 'approved', rule_id: 'r2' });
    const repo = new DraftsRepository(db);
    const h = ruleHistory(repo, 'u1', { id: 'r1', name: 'R1' });
    expect(h.total).toBe(3);
    expect(h.approved).toBe(1);
    expect(h.rejected).toBe(1);
    expect(h.pending).toBe(1);
    expect(h.last.campaign).toBe('Promo');
    expect(h.last.action).toBe('dimatiin');
    db.close();
  });

  it('fallback parse summary lama tanpa rule_id', () => {
    const db = memDb();
    new DraftsRepository(db);
    seedDraft(db, { id: 'a1', status: 'approved', rule_id: null, summary: 'Rule SpendGuard: spend > 10 → pause on Promo' });
    const repo = new DraftsRepository(db);
    const h = ruleHistory(repo, 'u1', { id: 'rX', name: 'SpendGuard' });
    expect(h.total).toBe(1);
    db.close();
  });

  it('rule tanpa riwayat: total 0, last null', () => {
    const db = memDb();
    const repo = new DraftsRepository(db);
    const h = ruleHistory(repo, 'u1', { id: 'rZ', name: 'Baru' });
    expect(h.total).toBe(0);
    expect(h.last).toBeNull();
    db.close();
  });
});
