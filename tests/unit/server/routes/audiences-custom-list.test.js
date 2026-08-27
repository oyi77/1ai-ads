import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Capture the token each fresh MetaAdsAPI was constructed with, and stub call/_post.
const constructedTokens = [];
let fakeId = 'aud_123';

vi.mock('../../../../server/services/meta/index.js', () => {
  return {
    MetaAdsAPI: class {
      constructor(token) {
        constructedTokens.push(token);
        this._token = token;
      }
      async call() {
        return { id: fakeId, name: 'n' };
      }
      async _post() {
        return { id: fakeId, users: [] };
      }
    }
  };
});

const resolveToken = vi.fn();

vi.mock('../../../../server/lib/resolve-user-platform.js', () => ({
  resolveUserPlatformToken: (platform, req, accountsRepo, settingsRepo) => resolveToken(platform, req, accountsRepo, settingsRepo)
}));

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} })
}));

import { generateToken } from '../../../../server/lib/auth.js';
import { requireAuth } from '../../../../server/middleware/auth.js';
import { createAudienceRouter } from '../../../../server/routes/audiences.js';

function authHeader() {
  return `Bearer ${generateToken({ sub: 'u1', id: 'u1', role: 'user' })}`;
}

function buildApp() {
  const router = createAudienceRouter({ platformAccountsRepo: {}, settingsRepo: {} });
  const app = express();
  app.use(express.json());
  app.use('/api/audiences', requireAuth, router);
  return app;
}

describe('audiences /custom-list (Phase 6 ingestion)', () => {
  beforeEach(() => {
    constructedTokens.length = 0;
    fakeId = 'aud_123';
    resolveToken.mockReset();
  });

  it('creates a custom audience + ingests contacts for the bound user token', async () => {
    resolveToken.mockReturnValue('USER_TOK');
    const app = buildApp();

    const res = await request(app)
      .post('/api/audiences/custom-list')
      .set('Authorization', authHeader())
      .send({
        account_id: 'act_999',
        name: 'VIP Customers',
        contacts: [{ phone: '628120001' }, '628120002', { phone: '628120003' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('aud_123');
    // Fresh per-request client bound to THIS user's token (not the shared singleton).
    expect(constructedTokens).toEqual(['USER_TOK']);
  });

  it('returns 400 with no bound Meta token (scoped, no cross-user fallback)', async () => {
    resolveToken.mockReturnValue(null); // user has not connected Meta
    const app = buildApp();

    const res = await request(app)
      .post('/api/audiences/custom-list')
      .set('Authorization', authHeader())
      .send({ account_id: 'act_999', name: 'X', contacts: ['628120001'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Meta account not connected/i);
    // Must NOT have constructed any Meta client when token is absent.
    expect(constructedTokens.length).toBe(0);
  });

  it('returns 400 when contacts array missing/empty', async () => {
    resolveToken.mockReturnValue('USER_TOK');
    const app = buildApp();

    const res = await request(app)
      .post('/api/audiences/custom-list')
      .set('Authorization', authHeader())
      .send({ account_id: 'act_999', name: 'X' });

    expect(res.status).toBe(400);
  });
});
