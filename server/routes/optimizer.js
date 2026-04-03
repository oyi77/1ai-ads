import { Router } from 'express';

export function createOptimizerRouter(rulesRepo, optimizer) {
  const router = Router();

  // List all rules
  router.get('/rules', (req, res) => {
    const { campaign_id } = req.query;
    const rules = rulesRepo.findAll({ campaignId: campaign_id });
    res.json({ success: true, data: rules });
  });

  // Create a rule
  router.post('/rules', (req, res) => {
    const { campaign_id, name, condition_metric, condition_operator, condition_value, action, action_value } = req.body;
    if (!campaign_id || !name || !condition_metric || !condition_operator || !condition_value || !action) {
      return res.status(400).json({ success: false, error: 'campaign_id, name, condition_metric, condition_operator, condition_value, and action are required' });
    }
    const id = rulesRepo.create(req.body);
    res.json({ success: true, data: { id } });
  });

  // Update a rule
  router.put('/rules/:id', (req, res) => {
    const updated = rulesRepo.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true, data: updated });
  });

  // Delete a rule
  router.delete('/rules/:id', (req, res) => {
    const removed = rulesRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true });
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
