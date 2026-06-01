import { Router } from 'express';

export function createOptimizerRouter(rulesRepo, optimizer) {
  const router = Router();

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
      const updated = rulesRepo.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Delete a rule
  router.delete('/rules/:id', (req, res, next) => {
    try {
      const removed = rulesRepo.delete(req.params.id);
      if (!removed) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // Manually trigger evaluation
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
