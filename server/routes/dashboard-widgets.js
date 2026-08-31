import { Router } from 'express';

/** Transform a raw DB widget row into the flat shape the frontend expects. */
function toFrontend(w) {
  const cfg = typeof w.config === 'string' ? JSON.parse(w.config) : (w.config || {});
  return {
    id: w.id,
    name: cfg.name || w.widget_type,
    description: cfg.description || '',
    type: cfg.type || w.widget_type,
    enabled: cfg.enabled !== false,
    position: w.position,
    size: w.size,
  };
}

export function createDashboardWidgetsRouter(widgetsRepo) {
  const router = Router();

  // List all widgets for current user
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const { page = 1, limit = 50 } = req.query;
      const result = widgetsRepo.getByUser(userId, { page: +page, limit: +limit });
      res.json({ success: true, data: result.data.map(toFrontend), total: result.total, page: result.page, limit: result.limit });
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
      res.status(201).json({ success: true, data: toFrontend(result) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update a widget — merges name/description/type/enabled into config JSON
  router.put('/:id', async (req, res) => {
    try {
      const { name, description, type, enabled, ...rest } = req.body;
      const updateData = { ...rest };

      // If frontend-sent fields are present, merge them into config
      const userId = req.user?.id || req.userId;
      if (name !== undefined || description !== undefined || type !== undefined || enabled !== undefined) {
        const existing = widgetsRepo.findById(req.params.id);
        if (existing && existing.user_id !== userId) {
          return res.status(404).json({ success: false, error: 'Widget not found' });
        }
        if (existing) {
          const cfg = typeof existing.config === 'string' ? JSON.parse(existing.config) : (existing.config || {});
          if (name !== undefined) cfg.name = name;
          if (description !== undefined) cfg.description = description;
          if (type !== undefined) cfg.type = type;
          if (enabled !== undefined) cfg.enabled = enabled;
          updateData.config = cfg;
        }
      }

      const result = widgetsRepo.update(req.params.id, updateData, userId);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Widget not found' });
      }
      res.json({ success: true, data: toFrontend(result) });
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
      const userId = req.user?.id || req.userId;
      for (const item of order) {
        if (item.id && item.position !== undefined) {
          widgetsRepo.update(item.id, { position: item.position }, userId);
        }
      }
      const result = widgetsRepo.getByUser(userId, { limit: 1000 });
      res.json({ success: true, data: result.data.map(toFrontend) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete a widget
  router.delete('/:id', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const ok = widgetsRepo.delete(req.params.id, userId);
      if (!ok) return res.status(404).json({ success: false, error: 'Widget not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
