import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase } from '../../../db/index.js';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DraftsRepository } from '../../../server/repositories/drafts.js';
import {
  DraftService,
  DRAFT_MAX_AGE_DAYS,
  NON_REPLAYABLE_MAX_AGE_DAYS,
} from '../../../server/services/draft-service.js';

const NOW = new Date();
const isoDaysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 19).replace('T', ' ');

function makeRepo() {
  const db = createDatabase(':memory:');
  db.prepare('DELETE FROM settings').run();
  return new DraftsRepository(db);
}

describe('draft expiry — staleness guard', () => {
  let repo, service, executed;

  beforeEach(() => {
    repo = makeRepo();
    executed = [];
    service = new DraftService(repo, null, async (action, campaign) => {
      executed.push({ action, campaign });
      return { ok: true };
    });
  });

  it('defines sane age caps', () => {
    expect(DRAFT_MAX_AGE_DAYS).toBeGreaterThanOrEqual(7);
    expect(NON_REPLAYABLE_MAX_AGE_DAYS).toBeLessThanOrEqual(DRAFT_MAX_AGE_DAYS);
  });

  it('executes a fresh replayable rule draft normally', async () => {
    const d = repo.create({
      type: 'rule_pause', summary: 'Pause X', campaignId: 'camp-1', userId: 'u1',
      details: { action: { type: 'pause' }, campaign: { id: 'camp-1' } },
    });
    repo.db.prepare("UPDATE approval_drafts SET created_at=? WHERE id=?").run(isoDaysAgo(2), d.id);

    const out = await service.approveDraft(d.id, 'u1');
    expect(out.status).toBe('approved');
    expect(executed).toHaveLength(1);
  });

  it('rejects a stale replayable draft INSTEAD of executing it', async () => {
    const d = repo.create({
      type: 'rule_pause', summary: 'Pause X', campaignId: 'camp-1', userId: 'u1',
      details: { action: { type: 'pause' }, campaign: { id: 'camp-1' } },
    });
    repo.db.prepare("UPDATE approval_drafts SET created_at=? WHERE id=?").run(isoDaysAgo(DRAFT_MAX_AGE_DAYS + 3), d.id);

    await expect(service.approveDraft(d.id, 'u1')).rejects.toThrow(/batas/i);
    // Must NOT have executed the mutation.
    expect(executed).toHaveLength(0);
    // Must be persisted as rejected by the system, with an auditable reason.
    const row = repo.findById(d.id);
    expect(row.status).toBe('rejected');
    expect(row.reviewed_by).toBe('system:expiry');
    expect(row.rejection_reason).toMatch(/Kedaluwarsa/i);
  });

  it('rejects a stale non-replayable (ai_optimize) draft sooner', async () => {
    const d = repo.create({
      type: 'ai_optimize', summary: 'AI pause X', campaignId: 'camp-2', userId: 'u1',
      details: { action: { type: 'pause' }, campaign: { id: 'camp-2' } },
    });
    // Older than the non-replayable cap but still inside the replayable cap.
    repo.db.prepare("UPDATE approval_drafts SET created_at=? WHERE id=?")
      .run(isoDaysAgo(NON_REPLAYABLE_MAX_AGE_DAYS + 1), d.id);

    await expect(service.approveDraft(d.id, 'u1')).rejects.toThrow(/batas/i);
    expect(executed).toHaveLength(0);
    expect(repo.findById(d.id).status).toBe('rejected');
  });

  it('allows a non-replayable draft inside its cap', async () => {
    const d = repo.create({
      type: 'ai_optimize', summary: 'AI pause X', campaignId: 'camp-3', userId: 'u1',
      details: { action: { type: 'pause' }, campaign: { id: 'camp-3' } },
    });
    repo.db.prepare("UPDATE approval_drafts SET created_at=? WHERE id=?")
      .run(isoDaysAgo(NON_REPLAYABLE_MAX_AGE_DAYS - 1), d.id);
    const out = await service.approveDraft(d.id, 'u1');
    expect(out.status).toBe('approved');
  });
});

describe('draft expiry — batch expireStalePending', () => {
  let repo;

  beforeEach(() => {
    repo = makeRepo();
  });

  const seed = (daysOld, type = 'rule_pause', campaignId = null) => {
    const d = repo.create({
      type, summary: `S ${Math.random()}`, campaignId, userId: 'u1',
      details: campaignId ? { action: { type: 'pause' }, campaign: { id: campaignId } } : undefined,
    });
    repo.db.prepare("UPDATE approval_drafts SET created_at=? WHERE id=?").run(isoDaysAgo(daysOld), d.id);
    return d.id;
  };

  it('expires only pending drafts beyond the cap', () => {
    seed(30, 'rule_pause', 'c1');
    seed(20, 'rule_pause', 'c2');
    seed(5, 'rule_pause', 'c3');
    const { expired } = repo.expireStalePending(DRAFT_MAX_AGE_DAYS);
    expect(expired).toBe(2);
    expect(repo.findById((repo.findByUser('u1', { status: 'rejected' }).data || [])[0]?.id || '').status).toBe('rejected');
    // The fresh one stays pending.
    const pending = repo.findByUser('u1', { status: 'pending' }).data || [];
    expect(pending).toHaveLength(1);
  });

  it('is idempotent — a second run expires nothing more', () => {
    seed(40, 'rule_pause', 'c1');
    const first = repo.expireStalePending(DRAFT_MAX_AGE_DAYS);
    expect(first.expired).toBe(1);
    const second = repo.expireStalePending(DRAFT_MAX_AGE_DAYS);
    expect(second.expired).toBe(0);
  });

  it('never touches approved/rejected history', () => {
    const id = seed(40, 'rule_pause', 'c1');
    repo.approve(id, { reviewedBy: 'u1' });
    const { expired } = repo.expireStalePending(DRAFT_MAX_AGE_DAYS);
    expect(expired).toBe(0);
    expect(repo.findById(id).status).toBe('approved');
  });

  it('clears the pending-pair unique slot so a fresh draft can be minted', () => {
    const old = seed(40, 'rule_pause', 'camp-x');
    repo.expireStalePending(DRAFT_MAX_AGE_DAYS);
    // The dedup blocker is gone — a new draft for the same campaign must succeed.
    const fresh = repo.create({
      type: 'rule_pause', summary: 'Fresh pause', campaignId: 'camp-x', userId: 'u1',
      details: { action: { type: 'pause' }, campaign: { id: 'camp-x' } },
    });
    expect(fresh.id).toBeTruthy();
    expect(fresh.id).not.toBe(old.id);
    expect(repo.findById(fresh.id).status).toBe('pending');
  });
});
