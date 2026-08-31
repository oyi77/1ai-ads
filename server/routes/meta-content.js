/**
 * Meta Content Routes
 *
 * Ported from content-generator: Facebook video upload + content scheduling
 * Mounted at: /api/meta/content
 *
 * Dependencies: MetaVideoService, ContentScheduler, requireAuth middleware
 */

import { Router } from 'express';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';

export function createMetaContentRouter(videoService, contentScheduler, platformAccountsRepo = null) {
  const router = Router();

  function userMetaToken(req) {
    const token = platformAccountsRepo
      ? resolveUserPlatformToken('meta', req, platformAccountsRepo, null)
      : null;
    if (!token) throw new ValidationError('Meta account not connected. Please connect your account in Settings.');
    return token;
  }

  // ─── Video Upload ─────────────────────────────────────────────────

  // POST /api/meta/content/video-upload — Upload video file buffer
  router.post('/video-upload', async (req, res) => {
    try {
      const { pageId, videoUrl, title, description, published } = req.body;

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'pageId is required' });
      }

      let result;
      const accessToken = userMetaToken(req);
      if (videoUrl) {
        // Upload from URL
        result = await videoService.uploadVideoFromUrl({
          pageId,
          videoUrl,
          title: title || '',
          description: description || '',
          published: published !== false,
          accessToken,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'videoUrl is required. For direct file upload, use multipart/form-data with field "file".',
        });
      }

      if (result.success) {
        res.json({ success: true, data: { videoId: result.videoId, permalinkUrl: result.permalinkUrl } });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Content Queue ────────────────────────────────────────────────

  // POST /api/meta/content/queue — Add content to posting queue
  router.post('/queue', async (req, res) => {
    try {
      const { pageId, filePath, caption, hashtags, hook, cta, scheduleAt, category, style, productDesc } = req.body;

      if (!pageId || !filePath) {
        return res.status(400).json({ success: false, error: 'pageId and filePath are required' });
      }

      const result = contentScheduler.queueContent({
        pageId,
        filePath,
        caption,
        hashtags,
        hook,
        cta,
        scheduleAt,
        category,
        style,
        productDesc,
        userId: req.user?.id,
      });

      if (result.success) {
        res.json({ success: true, data: { queueId: result.queueId } });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/meta/content/queue/process — Process pending queue items
  router.post('/queue/process', async (req, res) => {
    try {
      const { pageId } = req.body;
      const results = await contentScheduler.processQueue({ pageId });
      res.json({
        success: true,
        data: {
          processed: results.length,
          results,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/meta/content/queue — List queue items
  router.get('/queue', (req, res) => {
    try {
      const { status, limit = 50 } = req.query;
      const items = contentScheduler.getQueue(status || null, parseInt(limit, 10), req.user?.id);
      res.json({ success: true, data: items });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/meta/content/queue/status — Queue summary
  router.get('/queue/status', (_req, res) => {
    try {
      const status = contentScheduler.getQueueStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/meta/content/queue/:id — Cancel a pending item
  router.delete('/queue/:id', (req, res) => {
    try {
      const result = contentScheduler.cancelSchedule(req.params.id, req.user?.id);
      if (result.success) {
        res.json({ success: true, data: { cancelled: true } });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
