import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../../../db/index.js';
import { createApp } from '../../../../server/app.js';

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
 * App-level webhook no-secret branches (same leak class, fixed 2026-09-14
 * across /api/payments/notify, /webhooks/u, /api/webhooks/video-complete).
 * The suite env sets no webhook secrets, so these exercise the real
 * fail-closed branches: 401 'Invalid signature', never 500 config leak.
 */
describe('app webhook no-secret branches', () => {
  function buildApp() {
    const db = createDatabase(':memory:');
    return { db, app: createApp({ db, llmClient: mockLLM, mcpClient: mockMCP }) };
  }

  it('POST /api/payments/notify with garbage signature answers 401', async () => {
    const { db, app } = buildApp();
    const res = await request(app)
      .post('/api/payments/notify')
      .set('Content-Type', 'application/json')
      .set('x-scalev-signature', 'deadbeef')
      .send({ id: 'x' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/not configured/);
    db.close();
  });

  it('POST /api/webhooks/video-complete with garbage signature answers 401', async () => {
    const { db, app } = buildApp();
    const res = await request(app)
      .post('/api/webhooks/video-complete')
      .set('Content-Type', 'application/json')
      .set('x-webhook-signature', 'deadbeef')
      .send({ jobId: 'x' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/not configured/);
    db.close();
  });
});
