import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { DraftsRepository } from '../../../server/repositories/drafts.js';
import { DraftService, hintForExecutionError } from '../../../server/services/draft-service.js';

function memDb() {
  const db = new Database(':memory:');
  return { db, drafts: new DraftsRepository(db) };
}

describe('hintForExecutionError — saran aksi per pola error', () => {
  it('token mati → hubungkan ulang', () => {
    expect(hintForExecutionError('Session has expired, code 190')).toContain('hubungkan ulang');
    expect(hintForExecutionError('Invalid OAuth access token')).toContain('kedaluwarsa');
  });
  it('izin kurang → minta izin', () => {
    expect(hintForExecutionError('missing permissions (#10)')).toContain('izin');
  });
  it('campaign hilang → sync', () => {
    expect(hintForExecutionError('campaign does not exist')).toContain('sync');
  });
  it('rate-limit → tunggu', () => {
    expect(hintForExecutionError('429 throttled')).toContain('10 menit');
  });
  it('tak dikenal → fallback umum', () => {
    expect(hintForExecutionError('weird blah')).toContain('Coba');
  });
});

describe('approveDraft — gagal eksekusi tercatat + berpesan jelas', () => {
  it('executor throw → ValidationError berisi sebab + saran, draft tetap pending', async () => {
    const { db, drafts } = memDb();
    const svc = new DraftService(drafts, null, async () => { throw new Error('Session has expired (190)'); });
    const created = drafts.create({
      type: 'rule_pause', summary: 'Aturan X', details: { action: { type: 'pause' }, campaign: { id: 'c1', name: 'Promo' } },
      userId: 'u1', campaignId: 'c1',
    });
    await expect(svc.approveDraft(created.id, 'u1')).rejects.toThrow(/Eksekusi gagal.*kedaluwarsa/);
    const row = drafts.findById(created.id);
    expect(row.status).toBe('pending');
    expect(row.last_error).toContain('expired');
    db.close();
  });

  it('executor sukses → approved + execution_result', async () => {
    const { db, drafts } = memDb();
    const svc = new DraftService(drafts, null, async () => 'paused ok');
    const created = drafts.create({
      type: 'rule_pause', summary: 'Aturan X', details: { action: { type: 'pause' }, campaign: { id: 'c1', name: 'Promo' } },
      userId: 'u1', campaignId: 'c1',
    });
    const done = await svc.approveDraft(created.id, 'u1');
    expect(done.status).toBe('approved');
    expect(done.execution_result).toBe('paused ok');
    db.close();
  });

  it('object executionResult disimpan sebagai JSON, bukan "[object Object]"', async () => {
    const { db, drafts } = memDb();
    const created = drafts.create({
      type: 'rule_pause', summary: 'Aturan X', details: {},
      userId: 'u1', campaignId: 'c1',
    });
    const done = drafts.approve(created.id, { reviewedBy: 'u1', executionResult: { campaign_id: 'c1', status: 'PAUSED' } });
    expect(done.execution_result).toBe(JSON.stringify({ campaign_id: 'c1', status: 'PAUSED' }));
    db.close();
  });

  it('blank executionResult eksternal ditolak di service', async () => {
    const { db, drafts } = memDb();
    const svc = new DraftService(drafts, null, async () => 'unused');
    const created = drafts.create({
      type: 'rule_pause', summary: 'Aturan X', details: {},
      userId: 'u1', campaignId: 'c1',
    });
    await expect(svc.approveDraft(created.id, 'u1', '   ')).rejects.toThrow(/kosong/);
    expect(drafts.findById(created.id).status).toBe('pending');
    db.close();
  });

  it('findStalePending: hanya pending tua yang belum diingatkan', () => {
    const { db, drafts } = memDb();
    const old = drafts.create({ type: 't', summary: 'lama', details: {}, userId: 'u1' });
    db.prepare("UPDATE approval_drafts SET created_at = datetime('now', '-2 hours') WHERE id = ?").run(old.id);
    drafts.create({ type: 't', summary: 'baru', details: {}, userId: 'u1' });
    const stale = drafts.findStalePending({ olderThanMinutes: 60 });
    expect(stale.map(d => d.summary)).toEqual(['lama']);
    drafts.markReminded(old.id);
    expect(drafts.findStalePending({ olderThanMinutes: 60 }).length).toBe(0);
    db.close();
  });
});
