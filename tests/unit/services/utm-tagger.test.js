import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AdUtmMapRepository } from '../../../server/repositories/ad-utm-map.js';
import { UtmTaggerService } from '../../../server/services/utm-tagger.js';
import express from 'express';
import request from 'supertest';
import { createTrackRouter } from '../../../server/routes/track.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTestDb() {
  const db = new Database(':memory:');
  const schema = readFileSync(join(__dirname, '../../../db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}

describe('UtmTaggerService', () => {
  let db, repo, svc;

  beforeEach(() => {
    db = createTestDb();
    repo = new AdUtmMapRepository(db);
    svc = new UtmTaggerService(repo);
  });

  it('tagUrl returns correct tracking URL format', () => {
    const url = svc.tagUrl('https://example.com/product', 'ad-123', 'camp-456');
    expect(url).toBe(
      'https://adforge.aitradepulse.com/t/ad-123?utm_source=meta&utm_medium=paid&utm_campaign=camp-456&utm_content=ad-123'
    );
  });

  it('tagUrl stores mapping in database', () => {
    svc.tagUrl('https://example.com/product', 'ad-789', 'camp-000');
    const record = repo.getByAdId('ad-789');
    expect(record).not.toBeNull();
    expect(record.destination_url).toBe('https://example.com/product');
    expect(record.campaign_id).toBe('camp-000');
    expect(record.click_count).toBe(0);
  });

  it('incrementClicks bumps count', () => {
    svc.tagUrl('https://example.com', 'ad-inc', 'camp-inc');
    repo.incrementClicks('ad-inc');
    repo.incrementClicks('ad-inc');
    const record = repo.getByAdId('ad-inc');
    expect(record.click_count).toBe(2);
  });
});

describe('Track route', () => {
  let db, repo, svc, app;

  beforeEach(() => {
    db = createTestDb();
    repo = new AdUtmMapRepository(db);
    svc = new UtmTaggerService(repo);
    svc.tagUrl('https://example.com/landing', 'ad-track-1', 'camp-track-1');

    app = express();
    app.use('/t', createTrackRouter(repo, svc));
  });

  it('GET /t/:ad_id returns 302 redirect', async () => {
    const res = await request(app).get('/t/ad-track-1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://example.com/landing');
    expect(res.headers.location).toContain('utm_source=meta');
  });

  it('GET /t/:ad_id increments click_count', async () => {
    await request(app).get('/t/ad-track-1');
    const record = repo.getByAdId('ad-track-1');
    expect(record.click_count).toBe(1);
  });

  it('GET /t/:unknown_id returns 404', async () => {
    const res = await request(app).get('/t/does-not-exist');
    expect(res.status).toBe(404);
  });
});
