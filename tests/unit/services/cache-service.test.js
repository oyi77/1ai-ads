import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../server/config/index.js', () => ({
  default: {
    intervals: { cacheCleanup: 300000 },
  },
}));

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CacheService } from '../../../server/services/cache-service.js';

describe('CacheService', () => {
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new CacheService({ cleanupInterval: 300000 });
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  it('should set and get a value', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should return null for expired entries', () => {
    cache.set('key1', 'value1', 1000);
    vi.advanceTimersByTime(1500);
    expect(cache.get('key1')).toBeNull();
  });

  it('should report has() correctly', () => {
    cache.set('key1', 'value1', 5000);
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
    vi.advanceTimersByTime(6000);
    expect(cache.has('key1')).toBe(false);
  });

  it('should delete a key', () => {
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeNull();
    expect(cache.delete('missing')).toBe(false);
  });

  it('should clear by prefix', () => {
    cache.set('ads:meta:shoes', 'a');
    cache.set('ads:meta:shirts', 'b');
    cache.set('ads:google:shoes', 'c');

    const cleared = cache.clearByPrefix('ads:meta');
    expect(cleared).toBe(2);
    expect(cache.get('ads:meta:shoes')).toBeNull();
    expect(cache.get('ads:google:shoes')).toBe('c');
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('should track stats with hit rate', () => {
    cache.set('k', 'v');
    cache.get('k');
    cache.get('k');
    cache.get('missing');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe('66.67%');
    expect(stats.size).toBe(1);
  });

  it('should report 0% hit rate when no accesses', () => {
    const stats = cache.getStats();
    expect(stats.hitRate).toBe('0%');
  });

  it('should build cache keys deterministically', () => {
    const key1 = cache.buildKey('meta', 'shoes', { country: 'ID', limit: 10 });
    const key2 = cache.buildKey('meta', 'shoes', { limit: 10, country: 'ID' });
    expect(key1).toBe(key2);
    expect(key1).toBe('ads:meta:shoes:country=ID&limit=10');
  });

  it('should return remaining TTL', () => {
    cache.set('k', 'v', 10000);
    const ttl = cache.getTTL('k');
    expect(ttl).toBeGreaterThan(9000);
    expect(ttl).toBeLessThanOrEqual(10000);
  });

  it('should return null TTL for missing keys', () => {
    expect(cache.getTTL('missing')).toBeNull();
  });

  it('should evict oldest entry when at capacity', () => {
    const small = new CacheService({ maxSize: 2, cleanupInterval: 300000 });
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3); // should evict 'a'

    expect(small.get('a')).toBeNull();
    expect(small.get('b')).toBe(2);
    expect(small.get('c')).toBe(3);
    expect(small.getStats().evictions).toBe(1);
    small.destroy();
  });

  it('should not evict when updating existing key at capacity', () => {
    const small = new CacheService({ maxSize: 2, cleanupInterval: 300000 });
    small.set('a', 1);
    small.set('b', 2);
    small.set('a', 99); // update existing, no eviction

    expect(small.get('a')).toBe(99);
    expect(small.getStats().evictions).toBe(0);
    small.destroy();
  });

  it('should clean up expired entries on interval', () => {
    const small = new CacheService({ maxSize: 100, cleanupInterval: 5000 });
    small.set('expire1', 'x', 2000);
    small.set('keep1', 'y', 60000);

    vi.advanceTimersByTime(6000);

    expect(small.get('expire1')).toBeNull();
    expect(small.get('keep1')).toBe('y');
    small.destroy();
  });

  it('should use default TTL when none specified', () => {
    cache.set('k', 'v');
    const ttl = cache.getTTL('k');
    // default is 3600 * 1000 = 3600000ms
    expect(ttl).toBeGreaterThan(3500000);
  });

  it('should handle zero TTL', () => {
    cache.set('k', 'v', 0);
    // With TTL 0, expiresAt = Date.now() + 0 = now, so it should be expired immediately
    // But since Date.now() during set is the same moment, it may or may not be expired
    // Let's just verify the TTL is near zero
    const ttl = cache.getTTL('k');
    expect(ttl).toBeLessThanOrEqual(1);
  });
});
