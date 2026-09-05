import { Router } from 'express';

export function createAutomationRulesRouter(automationRepo) {
  const router = Router();

  // GET /api/automation/rules — list user's automation rules
  router.get('/', async (req, res) => {
    try {
      const { isActive, platform, limit, offset } = req.query;
      const rules = automationRepo.findAll(req.user.id, { 
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        platform,
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
      });
      res.json({ success: true, data: rules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/automation/rules/:id — get single rule
  router.get('/:id', async (req, res) => {
    try {
      const rule = automationRepo.findById(req.params.id, req.user.id);
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true, data: rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/automation/rules — create new rule
  router.post('/', async (req, res) => {
    try {
      const { name, description, platform, campaignId, conditionType, conditionMetric, conditionOperator, conditionValue, conditionTimeframe, actionType, actionValue, actionTarget, maxTriggers } = req.body;
      if (!name || !conditionType || !actionType) {
        return res.status(400).json({ success: false, error: 'name, conditionType, and actionType are required' });
      }
      const rule = automationRepo.create({
        userId: req.user.id,
        name,
        description,
        platform,
        campaignId,
        conditionType,
        conditionMetric,
        conditionOperator,
        conditionValue,
        conditionTimeframe,
        actionType,
        actionValue,
        actionTarget,
        maxTriggers,
      });
      res.status(201).json({ success: true, data: rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/automation/rules/:id — update rule
  router.put('/:id', async (req, res) => {
    try {
      const rule = automationRepo.update(req.params.id, req.user.id, req.body);
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true, data: rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/automation/rules/:id — delete rule
  router.delete('/:id', async (req, res) => {
    try {
      const result = automationRepo.delete(req.params.id, req.user.id);
      if (result.changes === 0) return res.status(404).json({ success: false, error: 'Rule not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/automation/rules/:id/executions — get rule execution history
  router.get('/:id/executions', async (req, res) => {
    try {
      const executions = automationRepo.getExecutions(req.params.id, { limit: parseInt(req.query.limit) || 50 });
      res.json({ success: true, data: executions });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
