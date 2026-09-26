import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeService } from '../../../server/services/realtime-service.js';
import { MetaAdsAPI } from '../../../server/services/meta/index.js';

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: vi.fn().mockImplementation(function () {
    this.setActiveAccount = vi.fn();
    this.getCampaignInsights = vi.fn();
  }),
}));

// Mock ws module
vi.mock('ws', () => {
  class MockWebSocketServer {
    constructor() {
      this.handlers = {};
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
  }
  return { WebSocketServer: MockWebSocketServer };
});

// Mock logger
vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeMockWs(userId = undefined) {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    on: vi.fn(),
    userId,
  };
}

describe('RealtimeService', () => {
  let service;

  beforeEach(() => {
    const metaApi = { getCampaignInsights: vi.fn() };
    const campaignsRepo = { findAll: vi.fn(() => ({ data: [] })) };
    service = new RealtimeService(metaApi, campaignsRepo);
  });

  it('broadcast delivers owner metrics only to that owner clients', () => {
    const wsA = makeMockWs('owner-a');
    const wsB = makeMockWs('owner-b');
    service.clients.add(wsA);
    service.clients.add(wsB);

    service._broadcast({ type: 'metric_update', data: { campaign_id: 'c1' } }, 'owner-a');

    const payload = JSON.stringify({ type: 'metric_update', data: { campaign_id: 'c1' } });
    expect(wsA.send).toHaveBeenCalledWith(payload);
    expect(wsB.send).not.toHaveBeenCalled();
  });

  it('broadcast skips clients not in OPEN state', () => {
    const open = makeMockWs('owner-a');
    const closed = makeMockWs('owner-a');
    closed.readyState = 3; // CLOSED
    service.clients.add(open);
    service.clients.add(closed);

    service._broadcast({ type: 'test', data: 'x' }, 'owner-a');

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('getMetrics scopes campaigns to the caller', () => {
    service.clients.add(makeMockWs());
    service.clients.add(makeMockWs());
    service.metrics.set('c1', { campaign_id: 'c1', owner: 'owner-a' });
    service.metrics.set('c2', { campaign_id: 'c2', owner: 'owner-b' });

    const result = service.getMetrics('owner-a');
    expect(result.connected_clients).toBe(2);
    expect(Object.keys(result.campaigns)).toEqual(['c1']);
  });

  it('attach destroys upgrades without a valid access cookie', () => {
    const mockServer = { on: vi.fn() };
    service.attach(mockServer);
    const upgrade = mockServer.on.mock.calls.find(c => c[0] === 'upgrade')[1];

    const socket = { destroy: vi.fn() };
    upgrade({ url: '/ws/realtime', headers: {} }, socket, {});
    expect(socket.destroy).toHaveBeenCalled();
    expect(service.clients.size).toBe(0);
  });

  it('attach rejects non-realtime paths', () => {
    const mockServer = { on: vi.fn() };
    service.attach(mockServer);
    const upgrade = mockServer.on.mock.calls.find(c => c[0] === 'upgrade')[1];

    const socket = { destroy: vi.fn() };
    upgrade({ url: '/other', headers: {} }, socket, {});
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('extractConversions finds purchase action', () => {
    const data = {
      actions: [
        { action_type: 'link_click', value: '5' },
        { action_type: 'purchase', value: '3' },
      ],
    };
    expect(service._extractConversions(data)).toBe(3);
  });

  it('extractConversions returns 0 when no matching action', () => {
    expect(service._extractConversions({ actions: [] })).toBe(0);
    expect(service._extractConversions({})).toBe(0);
  });

  it('startPolling and stopPolling manage interval', () => {
    vi.useFakeTimers();
    const pollSpy = vi.spyOn(service, '_poll').mockResolvedValue(undefined);

    service.startPolling();
    expect(service.pollInterval).not.toBeNull();

    // Second call is no-op
    service.startPolling();

    vi.advanceTimersByTime(30000);
    expect(pollSpy).toHaveBeenCalled();

    service.stopPolling();
    expect(service.pollInterval).toBeNull();

    // Second stop is no-op
    service.stopPolling();
    vi.useRealTimers();
  });

  describe('_metaApiForOwner (multi-tenant)', () => {
    let acctRepo;
    let settingsRepo;

    beforeEach(() => {
      acctRepo = { getByPlatform: vi.fn(), findAllActiveByUserAndPlatform: vi.fn() };
      settingsRepo = { getCredentials: vi.fn() };
    });

    it('returns a fresh owner-scoped Meta instance when the owner has a bound token', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) }, { platformAccountsRepo: acctRepo, settingsRepo });
      acctRepo.getByPlatform.mockReturnValue({ user_id: 'owner-1', platform: 'meta', access_token: 'owner-tok-rt' });
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([{ user_id: 'owner-1', platform: 'meta', access_token: 'owner-tok-rt' }]);

      const api = service._metaApiForOwner({ id: 'c1', user_id: 'owner-1', platform: 'meta' });

      expect(api).not.toBe(metaApi);
      expect(api).toBeInstanceOf(MetaAdsAPI);
      expect(api.setActiveAccount).toHaveBeenCalledWith(null, 'owner-tok-rt');
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-1', 'meta');
    });

    it('resolves owner via created_by when user_id is absent', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) }, { platformAccountsRepo: acctRepo, settingsRepo });
      acctRepo.getByPlatform.mockReturnValue({ user_id: 'owner-2', platform: 'meta', access_token: 'owner-tok-rt2' });
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([{ user_id: 'owner-2', platform: 'meta', access_token: 'owner-tok-rt2' }]);

      const api = service._metaApiForOwner({ id: 'c2', created_by: 'owner-2', platform: 'meta' });

      expect(api).not.toBe(metaApi);
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-2', 'meta');
    });

    it('returns null when no owner token is bound (poll loop skips, no operator read)', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) }, { platformAccountsRepo: acctRepo, settingsRepo });
      acctRepo.getByPlatform.mockReturnValue(null);
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([]);

      const api = service._metaApiForOwner({ id: 'c3', user_id: 'owner-3', platform: 'meta' });

      expect(api).toBeNull();
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-3', 'meta');
    });

    it('returns null when no platformAccountsRepo is wired', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) });
      const api = service._metaApiForOwner({ id: 'c4', user_id: 'owner-4', platform: 'meta' });
      expect(api).toBeNull();
    });

    it('polls each active campaign via the owner-scoped client (no cross-user system token)', async () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const acctRepo = { getByPlatform: vi.fn().mockReturnValue({ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-rt9' }), findAllActiveByUserAndPlatform: vi.fn().mockReturnValue([{ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-rt9' }]) };
      const service = new RealtimeService(metaApi, {
        findAll: vi.fn(() => ({ data: [{ id: 'c9', campaign_id: 'camp-9', platform: 'meta', status: 'ACTIVE', user_id: 'owner-9' }] })),
      }, { platformAccountsRepo: acctRepo, settingsRepo });

      await service._poll();

      // System meta must NOT be used; the owner-scoped instance fetched insights.
      expect(metaApi.getCampaignInsights).not.toHaveBeenCalled();
      // Owner-scoped instance was constructed and used.
      expect(MetaAdsAPI).toHaveBeenCalled();
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-9', 'meta');
    });

    it('skips poll groups whose accounts are all flagged dead — no Meta call', async () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const acctRepo = { getByPlatform: vi.fn().mockReturnValue({ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-rt9' }), findAllActiveByUserAndPlatform: vi.fn().mockReturnValue([{ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-rt9', health_status: 'expired', is_active: 1 }]) };
      const service = new RealtimeService(metaApi, {
        findAll: vi.fn(() => ({ data: [{ id: 'c9', campaign_id: 'camp-9', platform: 'meta', status: 'ACTIVE', user_id: 'owner-9' }] })),
      }, { platformAccountsRepo: acctRepo, settingsRepo: {} });

      MetaAdsAPI.mockClear();
      await service._poll();

      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-9', 'meta');
      expect(MetaAdsAPI).not.toHaveBeenCalled();
      expect(metaApi.getCampaignInsights).not.toHaveBeenCalled();
    });
  });
  describe('refreshCampaign (scoped)', () => {
    it('404s on another tenant campaign', async () => {
      const service = new RealtimeService({ getCampaignInsights: vi.fn() }, {
        findById: vi.fn((id, userId) => (userId === 'owner-a' ? { id, user_id: 'owner-a' } : null)),
      }, { platformAccountsRepo: { findAllActiveByUserAndPlatform: () => [] } });
      await expect(service.refreshCampaign('c1', 'intruder')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('errors clearly when the owner has no bound token', async () => {
      const service = new RealtimeService({ getCampaignInsights: vi.fn() }, {
        findById: vi.fn(() => ({ id: 'c1', user_id: 'owner-a' })),
      }, { platformAccountsRepo: { findAllActiveByUserAndPlatform: () => [] } });
      await expect(service.refreshCampaign('c1', 'owner-a')).rejects.toThrow(/not connected/);
    });
  });
});
