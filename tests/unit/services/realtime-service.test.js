import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeService } from '../../../server/services/realtime-service.js';

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
    const campaignsRepo = { getAll: vi.fn(() => []) };
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
    const mockServer = {};
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
});
