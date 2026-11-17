import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttributionService } from '../../../server/services/attribution-service.js';
import { ShopeeAdapter } from '../../../server/services/shopee-adapter.js';
import { AttributionRepository } from '../../../server/repositories/attribution.js';
import { createDatabase } from '../../../db/index.js';

describe('AttributionService', () => {
  let db, repo, adapter, service;

  beforeEach(() => {
    db = createDatabase(':memory:');
    repo = new AttributionRepository(db);
    adapter = new ShopeeAdapter();
    service = new AttributionService(repo, adapter);
  });

  describe('matchOrdersToAds', () => {
    it('matches orders to ads by product ID within 24h window', () => {
      const now = new Date();
      const orders = [
        { order_id: 'ORD-1', product_id: 'P1', revenue: 150000, created_at: now.toISOString() },
        { order_id: 'ORD-2', product_id: 'P2', revenue: 200000, created_at: now.toISOString() },
      ];
      const adClicks = [
        { ad_id: 'ad-1', campaign_id: 'camp-1', product_id: 'P1', clicked_at: new Date(now.getTime() - 3600_000).toISOString() },
        { ad_id: 'ad-2', campaign_id: 'camp-1', product_id: 'P3', clicked_at: new Date(now.getTime() - 3600_000).toISOString() },
      ];

      const matches = service.matchOrdersToAds(orders, adClicks);
      expect(matches).toHaveLength(1);
      expect(matches[0].ad_id).toBe('ad-1');
      expect(matches[0].shopee_order_id).toBe('ORD-1');
      expect(matches[0].shopee_revenue).toBe(150000);
      expect(matches[0].match_method).toBe('product_time');
    });

    it('returns empty for orders outside 24h window', () => {
      const now = new Date();
      const orders = [
        { order_id: 'ORD-1', product_id: 'P1', revenue: 100, created_at: now.toISOString() },
      ];
      const adClicks = [
        { ad_id: 'ad-1', campaign_id: 'camp-1', product_id: 'P1', clicked_at: new Date(now.getTime() - 25 * 3600_000).toISOString() },
      ];

      const matches = service.matchOrdersToAds(orders, adClicks);
      expect(matches).toHaveLength(0);
    });

    it('returns empty for empty inputs', () => {
      expect(service.matchOrdersToAds([], [])).toEqual([]);
      expect(service.matchOrdersToAds(null, [])).toEqual([]);
      expect(service.matchOrdersToAds([], null)).toEqual([]);
    });

    it('matches multiple orders to different ads', () => {
      const now = new Date();
      const orders = [
        { order_id: 'ORD-1', product_id: 'P1', revenue: 100, created_at: now.toISOString() },
        { order_id: 'ORD-2', product_id: 'P2', revenue: 200, created_at: now.toISOString() },
      ];
      const adClicks = [
        { ad_id: 'ad-1', campaign_id: 'c1', product_id: 'P1', clicked_at: new Date(now.getTime() - 1000).toISOString() },
        { ad_id: 'ad-2', campaign_id: 'c1', product_id: 'P2', clicked_at: new Date(now.getTime() - 1000).toISOString() },
      ];

      const matches = service.matchOrdersToAds(orders, adClicks);
      expect(matches).toHaveLength(2);
    });
  });
});

describe('ShopeeAdapter - circuit breaker', () => {
  let adapter;

  beforeEach(() => {
    adapter = new ShopeeAdapter('http://localhost:99999');
  });

  it('opens circuit after 5 failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    for (let i = 0; i < 5; i++) {
      await adapter.fetchOrders({ force: true });
    }
    expect(adapter.getCircuitState()).toBe('open');

    vi.restoreAllMocks();
  });

  it('transitions to half-open after timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    for (let i = 0; i < 5; i++) {
      await adapter.fetchOrders({ force: true });
    }
    expect(adapter.getCircuitState()).toBe('open');

    vi.advanceTimersByTime(61_000);
    expect(adapter.getCircuitState()).toBe('half-open');

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns cached data when circuit is open', async () => {
    adapter._cache = [{ order_id: 'cached' }];
    adapter._cacheTs = Date.now();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    for (let i = 0; i < 5; i++) {
      await adapter.fetchOrders({ force: true });
    }
    expect(adapter.getCircuitState()).toBe('open');
    expect(await adapter.fetchOrders({ force: true })).toEqual([{ order_id: 'cached' }]);
    vi.restoreAllMocks();
  });

  it('uses cache within TTL', async () => {
    adapter._cache = [{ order_id: 'cached' }];
    adapter._cacheTs = Date.now();
    expect(await adapter.fetchOrders()).toEqual([{ order_id: 'cached' }]);
  });
});

// DEF-07 (audit 2026-11-17): _buildAdClicks used ads.created_at (ad birth)
// as a click timestamp. It now reads the ad_clicks table (migration 054) and
// returns [] when no real clicks exist — never fabricates timestamps.
describe('AttributionService._buildAdClicks (DEF-07)', () => {
  let repo, service;

  beforeEach(() => {
    repo = new AttributionRepository(createDatabase(':memory:'));
    service = new AttributionService(repo, new ShopeeAdapter());
  });

  it('returns [] with no recorded clicks (no fabricated created_at)', () => {
    expect(service._buildAdClicks({ campaign_id: 'camp-1' })).toEqual([]);
  });

  it('reads genuine clicks from ad_clicks, scoped by campaign and product', () => {
    const t = new Date().toISOString();
    repo.recordClick({ ad_id: 'ad-1', campaign_id: 'camp-1', product_id: 'P1', clicked_at: t });
    repo.recordClick({ ad_id: 'ad-2', campaign_id: 'camp-2', product_id: 'P1', clicked_at: t });

    const clicks = service._buildAdClicks({ campaign_id: 'camp-1', product_id: 'P1' });
    expect(clicks).toHaveLength(1);
    expect(clicks[0].ad_id).toBe('ad-1');
    expect(clicks[0].clicked_at).toBe(t);
  });

  it('rejects clicks without ad_id or clicked_at', () => {
    expect(() => repo.recordClick({ campaign_id: 'camp-1' })).toThrow(/ad_id and clicked_at/);
  });
});
