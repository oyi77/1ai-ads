import { Router } from 'express';

export function createInvoicesRouter(invoicesRepo) {
  const router = Router();

  // List invoices
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || 'system';
      const { status, page = 1, limit = 50 } = req.query;
      const pg = Number(page) || 1;
      const lim = Number(limit) || 50;
      const result = invoicesRepo.findAll({ userId, status, page: pg, limit: lim });
      res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get single invoice
  router.get('/:id', async (req, res) => {
    try {
      const inv = invoicesRepo.findById(req.params.id, req.user?.id);
      if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
      res.json({ success: true, data: inv });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create/generate invoice
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.id || 'system';
      const { amount, description, lineItems } = req.body;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ success: false, error: 'amount must be a positive number' });
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const invoice = invoicesRepo.create({
        userId, amount: amt, description, lineItems: lineItems || [], dueDate,
      });
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Mark invoice as paid
  router.post('/:id/paid', async (req, res) => {
    try {
      const inv = invoicesRepo.updateStatus(req.params.id, 'paid', { paidAt: new Date().toISOString() }, req.user?.id);
      if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
      res.json({ success: true, data: inv });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Cancel invoice
  router.post('/:id/cancel', async (req, res) => {
    try {
      const inv = invoicesRepo.updateStatus(req.params.id, 'cancelled', {}, req.user?.id);
      if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
      res.json({ success: true, data: inv });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
