import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export function createDraftRouter(draftService) {
  const router = Router();

  // List drafts
  router.get('/', async (req, res) => {
    try {
      const { status: filterStatus, page = 1, limit = 50 } = req.query;
      // Multi-tenant: non-admin users see ONLY their own drafts.
      const isAdmin = req.user?.role === 'admin';
      const result = await draftService.listDrafts(filterStatus || 'pending', {
        page: +page,
        limit: +limit,
        ...(isAdmin ? {} : { userId: req.user?.id }),
      });
      const data = result.data.map(d => ({
        id: d.id,
        name: d.summary,
        type: d.type,
        content: d.details_json ? JSON.parse(d.details_json) : {},
        status: d.status,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
      res.json({ success: true, data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });


  // Create draft
  router.post('/', async (req, res) => {
    try {
      const { type, summary, details, proposedBy } = req.body;
      const draft = await draftService.createDraft({ type, summary, details, proposedBy, userId: req.user?.id || null });
      res.status(201).json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Approve draft
  // Approve draft (admin only)
  router.post('/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { executionResult } = req.body || {};
      const draft = await draftService.approveDraft(req.params.id, req.user.id, executionResult);
      res.json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Reject draft
  // Reject draft (admin only)
  router.post('/:id/reject', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { rejectionReason } = req.body;
      const draft = await draftService.rejectDraft(req.params.id, req.user.id, rejectionReason);
      res.json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}
