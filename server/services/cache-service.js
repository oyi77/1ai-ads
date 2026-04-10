/**
 * Cache Service for Ads Library
 *
 * In-memory cache with TTL support. Uses a simple Map-based store
 * with periodic cleanup of expired entries. Designed to reduce
 * duplicate API calls and scraping requests.
 *
 * Cache keys follow the pattern: ads:{platform}:{query}:{optionsHash}
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('cache-service');

const DEFAULT_TTL = 3600 * 1000; // 1 hour in ms
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 1000;

export class CacheService {
  /**
   * @param {Object} options
   * @param {number} options.defaultTTL - Default TTL in milliseconds
   * @param {number} options.maxSize - Maximum number of entries
   * @param {number} options.cleanupInterval - Cleanup interval in milliseconds
   */
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || DEFAULT_TTL;
    this.maxSize = options.maxSize || MAX_CACHE_SIZE;
    this.cleanupInterval = options.cleanupInterval || CLEANUP_INTERVAL;
    this.store = new Map();
    this._cleanupTimer = null;
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };

    this._startCleanup();
  }

  /**
   * Build a cache key from platform, query, and options.
   *
   * @param {string} platform - Platform name (meta, google, tiktok)
   * @param {string} query - Search query
   * @param {Object} options - Additional cache-relevant options
   * @returns {string} Cache key
   */
  buildKey(platform, query, options = {}) {
    const optsStr = Object.entries(options)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `ads:${platform}:${query}:${optsStr}`;
  }

  /**
   * Get a cached value by key.
   *
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    log.debug('Cache hit', { key });
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL.
   *
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - TTL in milliseconds (uses default if not provided)
   */
  set(key, value, ttl) {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this._evictOldest();
    }

    const effectiveTTL = ttl != null ? ttl : this.defaultTTL;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTTL,
      createdAt: Date.now(),
    });
    this.stats.sets++;
    log.debug('Cache set', { key, ttl: effectiveTTL });
  }

  /**
   * Delete a cached value by key.
   *
   * @param {string} key - Cache key
   * @returns {boolean} Whether the key was found and deleted
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clear all cached entries matching a prefix.
   *
   * @param {string} prefix - Key prefix (e.g., 'ads:meta')
   * @returns {number} Number of entries cleared
   */
  clearByPrefix(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    log.info('Cleared cache by prefix', { prefix, count });
    return count;
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    const size = this.store.size;
    this.store.clear();
    log.info('Cache cleared', { previousSize: size });
  }

  /**
   * Get cache statistics.
   *
   * @returns {Object} Cache stats including hit rate
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.store.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Check if a key exists and is not expired.
   *
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get remaining TTL for a key in milliseconds.
   *
   * @param {string} key - Cache key
   * @returns {number|null} Remaining TTL or null if not found
   */
  getTTL(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Evict the oldest entry from the cache.
   * @private
   */
  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      this.stats.evictions++;
      log.debug('Evicted oldest cache entry', { key: oldestKey });
    }
  }

  /**
   * Start periodic cleanup of expired entries.
   * @private
   */
  _startCleanup() {
    if (this._cleanupTimer) return;

    this._cleanupTimer = setInterval(() => {
      let cleaned = 0;
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        log.debug('Cache cleanup completed', { cleaned, remaining: this.store.size });
      }
    }, this.cleanupInterval);

    // Don't prevent Node process from exiting
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer. Call this when shutting down.
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.store.clear();
    log.info('Cache service destroyed');
  }
}
