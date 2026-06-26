import { Router } from 'express';

export function createDashboardWidgetsRouter(widgetsRepo) {
  const router = Router();

  // List all widgets for current user
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const result = widgetsRepo.findByUser(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create a new widget
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const { widgetType, config, position, size } = req.body;
      if (!widgetType) {
        return res.status(400).json({ success: false, error: 'widgetType is required' });
      }
      const result = widgetsRepo.create({ userId, widgetType, config, position, size });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update a widget
  router.put('/:id', async (req, res) => {
    try {
      const result = widgetsRepo.update(req.params.id, req.body);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Widget not found' });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reorder widgets
  router.put('/reorder', async (req, res) => {
    try {
      const { order } = req.body;
      // order = [{ id, position }, ...]
      if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: 'order array is required' });
      }
      for (const item of order) {
        if (item.id && item.position !== undefined) {
          widgetsRepo.update(item.id, { position: item.position });
        }
      }
      const userId = req.user?.id || req.userId;
      const result = widgetsRepo.findByUser(userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete a widget
  router.delete('/:id', async (req, res) => {
    try {
      widgetsRepo.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
