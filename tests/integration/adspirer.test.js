import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { generateToken } from '../../server/lib/auth.js';
import request from 'supertest';

// Mock AdspirerMcpClient to avoid real MCP connections
vi.mock('../../server/services/adspirer-mcp-client.js', () => ({
  AdspirerMcpClient: class {
    constructor() {}
    async callTool(_userId, _toolName) {
      throw new Error('not connected');
    }
    async listTools(_userId) {
      return [];
    }
    async disconnect(_userId) {
      return true;
    }
  },
}));

describe('Adspirer API Integration', () => {
  let app;
  let db;
  let authToken;
  let userId;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
      .run(userId, 'adspireruser', 'adspirer@test.com', passwordHash);

    authToken = generateToken({ id: userId, username: 'adspireruser' });

    app = createApp({ db });
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('GET /api/adspirer/status — no account row → connected: false', async () => {
    const res = await request(app)
      .get('/api/adspirer/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { connected: false } });
  });

  it('GET /api/adspirer/auth → 302 redirect with code_challenge and state', async () => {
    const res = await request(app)
      .get('/api/adspirer/auth')
      .set('Authorization', `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    const location = res.headers.location;
    expect(location).toBeTruthy();
    const url = new URL(location);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('GET /api/adspirer/auth/callback?state=bad_state → 400 invalid state', async () => {
    const res = await request(app)
      .get('/api/adspirer/auth/callback?state=bad_state&code=somecode')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: 'Invalid or expired state' });
  });

  it('POST /api/adspirer/tools/get_connections_status — no account → 401', async () => {
    const res = await request(app)
      .post('/api/adspirer/tools/get_connections_status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false });
  });

  it('POST /api/adspirer/disconnect — no account row → 200 success', async () => {
    const res = await request(app)
      .post('/api/adspirer/disconnect')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('GET /api/adspirer/status — includes enabled field (defaults true when unset)', async () => {
    const res = await request(app)
      .get('/api/adspirer/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('enabled');
    expect(res.body.data.enabled).toBe(true);
  });
});

describe('Settings Integrations API', () => {
  let app;
  let db;
  let authToken;

  beforeAll(async () => {
    db = createDatabase(':memory:');

    const bcrypt = await import('bcryptjs');
    const { v4: uuidv4 } = await import('uuid');
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('testpass123', 10);
    db.prepare('INSERT INTO users (id, username, email, password_hash, confirmed) VALUES (?, ?, ?, ?, 1)')
      .run(userId, 'intuser', 'int@test.com', passwordHash);

    authToken = generateToken({ id: userId, username: 'intuser' });
    app = createApp({ db });
  });

  afterAll(() => {
    if (db) db.close();
  });

  it('GET /api/settings/integrations — returns adspirer enabled state', async () => {
    const res = await request(app)
      .get('/api/settings/integrations')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('adspirer');
    expect(typeof res.body.data.adspirer.enabled).toBe('boolean');
  });

  it('POST /api/settings/integrations/adspirer — disable → enabled: false', async () => {
    const res = await request(app)
      .post('/api/settings/integrations/adspirer')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { adspirer: { enabled: false } } });
  });

  it('GET /api/adspirer/status — enabled:false still reachable (guard exempts status)', async () => {
    // disable first
    await request(app)
      .post('/api/settings/integrations/adspirer')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: false });

    const res = await request(app)
      .get('/api/adspirer/status')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });

  it('GET /api/adspirer/auth — 403 when integration disabled', async () => {
    // ensure disabled
    await request(app)
      .post('/api/settings/integrations/adspirer')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: false });

    const res = await request(app)
      .get('/api/adspirer/auth')
      .set('Authorization', `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false });
  });

  it('POST /api/settings/integrations/adspirer — enable → enabled: true', async () => {
    const res = await request(app)
      .post('/api/settings/integrations/adspirer')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { adspirer: { enabled: true } } });
  });

  it('POST /api/settings/integrations/unknown — 400 unknown integration', async () => {
    const res = await request(app)
      .post('/api/settings/integrations/unknown')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
