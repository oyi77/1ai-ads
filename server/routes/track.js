import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('track-route');

// Per-IP fixed-window click limiter. The track endpoint is a public redirect
// that also does a DB write (incrementClicks); without a cap a client can
// hammer it for click-fraud and write amplification. 20 clicks/min/IP is far
// above any real user, far below abuse.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const clickWindow = new Map(); // ip -> number[]

function allowClick(ip) {
  const now = Date.now();
  const arr = (clickWindow.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    clickWindow.set(ip, arr);
    return false;
  }
  arr.push(now);
  clickWindow.set(ip, arr);
  // Opportunistically bound the map size
  if (clickWindow.size > 10000) {
    for (const [k] of clickWindow) {
      if (clickWindow.size <= 5000) break;
      clickWindow.delete(k);
    }
  }
  return true;
}

export function createTrackRouter(repo, utmTagger) {
  const router = Router();

  router.get('/:ad_id', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!allowClick(ip)) {
      return res.status(429).json({ error: 'Too many requests' });
    }
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
