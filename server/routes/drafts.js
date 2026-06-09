import { Router } from 'express';

export function createDraftRouter(draftService) {
  const router = Router();

  // List drafts
  router.get('/', async (req, res) => {
    try {
      const status = req.query.status || 'pending';
      const drafts = await draftService.listDrafts(status);
      res.json({ success: true, data: drafts });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Create draft
  router.post('/', async (req, res) => {
    try {
      const { type, summary, details, proposedBy } = req.body;
      const draft = await draftService.createDraft({ type, summary, details, proposedBy });
      res.status(201).json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Approve draft
  router.post('/:id/approve', async (req, res) => {
    try {
      const { executionResult } = req.body;
      const draft = await draftService.approveDraft(req.params.id, req.user?.id, executionResult);
      res.json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Reject draft
  router.post('/:id/reject', async (req, res) => {
    try {
      const { rejectionReason } = req.body;
      const draft = await draftService.rejectDraft(req.params.id, req.user?.id, rejectionReason);
      res.json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}
