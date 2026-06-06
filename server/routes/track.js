import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('track-route');

export function createTrackRouter(repo, utmTagger) {
  const router = Router();

  router.get('/:ad_id', (req, res) => {
    try {
      const { ad_id } = req.params;
      log.info('track click', { ad_id });
      const record = repo.getByAdId(ad_id);
      if (!record) {
        return res.status(404).json({ error: 'ad not found' });
      }
      repo.incrementClicks(ad_id);
      const redirectUrl = utmTagger.buildRedirectUrl(record);
      return res.redirect(302, redirectUrl);
    } catch (e) {
      log.error('track error', { error: e.message });
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}
