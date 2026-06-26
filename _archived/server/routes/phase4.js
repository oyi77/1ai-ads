import { Router } from 'express';

// ── Agency / White-Label Router ──────────────────────────────

export function createAgencyRouter(whiteLabelService) {
  const router = Router();

  // ── Client CRUD ──────────────────────────────────────────────

  // List clients for the current agency
  router.get('/clients', async (req, res) => {
    try {
      const agencyId = req.user?.id || req.userId;
      const result = whiteLabelService.getClients(agencyId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get a single client
  router.get('/clients/:id', async (req, res) => {
    try {
      const client = whiteLabelService.getClient(req.params.id);
      if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
      res.json({ success: true, data: client });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create a client
  router.post('/clients', async (req, res) => {
    try {
      const agencyId = req.user?.id || req.userId;
      const { name, company, email, logoUrl, brandColor } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = whiteLabelService.createClient({ agencyId, name, company, email, logoUrl, brandColor });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update a client
  router.put('/clients/:id', async (req, res) => {
    try {
      const result = whiteLabelService.updateClient(req.params.id, req.body);
      if (!result) return res.status(404).json({ success: false, error: 'Client not found' });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete a client
  router.delete('/clients/:id', async (req, res) => {
    try {
      whiteLabelService.deleteClient(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Reports ──────────────────────────────────────────────────

  // List reports
  router.get('/reports', async (req, res) => {
    try {
      const agencyId = req.user?.id || req.userId;
      const { clientId, limit } = req.query;
      const result = whiteLabelService.getReports({
        clientId: clientId || undefined,
        agencyId: clientId ? undefined : agencyId,
        limit: limit ? parseInt(limit, 10) : 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Generate a report
  router.post('/reports', async (req, res) => {
    try {
      const agencyId = req.user?.id || req.userId;
      const { clientId, type, data } = req.body;
      if (!clientId) {
        return res.status(400).json({ success: false, error: 'clientId is required' });
      }
      const result = await whiteLabelService.generateReport({ clientId, agencyId, type, data });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get rendered HTML for a report
  router.get('/reports/:id/html', async (req, res) => {
    try {
      const report = whiteLabelService.getReport(req.params.id);
      if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

      const client = whiteLabelService.getClient(report.client_id);
      if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

      const html = whiteLabelService.renderReportHTML({
        client,
        type: report.type,
        data: typeof report.data === 'string' ? JSON.parse(report.data) : report.data,
      });

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// ── CAPI Monitor Router ──────────────────────────────────────

export function createCapiMonitorRouter(capiMonitor) {
  const router = Router();

  // Check CAPI health for an account
  router.get('/health/:accountId', async (req, res) => {
    try {
      const result = await capiMonitor.checkHealth(req.params.accountId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get health history for an account
  router.get('/history/:accountId', async (req, res) => {
    try {
      const { days } = req.query;
      const result = capiMonitor.getHealthHistory(
        req.params.accountId,
        days ? parseInt(days, 10) : 30
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
