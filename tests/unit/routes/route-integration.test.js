import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../../db/index.js';
import { createApp } from '../../../server/app.js';
import { seedDemoData } from '../../../db/seed.js';

// Mock MCP and LLM
const mockMCP = {
  clients: new Map(),
  async connect() { return { connected: true, tools: [], toolCount: 0 }; },
  async disconnect() {},
  async callTool() { return { data: [] }; },
  getStatus() { return { meta: { connected: false } }; },
  getTools() { return []; },
};
const mockLLM = { async call() { return '[]'; } };

describe('Routes: Templates', () => {
  let app, db, adminToken, userToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;

    await request(app).post('/api/auth/register').send({ username: 'testuser', password: 'testpass123', email: 'test@test.com' });
    db.prepare('UPDATE users SET confirmed = 1 WHERE username = ?').run('testuser');
    const userRes = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'testpass123' });
    userToken = userRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

  it('GET / returns templates', async () => {
    const res = await auth(request(app).get('/api/templates'), adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST / creates template (admin)', async () => {
    const res = await auth(request(app).post('/api/templates'), adminToken)
      .send({ name: 'Test Template', type: 'landing', data: { headline: 'Test' } });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST / rejects non-admin', async () => {
    const res = await auth(request(app).post('/api/templates'), userToken)
      .send({ name: 'Test', type: 'landing', data: {} });
    expect(res.status).toBe(403);
  });

  it('DELETE /:id deletes template (admin)', async () => {
    const createRes = await auth(request(app).post('/api/templates'), adminToken)
      .send({ name: 'To Delete', type: 'landing', data: {} });
    const id = createRes.body.data.id;
    const res = await auth(request(app).delete(`/api/templates/${id}`), adminToken);
    expect(res.status).toBe(200);
  });
});

describe('Routes: Drafts', () => {
  let app, db, adminToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('GET / returns drafts', async () => {
    const res = await auth(request(app).get('/api/drafts'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST / creates draft', async () => {
    const res = await auth(request(app).post('/api/drafts'))
      .send({ type: 'campaign', summary: 'Test Draft', details: { name: 'Test' } });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /:id/approve approves draft', async () => {
    const createRes = await auth(request(app).post('/api/drafts'))
      .send({ type: 'campaign', summary: 'To Approve' });
    const draft = createRes.body.data;
    expect(draft).toBeDefined();
    expect(draft.id).toBeDefined();
    const res = await auth(request(app).post(`/api/drafts/${draft.id}/approve`));
    expect(res.status).toBe(200);
  });
});

describe('Routes: Automation', () => {
  let app, db, adminToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('GET / returns automation rules', async () => {
    const res = await auth(request(app).get('/api/automation'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /create creates rule', async () => {
    const res = await auth(request(app).post('/api/automation/create'))
      .send({ name: 'Test Rule', type: 'auto_pause', condition: 'roas < 1', action: 'pause' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Routes: Attribution', () => {
  let app, db, adminToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('GET /dashboard returns attribution data', async () => {
    const res = await auth(request(app).get('/api/attribution/dashboard'));
    expect(res.status).toBe(200);
  });

  it('GET /matches returns matches', async () => {
    const res = await auth(request(app).get('/api/attribution/matches'));
    expect(res.status).toBe(200);
    expect(res.body.matches).toBeDefined();
  });
});

describe('Routes: A/B Tests', () => {
  let app, db, adminToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('GET / returns tests', async () => {
    const res = await auth(request(app).get('/api/testing/ab-tests'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST / creates test', async () => {
    const res = await auth(request(app).post('/api/testing/ab-tests'))
      .send({ name: 'Test A/B', metric: 'ctr', variants: [{ name: 'A' }, { name: 'B' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Routes: Audit Trail', () => {
  let app, db, adminToken;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    seedDemoData(db);
    app = createApp({ db, llmClient: mockLLM, mcpClient: mockMCP });

    const adminRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.data.accessToken;
  });

  afterAll(() => { db?.close(); });

  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('GET / returns audit logs', async () => {
    const res = await auth(request(app).get('/api/audit'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
