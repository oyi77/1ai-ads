import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDatabase } from '../../../../db/index.js';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
}));

import { createServices } from '../../../../server/app/services.js';

describe('createServices — llm_config hydration', () => {
  let db, settingsRepo;

  beforeEach(() => {
    db = createDatabase(':memory:');
    db.prepare('DELETE FROM settings').run();
    settingsRepo = {
      _store: {},
      get(k) { return this._store[k] ?? null; },
      set(k, v) { this._store[k] = v; },
      getAll() { return { ...this._store }; },
      getAccount: () => null, getAccounts: () => [], addAccount: vi.fn(),
      updateAccount: vi.fn(), deleteAccount: vi.fn(), setActiveAccount: vi.fn(),
      setActiveAccountForUser: vi.fn(),
    };
  });

  const buildRepos = () => ({
    settingsRepo,
    usersRepo: { findById: () => null },
    campaignsRepo: {}, rulesRepo: {}, platformAccountsRepo: {}, paymentsRepo: {},
    invoicesRepo: null, adsRepo: {}, landingRepo: {}, draftsRepo: {}, suggestionsRepo: {},
    adUtmMapRepo: {}, userAddonsRepo: {}, contentSchedulerQueueRepo: {},
    waConversationsRepo: {}, trendingRepo: {}, performanceRepo: {}, abTestsRepo: {},
    competitorsRepo: {}, widgetsRepo: {}, attributionRepo: {}, cleanupRepo: {},
  });

  it('applies a persisted llm_config to the client on boot', () => {
    settingsRepo.set('llm_config', {
      url: 'https://persisted.example/v1/chat/completions',
      model: 'persisted-model,fallback-model',
      format: 'openai',
      apiKey: 'sk-persisted',
    });

    const services = createServices({ db, repos: buildRepos(), params: {} });

    expect(services.llmClient.url).toBe('https://persisted.example/v1/chat/completions');
    expect(services.llmClient.models).toEqual(['persisted-model', 'fallback-model']);
    expect(services.llmClient.apiKey).toBe('sk-persisted');
  });

  it('falls back to env config when no llm_config is stored', () => {
    const services = createServices({ db, repos: buildRepos(), params: {} });
    // whatever the env default is, the client must be constructed and usable
    expect(services.llmClient).toBeTruthy();
    expect(Array.isArray(services.llmClient.models)).toBe(true);
    expect(services.llmClient.models.length).toBeGreaterThan(0);
  });

  it('never throws when the stored config is malformed', () => {
    settingsRepo.get = () => { throw new Error('bad row'); };
    expect(() => createServices({ db, repos: buildRepos(), params: {} })).not.toThrow();
  });
});
