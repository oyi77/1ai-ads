import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Automation routes — CRUD for automation rules.
 * Ported from adforge-dashboard/app.py automation endpoints.
 */
export function createAutomationRouter({ rulesRepo }) {
  const router = Router();

  router.use(requireAuth);

  /** GET /api/automation — list all rules */
  router.get('/', async (req, res) => {
    try {
      const rules = rulesRepo.findAll ? await rulesRepo.findAll() : [];
      res.json({ success: true, rules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /api/automation/toggle/:id — toggle rule active state */
  router.post('/toggle/:id', async (req, res) => {
    try {
      const rule = rulesRepo.findById ? await rulesRepo.findById(req.params.id) : null;
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });

      const newActive = rule.is_active ? 0 : 1;
      if (rulesRepo.update) {
        await rulesRepo.update(req.params.id, { is_active: newActive });
      }
      res.json({ success: true, is_active: newActive });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /api/automation/create — create a new rule */
  router.post('/create', async (req, res) => {
    try {
      const { name, trigger_metric, trigger_operator, trigger_value, action_type, action_params } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Name required' });

      const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const rule = {
        id, name, trigger_metric, trigger_operator, trigger_value,
        action_type, action_params: typeof action_params === 'object' ? JSON.stringify(action_params) : action_params,
        is_active: 1,
      };

      if (rulesRepo.create) await rulesRepo.create(rule);
      res.json({ success: true, rule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /api/automation/delete/:id — delete a rule */
  router.post('/delete/:id', async (req, res) => {
    try {
      if (rulesRepo.delete) await rulesRepo.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
