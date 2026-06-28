import { Router } from 'express';

export function createAgencyRouter(whiteLabelService) {
  const router = Router();

  router.get('/clients', (req, res) => {
    try {
      const data = whiteLabelService.getClients(req.user?.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients', (req, res) => {
    try {
      const data = whiteLabelService.createClient({ agencyId: req.user?.id, ...req.body });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/clients/:id', (req, res) => {
    try {
      const data = whiteLabelService.updateClient(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/clients/:id', (req, res) => {
    try {
      whiteLabelService.deleteClient(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/clients/:id/reports', (req, res) => {
    try {
      const data = whiteLabelService.getReports({ clientId: req.params.id, agencyId: req.user?.id });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/clients/:id/reports', async (req, res) => {
    try {
      const data = await whiteLabelService.generateReport({ clientId: req.params.id, agencyId: req.user?.id, ...req.body });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
