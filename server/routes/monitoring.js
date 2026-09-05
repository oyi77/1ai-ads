import { Router } from 'express';

export function createMonitoringRouter(monitoringRepo) {
  const router = Router();

  // GET /api/monitoring/alerts — list user's alerts
  router.get('/alerts', async (req, res) => {
    try {
      const { isRead, isResolved, limit, offset } = req.query;
      const alerts = monitoringRepo.getAlerts(req.user.id, {
        isRead: isRead !== undefined ? isRead === 'true' : undefined,
        isResolved: isResolved !== undefined ? isResolved === 'true' : undefined,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
      });
      res.json({ success: true, data: alerts });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/monitoring/alerts/unread-count — get unread alert count
  router.get('/alerts/unread-count', async (req, res) => {
    try {
      const count = monitoringRepo.getUnreadCount(req.user.id);
      res.json({ success: true, data: { count } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/monitoring/alerts/:id/read — mark alert as read
  router.put('/alerts/:id/read', async (req, res) => {
    try {
      monitoringRepo.markAsRead(req.params.id, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/monitoring/alerts/:id/resolve — resolve alert
  router.put('/alerts/:id/resolve', async (req, res) => {
    try {
      monitoringRepo.resolve(req.params.id, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/monitoring/rules — list monitoring rules
  router.get('/rules', async (req, res) => {
    try {
      const { isActive } = req.query;
      const rules = monitoringRepo.findAllRules(req.user.id, { isActive: isActive !== undefined ? isActive === 'true' : undefined });
      res.json({ success: true, data: rules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/monitoring/rules — create monitoring rule
  router.post('/rules', async (req, res) => {
    try {
      const { name, metric, operator, threshold, lookbackHours, notificationChannels } = req.body;
      if (!name || !metric || !operator || threshold === undefined) {
        return res.status(400).json({ success: false, error: 'name, metric, operator, and threshold are required' });
      }
      const rule = monitoringRepo.createRule({
        userId: req.user.id,
        name,
        metric,
        operator,
        threshold,
        lookbackHours,
        notificationChannels,
      });
      res.status(201).json({ success: true, data: rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/monitoring/rules/:id — update monitoring rule
  router.put('/rules/:id', async (req, res) => {
    try {
      const rule = monitoringRepo.updateRule(req.params.id, req.user.id, req.body);
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true, data: rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/monitoring/rules/:id — delete monitoring rule
  router.delete('/rules/:id', async (req, res) => {
    try {
      const result = monitoringRepo.deleteRule(req.params.id, req.user.id);
      if (result.changes === 0) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
