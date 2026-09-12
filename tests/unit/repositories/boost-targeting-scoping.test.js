import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BoostRecommendationsRepository } from '../../../server/repositories/boost-recommendations.js';
import { TargetingSuggestionsRepository } from '../../../server/repositories/targeting-suggestions.js';

// Boost recommendations and targeting suggestions are per-tenant data: the
// queue carries approve/reject buttons and the audience builder echoes a
// customer's own posts. Before the user_id column these tables were global, so
// any signed-in user could list — and approve — another customer's rows.
describe('boost + targeting tenant scoping', () => {
  let db;
  let boostRepo;
  let targetingRepo;

  const REQ = (userId, over = {}) => ({
    user_id: userId, post_id: 'p1', page_id: 'pg1',
    boost_score: 0.8, suggested_budget_idr: '50000', ...over,
  });

  beforeEach(() => {
    db = new Database(':memory:');
    boostRepo = new BoostRecommendationsRepository(db);
    targetingRepo = new TargetingSuggestionsRepository(db);
  });

  afterEach(() => db.close());

  it('create stamps the owner on the recommendation', () => {
    const rec = boostRepo.create(REQ('u1'));
    expect(rec.user_id).toBe('u1');
    expect(rec.status).toBe('pending');
  });

  it('findByStatus never returns another tenant’s recommendations', () => {
    boostRepo.create(REQ('u1', { post_id: 'mine' }));
    boostRepo.create(REQ('u2', { post_id: 'theirs' }));
    const mine = boostRepo.findByStatus('pending', { userId: 'u1' });
    expect(mine.map(r => r.post_id)).toEqual(['mine']);
  });

  it('findById scoped to the caller cannot see a foreign recommendation', () => {
    const theirs = boostRepo.create(REQ('u2'));
    // Guessing the sequential id must not expose the row.
    expect(boostRepo.findById(theirs.id, 'u1')).toBeNull();
    expect(boostRepo.findById(theirs.id, 'u2')).not.toBeNull();
  });

  it('updateStatus scoped to the caller cannot approve a foreign recommendation', () => {
    const theirs = boostRepo.create(REQ('u2'));
    const result = boostRepo.updateStatus(theirs.id, { status: 'approved', reviewed_by: 'u1', userId: 'u1' });
    expect(result).toBeNull();
    // The row must be untouched, not merely hidden.
    expect(boostRepo.findById(theirs.id, 'u2').status).toBe('pending');
  });

  it('findByStatus without a userId still lists everything (operator/bot path)', () => {
    boostRepo.create(REQ('u1'));
    boostRepo.create(REQ('u2'));
    expect(boostRepo.findByStatus(null).length).toBe(2);
  });

  it('suggestions are listed only for their owner', () => {
    targetingRepo.upsert({ user_id: 'u1', post_id: 'mine', page_id: 'pg1' });
    targetingRepo.upsert({ user_id: 'u2', post_id: 'theirs', page_id: 'pg1' });
    expect(targetingRepo.findAll({ userId: 'u1' }).map(r => r.post_id)).toEqual(['mine']);
    expect(targetingRepo.findAll().length).toBe(2);
  });

  it('findByPost scoped to the caller cannot read a foreign post’s suggestion', () => {
    targetingRepo.upsert({ user_id: 'u2', post_id: 'theirs', page_id: 'pg1' });
    expect(targetingRepo.findByPost('theirs', 'pg1', 'u1')).toBeNull();
    expect(targetingRepo.findByPost('theirs', 'pg1', 'u2')).not.toBeNull();
  });

  it('an unscoped re-upsert does not strip the existing owner', () => {
    // The category lookup and the engine's background passes call upsert
    // without a user; that must not orphan the row from its tenant.
    targetingRepo.upsert({ user_id: 'u1', post_id: 'p1', page_id: 'pg1' });
    const again = targetingRepo.upsert({ post_id: 'p1', page_id: 'pg1', category: 'fashion' });
    expect(again.user_id).toBe('u1');
    expect(again.category).toBe('fashion');
  });
});
