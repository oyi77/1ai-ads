import { Router } from 'express';

export function createOptimizerRouter(rulesRepo, optimizer) {
  const router = Router();


  // GET /status — optimizer status summary
  router.get('/status', (req, res, next) => {
    try {
      const rules = rulesRepo.getAll(req.user.id);
      res.json({
        success: true,
        data: {
          running: true,
          rules_count: Array.isArray(rules) ? rules.length : 0,
          active_rules: Array.isArray(rules) ? rules.filter(r => r.enabled).length : 0,
          last_run: optimizer?.lastRun || null,
        },
      });
    } catch (err) { next(err); }
  });
  // List all rules for current user
  router.get('/rules', (req, res, next) => {
    try {
      const rules = rulesRepo.getAll(req.user.id);
      res.json({ success: true, data: rules });
    } catch (err) { next(err); }
  });

  // Create a rule
  router.post('/rules', (req, res, next) => {
    try {
      const { name, condition, action, priority } = req.body;
      if (!name || !condition || !action) {
        return res.status(400).json({ success: false, error: 'name, condition, and action are required' });
      }
      const id = rulesRepo.create({
        user_id: req.user.id,
        name,
        condition: typeof condition === 'string' ? condition : JSON.stringify(condition),
        action: typeof action === 'string' ? action : JSON.stringify(action),
        priority: priority || 1,
        enabled: true,
      });
      res.json({ success: true, data: { id } });
    } catch (err) { next(err); }
  });

  // Update a rule
  router.put('/rules/:id', (req, res, next) => {
    try {
      const rule = rulesRepo.findById ? rulesRepo.findById(req.params.id) : null;
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      if (rule.user_id !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
      const updated = rulesRepo.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Delete a rule
  router.delete('/rules/:id', (req, res, next) => {
    try {
      const rule = rulesRepo.findById ? rulesRepo.findById(req.params.id) : null;
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      if (rule.user_id !== req.user?.id) return res.status(403).json({ success: false, error: 'Forbidden' });
      const removed = rulesRepo.delete(req.params.id);
      if (!removed) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Manually trigger evaluation

  // POST /run — alias for /evaluate
  router.post('/run', async (req, res) => {
    try {
      const result = await optimizer.evaluate();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  router.post('/evaluate', async (req, res) => {
    try {
      const result = await optimizer.evaluate();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
// 1782541969
