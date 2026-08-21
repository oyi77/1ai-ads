import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

// Force global env fallback creds to a known value.
vi.mock('../../../../server/config/index.js', () => {
  return {
    default: {
      get fbSystemToken() { return 'GLOBAL_SYSTEM_TOKEN'; },
      get fbAppId() { return '12345'; },
      get fbAppSecret() { return 'GLOBAL_APP_SECRET'; },
      get fbThreadsId() { return null; },
      get fbThreadsSecret() { return null; },
      get metaApiVersion() { return 'v22.0'; },
      get webhookVerifyToken() { return 'global_verify'; },
    },
    __esModule: true,
  };
});

import { resolveMetaAppCreds, resolveWebhookCreds } from '../../../../server/lib/meta-app-creds.js';
import { buildUserMetaClients } from '../../../../server/lib/meta-user-factory.js';

const USER_ID = 'user-uuid-1';
const OTHER_ID = 'user-uuid-2';

function makeRepo(rows) {
  const store = new Map(Object.entries(rows));
  return {
    getActive: (userId) => store.get(String(userId)) || null,
    getMasked: (userId) => {
      const r = store.get(String(userId));
      return r ? { appId: r.app_id, hasCreds: true } : null;
    },
  };
}

describe('resolveMetaAppCreds', () => {
  it('returns user creds when present (source=user)', () => {
    const repo = makeRepo({
      [USER_ID]: { app_id: '111', app_secret: 's1', system_token: 't1' },
    });
    const creds = resolveMetaAppCreds(USER_ID, repo);
    expect(creds.source).toBe('user');
    expect(creds.system_token).toBe('t1');
    expect(creds.app_id).toBe('111');
  });

  it('falls back to global env when no user row', () => {
    const creds = resolveMetaAppCreds(USER_ID, makeRepo({}));
    expect(creds.source).toBe('global');
    expect(creds.system_token).toBe('GLOBAL_SYSTEM_TOKEN');
  });

  it('never crosses users — user A does not see user B creds', () => {
    const repo = makeRepo({
      [OTHER_ID]: { app_id: '999', app_secret: 's9', system_token: 'T_OTHER' },
    });
    const creds = resolveMetaAppCreds(USER_ID, repo);
    // USER_ID has no row → global fallback, NOT user B's token.
    expect(creds.source).toBe('global');
    expect(creds.system_token).toBe('GLOBAL_SYSTEM_TOKEN');
    expect(creds.system_token).not.toBe('T_OTHER');
  });
});

describe('resolveWebhookCreds', () => {
  it('per-user verify token = userId, app secret from user creds', () => {
    const repo = makeRepo({
      [USER_ID]: { app_id: '111', app_secret: 'USER_SECRET', system_token: 't1' },
    });
    const { appSecret, verifyToken } = resolveWebhookCreds(USER_ID, repo);
    expect(verifyToken).toBe(USER_ID);
    expect(appSecret).toBe('USER_SECRET');
  });
  it('falls back to global app secret but keeps userId as verify token', () => {
    const { appSecret, verifyToken } = resolveWebhookCreds(USER_ID, makeRepo({}));
    expect(appSecret).toBe('GLOBAL_APP_SECRET');
    // Per-user webhook: verify token is always the userId (stable, unguessable).
    expect(verifyToken).toBe(USER_ID);
  });

  it('falls back to global verify token when no userId', () => {
    const { verifyToken } = resolveWebhookCreds(null, makeRepo({}));
    expect(verifyToken).toBe('global_verify');
  });
});

describe('buildUserMetaClients', () => {
  it('returns user-scoped clients when user creds exist', () => {
    const repo = makeRepo({
      [USER_ID]: { app_id: '111', app_secret: 's1', system_token: 't1' },
    });
    const clients = buildUserMetaClients(USER_ID, repo);
    expect(clients.creds.source).toBe('user');
    expect(clients.whatsappApi).toBeTruthy();
    expect(clients.systemUser).toBeTruthy();
  });

  it('returns global fallback clients when no user creds', () => {
    const clients = buildUserMetaClients(USER_ID, makeRepo({}));
    expect(clients.creds.source).toBe('global');
  });
});
