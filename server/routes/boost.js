/**
 * Boost recommendations routes.
 * Mounted at /api/boost by createRouters().
 */
import { Router } from 'express';

export function createBoostRouter({ services }) {
  const router = Router();
  const svc = services.boostApproval;
  const targeting = services.targeting;

  // ── POST /api/boost/recommend ─────────────────────────────────
  // Body: { post_id, page_id, metrics?, target_audience_json? }
  router.post('/recommend', async (req, res) => {
    const { post_id, page_id, metrics, target_audience_json } = req.body ?? {};
    if (!post_id || !page_id) {
      return res.status(400).json({ success: false, error: 'post_id and page_id are required' });
    }
    try {
      const rec = await svc.recommend({ post_id, page_id, metrics, target_audience_json });
      return res.json({ success: true, data: rec });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/boost/queue?status=pending ───────────────────────
  router.get('/queue', (req, res) => {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const recs = svc.list(status || null, { limit: Number(limit), offset: Number(offset) });
    return res.json({ success: true, data: recs, count: recs.length });
  });

  // ── GET /api/boost/:id ────────────────────────────────────────
  router.get('/:id', (req, res) => {
    const rec = svc.getById(Number(req.params.id));
    if (!rec) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, data: rec });
  });

  // ── POST /api/boost/:id/approve ───────────────────────────────
  router.post('/:id/approve', (req, res) => {
    const rec = svc.getById(Number(req.params.id));
    if (!rec) return res.status(404).json({ success: false, error: 'Not found' });
    const updated = svc.approve(Number(req.params.id), req.body?.reviewed_by ?? 'api');
    return res.json({ success: true, data: updated });
  });

  // ── POST /api/boost/:id/reject ────────────────────────────────
  router.post('/:id/reject', (req, res) => {
    const rec = svc.getById(Number(req.params.id));
    if (!rec) return res.status(404).json({ success: false, error: 'Not found' });
    const updated = svc.reject(Number(req.params.id), req.body?.reviewed_by ?? 'api');
    return res.json({ success: true, data: updated });
  });

  // ── POST /api/boost/telegram-webhook ─────────────────────────
  // Receives Telegram bot updates; handles /boost_approve_N and /boost_reject_N commands.
  router.post('/telegram-webhook', async (req, res) => {
    const text = req.body?.message?.text ?? req.body?.callback_query?.data ?? '';
    try {
      const result = await svc.handleTelegramCommand(text);
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/boost/targeting/suggest ─────────────────────────
  // Body: { post_id, page_id, category? }
  router.post('/targeting/suggest', (req, res) => {
    const { post_id, page_id, category } = req.body ?? {};
    if (!post_id || !page_id) {
      return res.status(400).json({ success: false, error: 'post_id and page_id are required' });
    }
    try {
      const suggestion = targeting.suggest({ post_id, page_id, category });
      return res.json({ success: true, data: suggestion });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/boost/targeting/:post_id/:page_id ────────────────
  router.get('/targeting/:post_id/:page_id', (req, res) => {
    try {
      const suggestion = targeting.getOrSuggest(req.params.post_id, req.params.page_id);
      return res.json({ success: true, data: suggestion });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/boost/targeting/patterns?page_id=&days= ─────────
  router.get('/targeting/patterns', (req, res) => {
    const { page_id, days = 30 } = req.query;
    try {
      const result = targeting.analyzeEngagementPatterns({ page_id: page_id || null, days: Number(days) });
      return res.json({ success: true, data: result });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/boost/targeting?limit=&offset= ───────────────────
  router.get('/targeting', (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    try {
      const suggestions = targeting.listAll({ limit: Number(limit), offset: Number(offset) });
      return res.json({ success: true, data: suggestions, count: suggestions.length });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
