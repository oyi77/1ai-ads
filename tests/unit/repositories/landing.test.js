import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { LandingRepository } from '../../../server/repositories/landing.js';
import { makeLandingPage } from '../../helpers/fixtures.js';

describe('LandingRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new LandingRepository(db);
  });

  it('findAll returns empty array initially', () => {
    const result = repo.findAll();
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('create inserts and returns id', () => {
    const lp = makeLandingPage();
    const id = repo.create(lp);
    expect(id).toBeDefined();
  });

  it('findById returns single page', () => {
    const lp = makeLandingPage();
    const id = repo.create(lp);
    const found = repo.findById(id);
    expect(found).not.toBeNull();
    expect(found.name).toBe('Test Landing Page');
  });

  it('findById returns null for nonexistent id', () => {
    expect(repo.findById('nonexistent')).toBeNull();
  });

  it('findAll with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create(makeLandingPage({ name: `LP ${i}` }));
    }
    const page1 = repo.findAll({ page: 1, limit: 2 });
    expect(page1.data.length).toBe(2);
    expect(page1.total).toBe(5);
  });

  it('update modifies fields', () => {
    const id = repo.create(makeLandingPage());
    const updated = repo.update(id, { name: 'Updated LP', theme: 'slate' });
    expect(updated).not.toBeNull();
    expect(updated.name).toBe('Updated LP');
    expect(updated.theme).toBe('slate');
  });

  it('update on nonexistent id returns null', () => {
    expect(repo.update('nonexistent', { name: 'Nope' })).toBeNull();
  });

  it('remove deletes and returns true', () => {
    const id = repo.create(makeLandingPage());
    expect(repo.remove(id)).toBe(true);
    expect(repo.findById(id)).toBeNull();
  });

  it('remove on nonexistent id returns false', () => {
    expect(repo.remove('nonexistent')).toBe(false);
  });
});
