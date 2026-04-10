import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { AiSuggestionsRepository } from '../../../server/repositories/ai-suggestions.js';

describe('AiSuggestionsRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    // insert a test user
    db.prepare("INSERT INTO users (id, username, email, password_hash, confirmed) VALUES ('u1', 'tester', 'tester@test.com', 'hash', 1)").run();
    repo = new AiSuggestionsRepository(db);
  });

  afterEach(() => db.close());

  it('create() inserts a suggestion and returns an id', () => {
    const id = repo.create({
      user_id: 'u1',
      type: 'ad_copy',
      suggestion: { changes: [{ field: 'headline', value: 'New headline' }] },
      rationale: 'CTR below average',
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getById() returns the suggestion', () => {
    const id = repo.create({ user_id: 'u1', type: 'pause_ad', suggestion: '{}' });
    const row = repo.getById(id);
    expect(row).not.toBeNull();
    expect(row.type).toBe('pause_ad');
    expect(row.status).toBe('pending');
  });

  it('listByUser() returns all suggestions for user', () => {
    repo.create({ user_id: 'u1', type: 'ad_copy', suggestion: '{}' });
    repo.create({ user_id: 'u1', type: 'bid', suggestion: '{}' });
    const all = repo.listByUser('u1');
    expect(all.length).toBe(2);
  });

  it('listByUser(userId, status) filters by status', () => {
    const id = repo.create({ user_id: 'u1', type: 'ad_copy', suggestion: '{}' });
    repo.updateStatus(id, 'applied');
    const pending = repo.listByUser('u1', 'pending');
    const applied = repo.listByUser('u1', 'applied');
    expect(pending.length).toBe(0);
    expect(applied.length).toBe(1);
  });

  it('updateStatus() updates status and sets applied_at when applied', () => {
    const id = repo.create({ user_id: 'u1', type: 'ad_copy', suggestion: '{}' });
    const updated = repo.updateStatus(id, 'applied');
    expect(updated.status).toBe('applied');
    expect(updated.applied_at).not.toBeNull();
  });

  it('updateStatus() to dismissed sets status without applied_at', () => {
    const id = repo.create({ user_id: 'u1', type: 'ad_copy', suggestion: '{}' });
    const updated = repo.updateStatus(id, 'dismissed');
    expect(updated.status).toBe('dismissed');
    expect(updated.applied_at).toBeNull();
  });
});
