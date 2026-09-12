import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../../../../db/index.js';
import { seedDemoData } from '../../../../db/seed.js';
import { createApp } from '../../../../server/app.js';
import { generateToken } from '../../../../server/lib/auth.js';

/**
 * Production error-pipeline contract.
 *
 * Two different mistakes hid behind the same symptom ("Internal Server
 * Error" on responses that should have carried a message):
 *
 * 1. The central res.json sanitizer keyed on `statusCode >= 500`, so the
 *    intentional 503 from guarded routes ("MCP client not configured") was
 *    scrubbed. It must apply to bare 500s only.
 * 2. The central error handler scrubbed EVERY status in production, so even
 *    a 401 answered "Internal Server Error" instead of "Unauthorized".
 *    Only 5xx responses may be scrubbed.
 *
 * config.nodeEnv is a live getter over process.env.NODE_ENV, so flipping the
 * env var switches the pipeline exactly the way a production boot does.
 */
describe('production error pipeline — bare 500s sanitized, intentional statuses pass', () => {
  let prevNodeEnv;
  beforeEach(() => { prevNodeEnv = process.env.NODE_ENV; });
  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  // Mirrors server.js: { db, llmClient } and no mcpClient.
  function buildApp() {
    const db = createDatabase(':memory:');
    seedDemoData(db);
    return { db, app: createApp({ db, llmClient: {} }) };
  }
  const auth = () => `Bearer ${generateToken({ id: 'admin-1', username: 'admin' })}`;

  it('401 from the central error handler keeps its message in production', async () => {
    process.env.NODE_ENV = 'production';
    const { db, app } = buildApp();

    const res = await request(app).get('/api/team');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
    db.close();
  });

  it('503 from a guarded route keeps its message in production', async () => {
    process.env.NODE_ENV = 'production';
    const { db, app } = buildApp();

    const res = await request(app).get('/api/mcp/status').set('Authorization', auth());

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: 'MCP client not configured' });
    db.close();
  });

  it('bare 500 from a route catch is scrubbed in production but visible otherwise', async () => {
    const closedApp = () => {
      const { db, app } = buildApp();
      db.close(); // every query now throws with driver internals
      return app;
    };

    const testMode = await request(closedApp()).get('/api/team').set('Authorization', auth());
    expect(testMode.status).toBe(500);
    expect(testMode.body.success).toBe(false);
    expect(testMode.body.error).not.toBe('Internal Server Error');

    process.env.NODE_ENV = 'production';
    const prodMode = await request(closedApp()).get('/api/team').set('Authorization', auth());
    expect(prodMode.status).toBe(500);
    expect(prodMode.body).toEqual({ success: false, error: 'Internal Server Error' });
  });
});
