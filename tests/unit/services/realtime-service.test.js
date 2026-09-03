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

function makeMockWs() {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    on: vi.fn(),
  };
}

describe('RealtimeService', () => {
  let service;

  beforeEach(() => {
    const metaApi = { getCampaignInsights: vi.fn() };
    const campaignsRepo = { findAll: vi.fn(() => ({ data: [] })) };
    service = new RealtimeService(metaApi, campaignsRepo);
  });

  it('broadcast sends to all connected open clients', () => {
    const ws1 = makeMockWs();
    const ws2 = makeMockWs();
    service.clients.add(ws1);
    service.clients.add(ws2);

    service._broadcast({ type: 'test', data: 'hello' });

    const payload = JSON.stringify({ type: 'test', data: 'hello' });
    expect(ws1.send).toHaveBeenCalledWith(payload);
    expect(ws2.send).toHaveBeenCalledWith(payload);
  });

  it('broadcast skips clients not in OPEN state', () => {
    const open = makeMockWs();
    const closed = makeMockWs();
    closed.readyState = 3; // CLOSED
    service.clients.add(open);
    service.clients.add(closed);

    service._broadcast({ type: 'test', data: 'x' });

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('getMetrics returns connected_clients count', () => {
    service.clients.add(makeMockWs());
    service.clients.add(makeMockWs());

    const result = service.getMetrics();
    expect(result.connected_clients).toBe(2);
  });

  it('attach registers connection and close handlers', () => {
    const mockServer = { on: vi.fn() };
    service.attach(mockServer);

    // Simulate a connection
    const ws = makeMockWs();
    const req = { socket: { remoteAddress: '127.0.0.1' } };
    service.wss.handlers.connection(ws, req);

    expect(service.clients.size).toBe(1);
    expect(ws.send).toHaveBeenCalled(); // snapshot sent

    // Simulate close
    const closeHandler = ws.on.mock.calls.find(c => c[0] === 'close')[1];
    closeHandler();
    expect(service.clients.size).toBe(0);
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

    it('falls back to the system meta when no owner token is bound', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) }, { platformAccountsRepo: acctRepo, settingsRepo });
      acctRepo.getByPlatform.mockReturnValue(null);
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([]);

      const api = service._metaApiForOwner({ id: 'c3', user_id: 'owner-3', platform: 'meta' });

      expect(api).toBe(metaApi);
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-3', 'meta');
    });

    it('falls back to system meta when no platformAccountsRepo is wired', () => {
      const metaApi = { getCampaignInsights: vi.fn() };
      const service = new RealtimeService(metaApi, { findAll: vi.fn(() => ({ data: [] })) });
      const api = service._metaApiForOwner({ id: 'c4', user_id: 'owner-4', platform: 'meta' });
      expect(api).toBe(metaApi);
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
  });
});
