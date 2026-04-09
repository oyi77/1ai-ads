import { Router } from 'express';
import { getCompetitorData } from '../services/competitor-spy.js';
import { createLogger } from '../lib/logger.js';
const log = createLogger('competitor-spy');

export function createCompetitorSpyRouter(competitorsRepo) {
  const router = Router();

  // GET - list latest competitor snapshots
  router.get('/', async (req, res) => {
    try {
      const snapshots = competitorsRepo.findLatest();
      res.json({ success: true, data: snapshots });
    } catch (e) {
      log.error('Failed to fetch competitor snapshots', { message: e.message });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /:id - single snapshot
  router.get('/:id', (req, res) => {
    try {
      const snapshot = competitorsRepo.findById(req.params.id);
      if (!snapshot) return res.status(404).json({ success: false, error: 'Snapshot not found' });
      res.json({ success: true, data: snapshot });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST - add competitor URL and fetch data
  router.post('/', async (req, res) => {
    try {
      const { url, platform } = req.body;
      if (!url) return res.status(400).json({ success: false, error: 'url is required' });

      const adData = await getCompetitorData(url);
      const snapshot = competitorsRepo.create({ url, platform, adData, snapshotType: 'manual' });
      log.info('Competitor snapshot created', { url, id: snapshot.id });
      res.json({ success: true, data: snapshot });
    } catch (e) {
      log.error('Failed to create competitor snapshot', { message: e.message });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /refresh - refresh all tracked competitors
  router.post('/refresh', async (req, res) => {
    try {
      const latest = competitorsRepo.findLatest();
      const results = [];
      for (const snapshot of latest) {
        try {
          const adData = await getCompetitorData(snapshot.url);
          const newSnapshot = competitorsRepo.create({ url: snapshot.url, platform: snapshot.platform, adData, snapshotType: 'auto' });
          results.push(newSnapshot);
        } catch (e) {
          log.error('Failed to refresh competitor', { url: snapshot.url, error: e.message });
        }
      }
      log.info('Competitor refresh complete', { count: results.length });
      res.json({ success: true, data: results });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // DELETE /:url - remove all snapshots for a URL
  router.delete('/:url', (req, res) => {
    try {
      competitorsRepo.removeByUrl(decodeURIComponent(req.params.url));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /:competitorId/ads - Get active competitor ads
  router.get('/:competitorId/ads', async (req, res) => {
    try {
      const { competitorId } = req.params;
      const { platform } = req.query;

      const snapshots = competitorsRepo.findByUrl(competitorId);
      if (!snapshots || snapshots.length === 0) {
        return res.status(404).json({ success: false, error: 'No data found for this competitor' });
      }

      const latestSnapshot = snapshots[0];
      const ads = latestSnapshot.ad_data?.ads || [];

      const activeAds = platform
        ? ads.filter(ad => ad.status === 'active' && ad.platform === platform)
        : ads.filter(ad => ad.status === 'active');

      res.json({ success: true, data: activeAds, total: activeAds.length });
    } catch (e) {
      log.error('Failed to fetch competitor ads', { competitorId: req.params.competitorId, error: e.message });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // GET /:competitorId/metrics - Get performance metrics
  router.get('/:competitorId/metrics', async (req, res) => {
    try {
      const { competitorId } = req.params;

      const { CompetitorSpyService } = await import('../services/competitor-spy.js');
      const competitorSpyService = new CompetitorSpyService(competitorsRepo.db);
      const metrics = await competitorSpyService.getCompetitorMetrics(competitorId);

      if (!metrics.hasData) {
        return res.status(404).json({ success: false, error: metrics.message });
      }

      res.json({ success: true, data: metrics });
    } catch (e) {
      log.error('Failed to fetch competitor metrics', { competitorId: req.params.competitorId, error: e.message });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /:competitorId/analyze - Trigger strategy analysis
  router.post('/:competitorId/analyze', async (req, res) => {
    try {
      const { competitorId } = req.params;
      const { platform } = req.body || {};
      const userId = req.user?.id || 'anonymous';

      const { CompetitorSpyService } = await import('../services/competitor-spy.js');
      const { AdIntelligenceService } = await import('../services/ad-intelligence.js');

      const competitorSpyService = new CompetitorSpyService(
        competitorsRepo.db,
        new AdIntelligenceService()
      );

      const result = await competitorSpyService.monitorCompetitor(competitorId, userId, { platform });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      res.json({ success: true, data: result });
    } catch (e) {
      log.error('Failed to analyze competitor', { competitorId: req.params.competitorId, error: e.message });
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
