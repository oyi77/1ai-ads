import { describe, it, expect } from 'vitest';
import { createTestDb } from './helpers/db.js';
import { makeAd, makeLandingPage, makeCampaign } from './helpers/fixtures.js';

describe('Test setup', () => {
  it('vitest runs and globals work', () => {
    expect(true).toBe(true);
  });

  it('createTestDb creates in-memory database with all 4 tables', () => {
    const db = createTestDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('ads');
    expect(tableNames).toContain('landing_pages');
    expect(tableNames).toContain('campaigns');
    expect(tableNames).toContain('settings');

    db.close();
  });

  it('fixtures create valid objects', () => {
    const ad = makeAd();
    expect(ad.name).toBe('Test Ad');
    expect(ad.id).toBeDefined();

    const lp = makeLandingPage();
    expect(lp.name).toBe('Test Landing Page');
    expect(lp.template).toBe('dark');

    const camp = makeCampaign();
    expect(camp.platform).toBe('meta');
    expect(camp.spend).toBe(500000);
  });

  it('can insert and retrieve data from test db', () => {
    const db = createTestDb();
    const ad = makeAd();

    db.prepare(`
      INSERT INTO ads (id, name, product, target, keunggulan, platform, format, content_model, hook, body, cta, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ad.id, ad.name, ad.product, ad.target, ad.keunggulan, ad.platform, ad.format, ad.content_model, ad.hook, ad.body, ad.cta, ad.tags, ad.status);

    const result = db.prepare('SELECT * FROM ads WHERE id = ?').get(ad.id);
    expect(result.name).toBe('Test Ad');
    expect(result.platform).toBe('meta');

    db.close();
  });
});
