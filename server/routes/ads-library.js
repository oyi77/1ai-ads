/**
 * Unified Ads Library API Routes
 *
 * Provides REST API endpoints for the multi-platform ads library service.
 * Routes are prefixed with /api/ads-library.
 *
 * Endpoints:
 * - GET /search - Search ads across all or specific platforms
 * - GET /sources - Get available data sources per platform
 * - GET /ad/:id - Get details for a specific ad
 * - GET /stats - Get platform statistics and cache status
 * - DELETE /cache - Clear cache (optionally by platform)
 */

import { Router } from 'express';
import config from '../config/index.js';
import { createUnifiedAdsLibraryService } from '../services/unified-ads-library.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ads-library-routes');

// Create service instance
const adsLibraryService = createUnifiedAdsLibraryService();

export function createAdsLibraryRoutes() {
  const router = Router();

  /**
   * GET /api/ads-library/search
   *
   * Search for ads across one or all platforms.
   *
   * Query params:
   * - q: Search query (required)
   * - platform: Platform filter ('meta', 'google', 'tiktok', 'all') (default: 'all')
   * - source: Data source ('api', 'scrape', 'auto') (default: 'auto')
   * - country: Country code (default: 'US')
   * - adStatus: Ad status filter ('ACTIVE', 'INACTIVE', 'ALL') (default: 'ALL')
   * - mediaType: Media type filter ('IMAGE', 'VIDEO', 'ALL')
   * - adType: Ad type filter
   * - limit: Max results per platform (default: 50)
   * - cursor: Pagination cursor for next page
   */
  router.get('/search', async (req, res) => {
    try {
      const queryParams = req.query;
      const query = queryParams.q;
      const platform = queryParams.platform || 'all';
      const source = queryParams.source || 'auto';
      const country = queryParams.country || 'US';
      const adStatus = queryParams.adStatus || 'ALL';
      const mediaType = queryParams.mediaType;
      const adType = queryParams.adType;
      const cursor = queryParams.cursor;
      const limit = parseInt(queryParams.limit || '50', 10);

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required',
        });
      }

      // Validate platform
      const validPlatforms = ['all', 'meta', 'google', 'tiktok'];
      if (!validPlatforms.includes(platform.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform: ${platform}. Valid: ${validPlatforms.join(', ')}`,
        });
      }

      // Validate source
      const validSources = ['api', 'scrape', 'auto'];
      if (!validSources.includes(source.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid source: ${source}. Valid: ${validSources.join(', ')}`,
        });
      }

      // Validate limit
      if (isNaN(limit) || limit < 1 || limit > 500) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be between 1 and 500',
        });
      }

      const result = await adsLibraryService.search(query, {
        platform: platform.toLowerCase(),
        source: source.toLowerCase(),
        country: country.toUpperCase(),
        activeStatus: adStatus.toUpperCase(),
        mediaType,
        adType,
        limit,
        cursor,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Search endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.nodeEnv === 'development' ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/ads-library/sources
   *
   * Get available data sources for all or a specific platform.
   *
   * Query params:
   * - platform: Platform filter ('meta', 'google', 'tiktok') (optional)
   */
  router.get('/sources', async (req, res) => {
    try {
      const platformParam = req.query.platform;

      const validPlatforms = ['meta', 'google', 'tiktok'];
      if (platformParam && !validPlatforms.includes(platformParam.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform: ${platformParam}. Valid: ${validPlatforms.join(', ')}`,
        });
      }

      const sources = await adsLibraryService.getSources(
        platformParam ? platformParam.toLowerCase() : null
      );

      res.json({
        success: true,
        data: sources,
      });
    } catch (error) {
      log.error('Sources endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.nodeEnv === 'development' ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/ads-library/ad/:id
   *
   * Get detailed information about a specific ad.
   *
   * URL params:
   * - id: Ad identifier
   *
   * Query params:
   * - platform: Platform name ('meta', 'google', 'tiktok') (optional, inferred from id format)
   */
  router.get('/ad/:id', async (req, res) => {
    try {
      const adId = req.params.id;
      const platform = req.query.platform;

      if (!adId) {
        return res.status(400).json({
          success: false,
          error: 'Ad ID is required',
        });
      }

      const inferredPlatform = platform || 'meta';
      const validPlatforms = ['meta', 'google', 'tiktok'];

      if (!validPlatforms.includes(inferredPlatform.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform: ${inferredPlatform}. Valid: ${validPlatforms.join(', ')}`,
        });
      }

      const result = await adsLibraryService.getAdDetails(inferredPlatform.toLowerCase(), adId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      log.error('Ad details endpoint error', { error: error.message, adId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.nodeEnv === 'development' ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/ads-library/stats
   *
   * Get platform statistics and cache status.
   */
  router.get('/stats', async (_req, res) => {
    try {
      const stats = await adsLibraryService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      log.error('Stats endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.nodeEnv === 'development' ? error.message : undefined,
      });
    }
  });

  /**
   * DELETE /api/ads-library/cache
   *
   * Clear cache for a specific platform or all platforms.
   *
   * Query params:
   * - platform: Platform filter ('meta', 'google', 'tiktok') (optional)
   */
  router.delete('/cache', async (req, res) => {
    try {
      const platform = req.query.platform;

      const validPlatforms = ['meta', 'google', 'tiktok'];
      if (platform && !validPlatforms.includes(platform.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform: ${platform}. Valid: ${validPlatforms.join(', ')}`,
        });
      }

      adsLibraryService.clearCache(
        platform ? platform.toLowerCase() : null
      );

      res.json({
        success: true,
        data: {
          cleared: true,
          platform: platform || 'all',
        },
      });
    } catch (error) {
      log.error('Cache clear endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.nodeEnv === 'development' ? error.message : undefined,
      });
    }
  });

  return router;
}

