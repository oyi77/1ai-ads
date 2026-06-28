import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Closure variable for PlanCheck.getPlanDetails mock
let mockPlanDetailsResult = null;

vi.mock('../../../../server/lib/plan-check.js', () => ({
  PlanCheck: function MockPlanCheck() {
    return {
      getPlanDetails: () => mockPlanDetailsResult,
    };
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));
vi.mock('../../../../server/config/index.js', () => ({
  default: {
    llm: { url: 'http://default-llm.test', model: 'default-model', apiKey: '' },
    metaApiVersion: 'v22.0',
  },
}));

import { createSettingsRouter } from '../../../../server/routes/settings.js';

function createMockSettingsRepo(store = {}) {
  return {
    getAll: vi.fn(() => ({ ...store })),
    get: vi.fn((key) => store[key]),
    set: vi.fn((key, value) => { store[key] = value; }),
    getAccounts: vi.fn(() => []),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setActiveAccount: vi.fn(),
  };
}

function createMockLlmClient() {
  const client = {
    url: 'http://default-llm.test',
    model: 'default-model',
    apiKey: 'default-key',
    updateConfig: vi.fn(),
    call: vi.fn(async () => 'test response'),
    fetchModels: vi.fn(async () => ['model-a', 'model-b']),
    constructor: vi.fn(),
  };
  // The constructor property is used as `new llmClient.constructor(...)` — make it a real constructor
  client.constructor = function FakeLlmClient(cfg) {
    return {
      ...cfg,
      call: vi.fn(async () => 'OK'),
      fetchModels: vi.fn(async () => ['model-x']),
    };
  };
  return client;
}

function createMockDb() {
  return { prepare: vi.fn(() => ({ get: vi.fn() })) };
}

function createMockMetaApi() {
  function FakeMetaApi(repo) {
    return {
      getMe: vi.fn(async () => ({ id: 'fb-user-1', name: 'Test User' })),
      constructor: FakeMetaApi,
    };
  }
  return {
    constructor: FakeMetaApi,
    getMe: vi.fn(async () => ({ id: 'fb-user-1', name: 'Test User' })),
  };
}

function createApp(settingsRepo, llmClient, db, metaApi) {
  const app = express();
  app.use(express.json());
  // Inject a default user for routes that check req.user
  app.use((req, _res, next) => {
    req.user = { id: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/settings', createSettingsRouter(settingsRepo, llmClient, db, metaApi));
  return app;
}

describe('Settings Router', () => {
  let app, settingsRepo, llmClient, db, metaApi, store;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlanDetailsResult = null;
    store = {};
    settingsRepo = createMockSettingsRepo(store);
    llmClient = createMockLlmClient();
    db = createMockDb();
    metaApi = createMockMetaApi();
    app = createApp(settingsRepo, llmClient, db, metaApi);
  });

  // ─── GET / ─────────────────────────────────────────────────────────

  describe('GET /', () => {
    it('returns all settings excluding credentials_ keys', async () => {
      settingsRepo.getAll.mockReturnValue({
        theme: 'dark',
        credentials_meta: { token: 'secret' },
        locale: 'en',
      });
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ theme: 'dark', locale: 'en' });
      expect(res.body.data.credentials_meta).toBeUndefined();
    });

    it('returns empty data when no settings exist', async () => {
      settingsRepo.getAll.mockReturnValue({});
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({});
    });
  });

  // ─── GET /plan ─────────────────────────────────────────────────────

  describe('GET /plan', () => {
    it('returns plan details when user is authenticated', async () => {
      const planDetails = { id: 'plan_pro', name: 'Pro', tier: 2, maxAds: 50 };
      mockPlanDetailsResult = planDetails;
      const res = await request(app).get('/api/settings/plan');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(planDetails);
    });
  });

  // ─── GET /ai ───────────────────────────────────────────────────────

  describe('GET /ai', () => {
    it('returns stored llm config', async () => {
      settingsRepo.get.mockReturnValue({ url: 'http://llm.test', model: 'm1', apiKey: 'sk-1234' });
      const res = await request(app).get('/api/settings/ai');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ url: 'http://llm.test', model: 'm1', apiKey: 'sk-1234' });
    });

    it('returns defaults when no config is stored', async () => {
      settingsRepo.get.mockReturnValue(undefined);
      const res = await request(app).get('/api/settings/ai');
      expect(res.status).toBe(200);
      expect(res.body.data.url).toBe('http://default-llm.test');
      expect(res.body.data.model).toBe('default-model');
    });
  });

  // ─── PUT /ai ───────────────────────────────────────────────────────

  describe('PUT /ai', () => {
    it('saves new llm config and updates client', async () => {
      const res = await request(app).put('/api/settings/ai').send({ url: 'http://new.llm', model: 'm2', apiKey: 'sk-new' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(settingsRepo.set).toHaveBeenCalledWith('llm_config', expect.objectContaining({ url: 'http://new.llm', model: 'm2', apiKey: 'sk-new' }));
      expect(llmClient.updateConfig).toHaveBeenCalled();
    });

    it('uses current api key when masked value is sent', async () => {
      settingsRepo.get.mockReturnValue({ apiKey: 'real-key' });
      const res = await request(app).put('/api/settings/ai').send({ url: 'http://new.llm', model: 'm2', apiKey: '••••••••' });
      expect(res.status).toBe(200);
      expect(settingsRepo.set).toHaveBeenCalledWith('llm_config', expect.objectContaining({ apiKey: 'real-key' }));
    });
  });

  // ─── POST /ai/test-prompt ──────────────────────────────────────────

  describe('POST /ai/test-prompt', () => {
    it('returns llm response for valid prompt', async () => {
      llmClient.call.mockResolvedValue('Hello!');
      const res = await request(app).post('/api/settings/ai/test-prompt').send({ prompt: 'Say hello' });
      expect(res.status).toBe(200);
      expect(res.body.data).toBe('Hello!');
      expect(llmClient.call).toHaveBeenCalledWith('You are a helpful assistant.', 'Say hello');
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await request(app).post('/api/settings/ai/test-prompt').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prompt/);
    });

    it('returns 500 when llm call fails', async () => {
      llmClient.call.mockRejectedValue(new Error('LLM down'));
      const res = await request(app).post('/api/settings/ai/test-prompt').send({ prompt: 'test' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('LLM down');
    });

    it('uses custom systemPrompt when provided', async () => {
      llmClient.call.mockResolvedValue('custom reply');
      const res = await request(app).post('/api/settings/ai/test-prompt').send({ prompt: 'test', systemPrompt: 'Custom sys' });
      expect(res.status).toBe(200);
      expect(llmClient.call).toHaveBeenCalledWith('Custom sys', 'test');
    });
  });

  // ─── GET /accounts ─────────────────────────────────────────────────

  describe('GET /accounts', () => {
    it('returns masked credentials for accounts', async () => {
      settingsRepo.getAccounts.mockReturnValue([
        { id: 'a1', account_name: 'Account 1', credentials: { access_token: 'EAAGabc123', secret: 'xyz789' } },
      ]);
      const res = await request(app).get('/api/settings/accounts');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const creds = res.body.data[0].credentials;
      expect(creds.access_token).toContain('****');
      expect(creds.secret).toContain('****');
    });

    it('returns empty array when no accounts exist', async () => {
      settingsRepo.getAccounts.mockReturnValue([]);
      const res = await request(app).get('/api/settings/accounts');
      expect(res.body.data).toEqual([]);
    });

    it('returns empty array on error', async () => {
      settingsRepo.getAccounts.mockImplementation(() => { throw new Error('db fail'); });
      const res = await request(app).get('/api/settings/accounts');
      expect(res.body.data).toEqual([]);
    });
  });

  // ─── POST /accounts ────────────────────────────────────────────────

  describe('POST /accounts', () => {
    it('creates an account with a generated uuid', async () => {
      const res = await request(app).post('/api/settings/accounts').send({ platform: 'meta', account_name: 'My Biz', credentials: { token: 'tok' } });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('test-uuid-1234');
      expect(settingsRepo.addAccount).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-uuid-1234', platform: 'meta', account_name: 'My Biz',
      }));
    });

    it('returns 400 when fields are missing', async () => {
      const res = await request(app).post('/api/settings/accounts').send({ platform: 'meta' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing required fields/);
    });
  });

  // ─── PUT /accounts/:id ─────────────────────────────────────────────

  describe('PUT /accounts/:id', () => {
    it('calls setActiveAccount when is_active=1 and platform given', async () => {
      const res = await request(app).put('/api/settings/accounts/acc-1').send({ platform: 'meta', is_active: 1 });
      expect(res.status).toBe(200);
      expect(settingsRepo.setActiveAccount).toHaveBeenCalledWith('meta', 'acc-1');
    });

    it('calls updateAccount otherwise', async () => {
      const res = await request(app).put('/api/settings/accounts/acc-1').send({ account_name: 'Updated' });
      expect(res.status).toBe(200);
      expect(settingsRepo.updateAccount).toHaveBeenCalledWith('acc-1', expect.objectContaining({ account_name: 'Updated' }));
    });
  });

  // ─── DELETE /accounts/:id ──────────────────────────────────────────

  describe('DELETE /accounts/:id', () => {
    it('deletes the account', async () => {
      const res = await request(app).delete('/api/settings/accounts/acc-1');
      expect(res.status).toBe(200);
      expect(settingsRepo.deleteAccount).toHaveBeenCalledWith('acc-1');
    });
  });

  // ─── POST /accounts/test ───────────────────────────────────────────

  describe('POST /accounts/test', () => {
    it('returns 400 when platform or credentials missing', async () => {
      const res = await request(app).post('/api/settings/accounts/test').send({ platform: 'meta' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing/);
    });

    it('tests meta connection and returns success', async () => {
      // Make the FakeMetaApi constructor's getMe resolve
      const res = await request(app).post('/api/settings/accounts/test').send({ platform: 'meta', credentials: { access_token: 'tok' } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Connected as');
    });

    it('returns success for non-meta platform', async () => {
      const res = await request(app).post('/api/settings/accounts/test').send({ platform: 'google', credentials: { key: 'val' } });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/looks valid/);
    });

    it('returns 400 when meta test fails', async () => {
      // Override metaApi.constructor to throw
      metaApi.constructor = function FailingApi() {
        return { getMe: vi.fn(async () => { throw new Error('Invalid token'); }) };
      };
      app = createApp(settingsRepo, llmClient, db, metaApi);
      const res = await request(app).post('/api/settings/accounts/test').send({ platform: 'meta', credentials: { access_token: 'bad' } });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid token');
    });
  });

  // ─── GET /credentials/:platform ────────────────────────────────────

  describe('GET /credentials/:platform', () => {
    it('returns masked fields for active account', async () => {
      settingsRepo.getAccounts.mockReturnValue([
        { id: 'a1', is_active: 1, credentials: { access_token: 'EAAGtoken123' } },
      ]);
      const res = await request(app).get('/api/settings/credentials/meta');
      expect(res.status).toBe(200);
      expect(res.body.data.configured).toBe(true);
      expect(res.body.data.fields.access_token).toContain('****');
    });

    it('returns configured=false when no accounts', async () => {
      settingsRepo.getAccounts.mockReturnValue([]);
      const res = await request(app).get('/api/settings/credentials/meta');
      expect(res.body.data.configured).toBe(false);
    });
  });

  // ─── POST /credentials/:platform ───────────────────────────────────

  describe('POST /credentials/:platform', () => {
    it('creates a Default account when none exists', async () => {
      settingsRepo.getAccounts.mockReturnValue([]);
      const res = await request(app).post('/api/settings/credentials/meta').send({ access_token: 'tok' });
      expect(res.status).toBe(200);
      expect(settingsRepo.addAccount).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'meta', account_name: 'Default', is_active: 1,
      }));
    });

    it('updates existing Default account', async () => {
      settingsRepo.getAccounts.mockReturnValue([{ id: 'a1', account_name: 'Default' }]);
      const res = await request(app).post('/api/settings/credentials/meta').send({ access_token: 'newtok' });
      expect(res.status).toBe(200);
      expect(settingsRepo.updateAccount).toHaveBeenCalledWith('a1', expect.objectContaining({ credentials: { access_token: 'newtok' } }));
    });
  });

  // ─── GET /integrations ─────────────────────────────────────────────

  describe('GET /integrations', () => {
    it('returns enabled=true when setting is truthy', async () => {
      settingsRepo.get.mockReturnValue('true');
      const res = await request(app).get('/api/settings/integrations');
      expect(res.body.data.adspirer.enabled).toBe(true);
    });

    it('returns enabled=false when setting is falsy', async () => {
      settingsRepo.get.mockReturnValue(false);
      const res = await request(app).get('/api/settings/integrations');
      expect(res.body.data.adspirer.enabled).toBe(false);
    });
  });

  // ─── POST /integrations/:name ──────────────────────────────────────

  describe('POST /integrations/:name', () => {
    it('toggles adspirer integration on', async () => {
      const res = await request(app).post('/api/settings/integrations/adspirer').send({ enabled: true });
      expect(res.status).toBe(200);
      expect(settingsRepo.set).toHaveBeenCalledWith('integration_adspirer_enabled', true);
    });

    it('returns 400 when enabled is missing', async () => {
      const res = await request(app).post('/api/settings/integrations/adspirer').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown integration', async () => {
      const res = await request(app).post('/api/settings/integrations/unknown').send({ enabled: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Unknown integration/);
    });
  });

  // ─── PUT /:key ─────────────────────────────────────────────────────

  describe('PUT /:key', () => {
    it('saves a setting value', async () => {
      const res = await request(app).put('/api/settings/theme').send({ value: 'dark' });
      expect(res.status).toBe(200);
      expect(settingsRepo.set).toHaveBeenCalledWith('theme', 'dark');
    });

    it('returns 400 when value is missing', async () => {
      const res = await request(app).put('/api/settings/theme').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/value/);
    });
  });

  // ─── POST /ai/test-connection ──────────────────────────────────────

  describe('POST /ai/test-connection', () => {
    it('returns success when connection works', async () => {
      const res = await request(app).post('/api/settings/ai/test-connection').send({ url: 'http://llm', apiKey: 'sk-123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/Connection successful/);
    });

    it('returns 500 when connection fails', async () => {
      metaApi.constructor = function FailingLlm() {
        return { call: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) };
      };
      // test-connection creates a new llmClient.constructor — make it fail
      llmClient.constructor = function FailingLlm() {
        return { call: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) };
      };
      app = createApp(settingsRepo, llmClient, db, metaApi);
      const res = await request(app).post('/api/settings/ai/test-connection').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('ECONNREFUSED');
    });
  });

  // ─── POST /ai/models ───────────────────────────────────────────────

  describe('POST /ai/models', () => {
    it('returns models list', async () => {
      const res = await request(app).post('/api/settings/ai/models').send({ url: 'http://llm', apiKey: 'sk-123' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(['model-x']);
    });

    it('returns 500 when fetching models fails', async () => {
      llmClient.constructor = function FailingLlm() {
        return { fetchModels: vi.fn(async () => { throw new Error('timeout'); }) };
      };
      app = createApp(settingsRepo, llmClient, db, metaApi);
      const res = await request(app).post('/api/settings/ai/models').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('timeout');
    });
  });

  // ─── POST /accounts/connect-token ──────────────────────────────────

  describe('POST /accounts/connect-token', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns 400 when access_token is missing', async () => {
      const res = await request(app).post('/api/settings/accounts/connect-token').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/access_token/);
    });

    it('returns 400 when token is invalid', async () => {
      global.fetch = vi.fn(async () => ({
        json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
      }));
      const res = await request(app).post('/api/settings/accounts/connect-token').send({ platform: 'meta', access_token: 'bad-token' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid token/);
    });

    it('connects successfully with valid token and no ad accounts', async () => {
      global.fetch = vi.fn(async (url) => {
        if (url.includes('/me/adaccounts')) {
          return { json: async () => ({ data: [] }) };
        }
        return { json: async () => ({ id: 'fb1', name: 'FB User' }) };
      });
      settingsRepo.getAccounts.mockReturnValue([]);

      const res = await request(app).post('/api/settings/accounts/connect-token').send({ platform: 'meta', access_token: 'valid-token' });
      expect(res.status).toBe(200);
      expect(res.body.data.user_name).toBe('FB User');
      expect(settingsRepo.addAccount).toHaveBeenCalled();
    });

    it('returns 500 on fetch failure', async () => {
      global.fetch = vi.fn(async () => { throw new Error('Network error'); });
      const res = await request(app).post('/api/settings/accounts/connect-token').send({ platform: 'meta', access_token: 'tok' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Network error');
    });
  });

  // ─── POST /accounts/meta/exchange-token ────────────────────────────

  describe('POST /accounts/meta/exchange-token', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/settings/accounts/meta/exchange-token').send({ appId: 'app1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/appId, appSecret, and shortToken/);
    });

    it('returns 400 when facebook returns error', async () => {
      global.fetch = vi.fn(async () => ({
        json: async () => ({ error: { message: 'Token expired' } }),
      }));
      const res = await request(app).post('/api/settings/accounts/meta/exchange-token').send({
        appId: 'app1', appSecret: 'sec1', shortToken: 'short-tok',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Token expired');
    });

    it('returns 500 on unexpected error', async () => {
      global.fetch = vi.fn(async () => { throw new Error('Network down'); });
      const res = await request(app).post('/api/settings/accounts/meta/exchange-token').send({
        appId: 'app1', appSecret: 'sec1', shortToken: 'short-tok',
      });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Network down');
    });
  });
});
