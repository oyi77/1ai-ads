import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export function createApprovalsRouter(deps) {
  const router = Router();
  const { services } = deps;
  const draftService = services.draftService;
  const settingsRepo = deps.repos.settingsRepo;

  // ── Admin API ────────────────────────────────────────────────
  router.get('/api/approvals', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status = 'pending', page = 1, limit = 50 } = req.query;
      const drafts = await draftService.listDrafts(status, { page: +page, limit: +limit });
      const formatted = drafts.data.map(d => ({
        id: d.id,
        type: d.type,
        summary: d.summary,
        status: d.status,
        details: d.details_json ? JSON.parse(d.details_json) : null,
        proposedBy: d.proposed_by,
        campaignId: d.campaign_id,
        approvalRequestId: d.approval_request_id,
        createdAt: d.created_at,
      }));
      res.json({ success: true, data: formatted, total: drafts.total, page: drafts.page, limit: drafts.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/approvals/setting', requireAuth, requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const value = body.approval_required === true || body.approval_required === 'true' || body.approval_required === 1 ||
                    body.enabled === true || body.enabled === 'true' || body.enabled === 1;
      settingsRepo.setApprovalRequired(value);
      res.json({ success: true, data: { approval_required: value } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/api/approvals/setting', requireAuth, requireAdmin, async (req, res) => {
    try {
      res.json({ success: true, data: { approval_required: settingsRepo.getApprovalRequired() } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  router.post('/api/approvals/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const draft = await draftService.approveDraft(req.params.id, req.user.id, req.body?.executionResult || null);
      res.json({ success: true, data: draft });
    } catch (err) {
      const code = err.name === 'NotFoundError' || err.name === 'ValidationError' ? 400 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  router.post('/api/approvals/:id/reject', requireAuth, requireAdmin, async (req, res) => {
    try {
      const draft = await draftService.rejectDraft(req.params.id, req.user.id, req.body?.rejectionReason || null);
      res.json({ success: true, data: draft });
    } catch (err) {
      const code = err.name === 'NotFoundError' || err.name === 'ValidationError' ? 400 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  // ── Server-rendered page (mounted before SPA fallback) ───────
  router.get('/approvals', requireAuth, requireAdmin, (req, res) => {
    res.render('pages/approvals', {
      layout: 'layouts/base',
      activePage: 'approvals',
      pageTitle: 'Approvals',
      breadcrumb: 'Operations · Approvals',
      title: 'Approvals',
      username: req.user?.username || '',
    });
  });

  return router;
}
