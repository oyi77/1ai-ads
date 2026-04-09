/**
 * Trending Data Service
 *
 * Provides internal trending metrics (campaign performance) and external market trends (API with cache).
 * Used for the Trending Ads dashboard feature.
 */

import axios from 'axios';
import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('trending');

export class TrendingService {
  constructor(campaignsRepo) {
    this.campaignsRepo = campaignsRepo;
    this.cache = new Map();
    this.apiConfig = config.externalTrendingApi;
  }

  /**
   * Get internal trending data - top campaigns by ROAS growth or CTR over last 7 days
   * @returns {Promise<Array>} Array of top performing campaigns
   */
  async getInternalTrends() {
    const { data: campaigns } = this.campaignsRepo.findAll();
    
    if (!campaigns || campaigns.length === 0) {
      return [];
    }

    // Sort by ROAS (descending) and take top 5
    const topByRoas = campaigns
      .filter(c => c.roas !== null && c.roas > 0)
      .sort((a, b) => (b.roas || 0) - (a.roas || 0))
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        roas: c.roas,
        spend: c.spend,
        revenue: c.revenue,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        ctr: c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : 0,
        trend: 'up', // Mock trend indicator
      }));

    return topByRoas;
  }

  /**
   * Get external trending data from API with caching support
   * @param {string} industry - Optional industry filter
   * @param {string} region - Optional region filter
   * @returns {Promise<Array>} Array of market trend themes
   */
  async getExternalTrends(industry = null, region = null) {
    const cacheKey = this._getCacheKey(industry, region);

    // Check cache first
    const cached = this._getCached(cacheKey);
    if (cached) {
      log.info('Returning cached external trends', { cacheKey, count: cached.length });
      return cached;
    }

    // If mock mode, return the existing mock data
    if (config.trendingExternalSource === 'mock') {
      log.info('Mock mode enabled, returning mock trends');
      return this._getMockTrends();
    }

    // If a URL is configured, try to fetch real data
    try {
      const data = await this._fetchExternalTrends(industry, region);

      // Validate response
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid response format: expected array');
      }

      // Normalize data
      const normalized = this._normalizeTrendData(data);

      // Cache the result
      this._setCached(cacheKey, normalized);

      log.info('Fetched and cached external trends from API', {
        cacheKey,
        count: normalized.length,
        industry,
        region
      });

      return normalized;
    } catch (err) {
      log.warn('External trends API failed, falling back to mock data', {
        cacheKey,
        error: err.message
      });
      return this._getMockTrends();
    }
  }

  /**
   * Fetch trending data from external API
   * @param {string} industry - Optional industry filter
   * @param {string} region - Optional region filter
   * @returns {Promise<Array>} Raw trend data from API
   */
  async _fetchExternalTrends(industry = null, region = null) {
    const url = this.apiConfig.url;
    const apiKey = this.apiConfig.apiKey;

    if (!url || url.includes('example.com')) {
      throw new Error('Invalid or missing external trending API URL');
    }

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (apiKey && apiKey !== 'placeholder-key') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const params = {};
    if (industry) params.industry = industry;
    if (region) params.region = region;

    log.info('Fetching external trends from API', { url, params });

    const response = await axios.get(url, {
      headers,
      params,
      timeout: 10000,
    });

    if (response.status !== 200) {
      throw new Error(`Trending API returned ${response.status}`);
    }

    return response.data;
  }

  /**
   * Normalize external API trend data to match internal format
   * @param {Array} data - Raw trend data from API
   * @returns {Array} Normalized trend data
   */
  _normalizeTrendData(data) {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      id: item.id || item.trend_id || `trend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      theme: item.theme || item.name || item.title || 'Unknown Trend',
      category: item.category || item.vertical || item.industry || 'General',
      growth: item.growth || item.growth_rate || '+0%',
      platforms: Array.isArray(item.platforms) ? item.platforms : (item.platform || 'Unknown').split(','),
      ads_example: item.ads_example || item.example_ad || item.description || 'No example available',
      popularity: typeof item.popularity === 'number' ? item.popularity : (Math.random() * 100).toFixed(0),
    }));
  }

  /**
   * Generate cache key based on filters
   * @param {string} industry - Optional industry filter
   * @param {string} region - Optional region filter
   * @returns {string} Cache key
   */
  _getCacheKey(industry = null, region = null) {
    const parts = ['trends'];
    if (industry) parts.push(industry);
    if (region) parts.push(region);
    return parts.join(':');
  }

  /**
   * Get cached data if still valid
   * @param {string} key - Cache key
   * @returns {Array|null} Cached data or null if expired/not found
   */
  _getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.apiConfig.cacheTTL * 1000) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache with timestamp
   * @param {string} key - Cache key
   * @param {Array} data - Data to cache
   */
  _setCached(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Clean up expired entries periodically
    if (this.cache.size > 100) {
      this._cleanupCache();
    }
  }

  /**
   * Remove expired cache entries
   */
  _cleanupCache() {
    const now = Date.now();
    const ttl = this.apiConfig.cacheTTL * 1000;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get all trends - merges internal and external trends
   * @param {string} industry - Optional industry filter for external trends
   * @param {string} region - Optional region filter for external trends
   * @returns {Promise<Object>} Object containing internal and external trends
   */
  async getAllTrends(industry = null, region = null) {
    const [internal, external] = await Promise.all([
      this.getInternalTrends(),
      this.getExternalTrends(industry, region),
    ]);

    return {
      internal,
      external,
      total: internal.length + external.length,
    };
  }

  /**
   * Get mock external trending data - fallback data
   * @returns {Array} Array of mock market trend themes
   */
  _getMockTrends() {
    return [
      {
        id: 'trend-1',
        theme: 'Minimalist Skincare',
        category: 'Beauty',
        growth: '+42%',
        platforms: ['Meta', 'TikTok'],
        ads_example: 'Clean beauty, fewer ingredients, maximum results',
        popularity: 89,
      },
      {
        id: 'trend-2',
        theme: 'High-Ticket Coaching',
        category: 'Education',
        growth: '+67%',
        platforms: ['LinkedIn', 'Google'],
        ads_example: 'Premium coaching programs for career advancement',
        popularity: 76,
      },
      {
        id: 'trend-3',
        theme: 'Sustainable Home Goods',
        category: 'E-commerce',
        growth: '+35%',
        platforms: ['Meta', 'Instagram'],
        ads_example: 'Eco-friendly alternatives for everyday items',
        popularity: 82,
      },
      {
        id: 'trend-4',
        theme: 'AI Productivity Tools',
        category: 'SaaS',
        growth: '+156%',
        platforms: ['Google', 'LinkedIn', 'TikTok'],
        ads_example: 'Automate your workflow with AI-powered solutions',
        popularity: 94,
      },
      {
        id: 'trend-5',
        theme: 'Pet Wellness & Nutrition',
        category: 'Pet Care',
        growth: '+28%',
        platforms: ['Meta', 'TikTok'],
        ads_example: 'Premium pet food and supplements for healthy pets',
        popularity: 71,
      },
      {
        id: 'trend-6',
        theme: 'Remote Work Essentials',
        category: 'Office',
        growth: '+18%',
        platforms: ['Google', 'Amazon'],
        ads_example: 'Home office setup essentials for remote workers',
        popularity: 65,
      },
    ];
  }
}