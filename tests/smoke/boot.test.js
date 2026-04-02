import { describe, it, expect } from 'vitest';
import { createDatabase } from '../../db/index.js';
import { createApp } from '../../server/app.js';
import { seedDemoData } from '../../db/seed.js';
import request from 'supertest';
import { existsSync } from 'fs';

const mockLLM = { async call() { return '{}'; } };
const mockMCP = {
  clients: new Map(),
  async connect() { return { connected: true }; },
  async disconnect() {},
  async callTool() { return { data: [] }; },
  getStatus() { return { meta: { connected: false }, google: { connected: false } }; },
  getTools() { return []; },
};

describe('Smoke Tests', () => {
  it('createDatabase with :memory: succeeds', () => {
    const db = createDatabase(':memory:');
    expect(db).toBeDefined();
    db.close();
  });

  it('createApp returns an Express app without throwing', () => {
    const db = createDatabase(':memory:');
    const app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    db.close();
  });

  it('seedDemoData runs without error', () => {
    const db = createDatabase(':memory:');
    expect(() => seedDemoData(db)).not.toThrow();
    const users = db.prepare('SELECT COUNT(*) as c FROM users').get();
    expect(users.c).toBeGreaterThan(0);
    db.close();
  });

  it('all 5 tables exist in schema', () => {
    const db = createDatabase(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
    expect(tables).toContain('ads');
    expect(tables).toContain('landing_pages');
    expect(tables).toContain('campaigns');
    expect(tables).toContain('settings');
    expect(tables).toContain('users');
    db.close();
  });

  it('auth endpoints respond', async () => {
    const db = createDatabase(':memory:');
    seedDemoData(db);
    const app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(login.status).toBe(200);
    expect(login.body.data.token).toBeDefined();
    db.close();
  });

  it('protected endpoints return 401 without token', async () => {
    const db = createDatabase(':memory:');
    const app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const res = await request(app).get('/api/ads');
    expect(res.status).toBe(401);
    db.close();
  });

  it('critical endpoints return 200 with auth', async () => {
    const db = createDatabase(':memory:');
    seedDemoData(db);
    const app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = login.body.data.token;
    const auth = (r) => r.set('Authorization', `Bearer ${token}`);

    const ads = await auth(request(app).get('/api/ads'));
    expect(ads.status).toBe(200);

    const landing = await auth(request(app).get('/api/landing'));
    expect(landing.status).toBe(200);

    const dashboard = await auth(request(app).get('/api/analytics/dashboard'));
    expect(dashboard.status).toBe(200);

    db.close();
  });

  it('dist/index.html exists (production build)', () => {
    expect(existsSync('dist/index.html')).toBe(true);
  });
});
