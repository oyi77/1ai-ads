import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { AdsRepository } from '../../../server/repositories/ads.js';
import { makeAd } from '../../helpers/fixtures.js';

describe('AdsRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new AdsRepository(db);
  });

  it('findAll returns empty array initially', () => {
    const result = repo.findAll();
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('create inserts and returns id', () => {
    const ad = makeAd();
    const id = repo.create(ad);
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('findById returns single ad', () => {
    const ad = makeAd();
    const id = repo.create(ad);
    const found = repo.findById(id);
    expect(found).not.toBeNull();
    expect(found.name).toBe('Test Ad');
    expect(found.platform).toBe('meta');
  });

  it('findById returns null for nonexistent id', () => {
    const found = repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  it('findAll with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create(makeAd({ name: `Ad ${i}` }));
    }
    const page1 = repo.findAll({ page: 1, limit: 2 });
    expect(page1.data.length).toBe(2);
    expect(page1.total).toBe(5);

    const page3 = repo.findAll({ page: 3, limit: 2 });
    expect(page3.data.length).toBe(1);
  });

  it('findAll filters by platform', () => {
    repo.create(makeAd({ platform: 'meta' }));
    repo.create(makeAd({ platform: 'google' }));
    repo.create(makeAd({ platform: 'meta' }));

    const result = repo.findAll({ platform: 'google' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].platform).toBe('google');
  });

  it('findAll filters by status', () => {
    repo.create(makeAd({ status: 'draft' }));
    repo.create(makeAd({ status: 'active' }));

    const result = repo.findAll({ status: 'active' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].status).toBe('active');
  });

  it('update modifies fields', () => {
    const id = repo.create(makeAd());
    const updated = repo.update(id, { name: 'Updated Name', status: 'active' });
    expect(updated).not.toBeNull();
    expect(updated.name).toBe('Updated Name');
    expect(updated.status).toBe('active');
  });

  it('update on nonexistent id returns null', () => {
    const result = repo.update('nonexistent', { name: 'Nope' });
    expect(result).toBeNull();
  });

  it('remove deletes and returns true', () => {
    const id = repo.create(makeAd());
    const removed = repo.remove(id);
    expect(removed).toBe(true);
    expect(repo.findById(id)).toBeNull();
  });

  it('remove on nonexistent id returns false', () => {
    const removed = repo.remove('nonexistent');
    expect(removed).toBe(false);
  });

  it('search matches by name', () => {
    repo.create(makeAd({ name: 'Summer Sale Campaign' }));
    repo.create(makeAd({ name: 'Winter Promo' }));

    const result = repo.search('summer');
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toContain('Summer');
  });

  it('search matches by product', () => {
    repo.create(makeAd({ product: 'Digital Marketing Course' }));
    repo.create(makeAd({ product: 'Widget' }));

    const result = repo.search('marketing');
    expect(result.data.length).toBe(1);
  });
});
