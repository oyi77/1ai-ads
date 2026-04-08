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

  return router;
}
