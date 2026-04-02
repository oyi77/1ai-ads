import { describe, it, expect } from 'vitest';
import { createDatabase } from '../../../db/index.js';

describe('createDatabase', () => {
  it('creates in-memory database with all 4 tables', () => {
    const db = createDatabase(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = tables.map(t => t.name);
    expect(names).toContain('ads');
    expect(names).toContain('landing_pages');
    expect(names).toContain('campaigns');
    expect(names).toContain('settings');
    db.close();
  });

  it('is idempotent - can be called twice on same path', () => {
    const db1 = createDatabase(':memory:');
    // Running schema again should not throw
    expect(() => {
      const tables = db1.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables.length).toBeGreaterThanOrEqual(4);
    }).not.toThrow();
    db1.close();
  });

  it('ads table has expected columns', () => {
    const db = createDatabase(':memory:');
    const cols = db.prepare("PRAGMA table_info(ads)").all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('product');
    expect(colNames).toContain('platform');
    expect(colNames).toContain('status');
    expect(colNames).toContain('updated_at');
    db.close();
  });

  it('campaigns table has revenue column', () => {
    const db = createDatabase(':memory:');
    const cols = db.prepare("PRAGMA table_info(campaigns)").all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('revenue');
    db.close();
  });
});
