import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../../../db/index.js';
import { createApp } from '../../../../server/app.js';
import { generateToken } from '../../../../server/lib/auth.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

const mockLLM = { async call() { return '{}'; } };
const mockMCP = {
  clients: new Map(),
  async connect() { return { connected: true }; },
  async disconnect() {},
  async callTool() { return { data: [] }; },
  getStatus() { return {}; },
  getTools() { return []; },
};

/**
 * /metrics exposes per-path request counters — recon surface.
 * Gated 2026-09-14: requireAuth + requireAdmin (was public, 200 no-auth
 * even on the internet-facing domain).
 */
describe('GET /metrics auth gate', () => {
  function buildApp() {
    const db = createDatabase(':memory:');
    return { db, app: createApp({ db, llmClient: mockLLM, mcpClient: mockMCP }) };
  }

  it('answers 401 without a token', async () => {
    const { db, app } = buildApp();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
    db.close();
  });

  it('answers 403 for a non-admin token', async () => {
    const { db, app } = buildApp();
    const tok = generateToken({ id: 'u1', username: 'user', role: 'user' });
    const res = await request(app).get('/metrics').set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(403);
    db.close();
  });

  it('answers 200 prometheus text for an admin token', async () => {
    const { db, app } = buildApp();
    const tok = generateToken({ id: 'a1', username: 'admin', role: 'admin' });
    const res = await request(app).get('/metrics').set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/http_requests_total/);
    db.close();
  });
});
