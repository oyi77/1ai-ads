import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase } from '../../../../db/index.js';
import { createRepositories } from '../../../../server/app/repositories.js';
import { WhatsAppIntelligenceService } from '../../../../server/services/whatsapp-intelligence.js';
import { createWhatsappIntelligenceGroupRouter } from '../../../../server/routes/_whatsapp-intelligence.js';
import { generateToken } from '../../../../server/lib/auth.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const SCORING_JSON = JSON.stringify({
  intent_score: 8, intent_label: 'Lead', product: 'kursus', estimated_value: 500000, reasoning: 'asked price',
});

let db;
let repos;
let svc;

const token = (id, role = 'user') => `Bearer ${generateToken({ id, username: id, role })}`;
const auth = (t) => ({ Authorization: t });

function buildService() {
  return new WhatsAppIntelligenceService({
    waConversationsRepo: repos.waConversationsRepo,
    metaApi: {},
    whatsappApi: { sendMessage: async () => ({}) },
    llmClient: { call: async () => SCORING_JSON },
    db,
    settingsRepo: {},
    config: { socialScoringUrl: 'local' },
    userMetaAppsRepo: null,
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(createWhatsappIntelligenceGroupRouter({ services: { waIntelligence: svc } }));
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, error: err.message });
  });
  return app;
}

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const NUMBER_A = 'waba-number-a';
const NUMBER_B = 'waba-number-b';

function webhookPayload(from, numberId) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        value: {
          metadata: { phone_number_id: numberId },
          contacts: [{ wa_id: from, profile: { name: 'Contact' } }],
          messages: [{ from, id: `mid-${from}`, timestamp: '1750000000', type: 'text', text: { body: 'berapa harga kursus?' } }],
        },
      }],
    }],
  };
}

beforeEach(() => {
  db = createDatabase(':memory:');
  repos = createRepositories(db);
  svc = buildService();
});

describe('WhatsApp ingress attribution', () => {
  it('attributes a conversation to the registered number owner', async () => {
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_A, OWNER_A);

    const result = await svc.processWebhook(webhookPayload('628100001', NUMBER_A));

    expect(result.processed).toBe(1);
    const rows = repos.waConversationsRepo.findByPhone('628100001', OWNER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(OWNER_A);
  });

  it('leaves unmapped numbers unattributed and invisible to every tenant', async () => {
    await svc.processWebhook(webhookPayload('628100002', 'unknown-number'));

    const row = repos.waConversationsRepo.findByPhone('628100002')[0];
    expect(row.user_id).toBeNull();
    expect(repos.waConversationsRepo.findByPhone('628100002', OWNER_A)).toEqual([]);
    expect(repos.waConversationsRepo.findByPhone('628100002', OWNER_B)).toEqual([]);
  });

  it('never merges the same contact across two tenants numbers', async () => {
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_A, OWNER_A);
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_B, OWNER_B);

    await svc.processWebhook(webhookPayload('628100003', NUMBER_A));
    await svc.processWebhook(webhookPayload('628100003', NUMBER_B));

    expect(repos.waConversationsRepo.findByPhone('628100003', OWNER_A)).toHaveLength(1);
    expect(repos.waConversationsRepo.findByPhone('628100003', OWNER_B)).toHaveLength(1);
  });
  it('skips background scoring without an owner (no cross-tenant sweep)', async () => {
    const spy = [];
    const origFind = repos.waConversationsRepo.findUnscored.bind(repos.waConversationsRepo);
    repos.waConversationsRepo.findUnscored = (...a) => { spy.push(a); return origFind(...a); };
    await svc._scoreRecentConversations(undefined);
    expect(spy).toHaveLength(0);
  });

  it('skips CAPI when the conversation owner has no bound token', async () => {
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_A, OWNER_A);
    await svc.processWebhook(webhookPayload('628199999', NUMBER_A));
    const row = repos.waConversationsRepo.findByPhone('628199999', OWNER_A)[0];
    // No platformAccountsRepo wired → no owner token → skipped, never posted.
    const result = await svc.sendCapiEvent({ ...row, intent_label: 'Lead', intent_score: 8 });
    expect(result).toBeNull();
  });

  beforeEach(async () => {
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_A, OWNER_A);
    repos.waConversationsRepo.setOwnerForWaNumber(NUMBER_B, OWNER_B);
    await svc.processWebhook(webhookPayload('628110001', NUMBER_A));
    await svc.processWebhook(webhookPayload('628120001', NUMBER_B));
  });

  it('lists and stats only the caller rows', async () => {
    const app = buildApp();

    const listA = await request(app).get('/whatsapp-intelligence/conversations').set(auth(token(OWNER_A)));
    const listB = await request(app).get('/whatsapp-intelligence/conversations').set(auth(token(OWNER_B)));
    expect(listA.status).toBe(200);
    expect(listB.status).toBe(200);
    expect(listA.body.data.map((r) => r.phoneNumber)).toEqual(['628110001']);
    expect(listB.body.data.map((r) => r.phoneNumber)).toEqual(['628120001']);

    const statsA = await request(app).get('/whatsapp-intelligence/stats').set(auth(token(OWNER_A)));
    expect(statsA.body.data.total).toBe(1);
  });

  it('single-conversation actions on another tenant row are 404', async () => {
    const app = buildApp();
    const bRow = repos.waConversationsRepo.findByPhone('628120001', OWNER_B)[0];

    const score = await request(app).post('/whatsapp-intelligence/conversations/score')
      .set(auth(token(OWNER_A))).send({ conversationId: bRow.id });
    const reply = await request(app).post('/whatsapp-intelligence/conversations/reply')
      .set(auth(token(OWNER_A))).send({ conversationId: bRow.id, text: 'hi' });
    const capi = await request(app).post('/whatsapp-intelligence/conversations/send-capi')
      .set(auth(token(OWNER_A))).send({ conversationId: bRow.id });

    expect(score.status).toBe(404);
    expect(reply.status).toBe(404);
    expect(capi.status).toBe(404);
    // Untouched: still pending, still B-owned.
    expect(repos.waConversationsRepo.findById(bRow.id).status).toBe('active');
  });
  it('batch operations only touch the caller rows', async () => {
    const app = buildApp();
    // Let the fire-and-forget sweeps from setup settle so only this call acts.
    await new Promise((r) => setTimeout(r, 500));
    // Setup rows may or may not have been labeled by the setup sweeps (race
    // between scoring write and labeling sweep). Pin them labeled so only
    // the fresh row below needs labeling — the assertion is tenant scope.
    for (const row of repos.waConversationsRepo.findByPhone('628110001', OWNER_A)) {
      repos.waConversationsRepo.update(row.id, { labels: ['Setup'] });
    }
    for (const row of repos.waConversationsRepo.findByPhone('628120001', OWNER_B)) {
      repos.waConversationsRepo.update(row.id, { labels: ['Setup'] });
    }
    // Fresh work for A, created after the background sweeps finished.
    const fresh = repos.waConversationsRepo.create({ phoneNumber: '628110002', userId: OWNER_A, messages: [] });
    repos.waConversationsRepo.update(fresh.id, { intentScore: 5 });
    const bBefore = repos.waConversationsRepo.findByPhone('628120001', OWNER_B)[0].labels;

    const res = await request(app).post('/whatsapp-intelligence/conversations/auto-label')
      .set(auth(token(OWNER_A))).send({ limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body.labeled).toBe(1);
    expect(repos.waConversationsRepo.findById(fresh.id).labels).not.toBe('[]');
    expect(repos.waConversationsRepo.findByPhone('628120001', OWNER_B)[0].labels).toBe(bBefore);
  });

  it('admin numbers endpoint registers attribution; non-admin is refused', async () => {
    const app = buildApp();

    const forbidden = await request(app).post('/whatsapp-intelligence/numbers')
      .set(auth(token(OWNER_A))).send({ wa_phone_number_id: 'waba-x', user_id: OWNER_A });
    expect(forbidden.status).toBe(403);

    const created = await request(app).post('/whatsapp-intelligence/numbers')
      .set(auth(token('admin-1', 'admin'))).send({ wa_phone_number_id: 'waba-x', user_id: OWNER_A });
    expect(created.status).toBe(201);
    expect(repos.waConversationsRepo.findOwnerByWaNumber('waba-x')).toBe(OWNER_A);

    const bad = await request(app).post('/whatsapp-intelligence/numbers')
      .set(auth(token('admin-1', 'admin'))).send({ wa_phone_number_id: 'waba-x' });
    expect(bad.status).toBe(400);
  });
});
