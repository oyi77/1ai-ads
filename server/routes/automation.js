import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Automation routes — CRUD for automation rules.
 */
export function createAutomationRouter({ rulesRepo }) {
  const router = Router();

  router.use(requireAuth);

  /** GET / — list all rules */
  router.get('/', async (req, res) => {
    try {
      const rules = rulesRepo.findAll ? await rulesRepo.findAll() : [];
      res.json({ success: true, rules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /create — create a new rule */
  router.post('/create', (req, res) => {
    try {
      const { name, type, condition, action } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Name required' });
      // Guard against pre-stringified objects — repo handles both but must receive raw values
      let cond = condition;
      if (typeof cond === 'string') {
        try { cond = JSON.parse(cond); } catch { /* keep as-is */ }
      }
      let act = action;
      if (typeof act === 'string') {
        try { act = JSON.parse(act); } catch { /* keep as-is */ }
      }
      const uid = (req.user && req.user.id) ? req.user.id : 'system';
      const insertId = rulesRepo.create({
        user_id: uid,
        name,
        condition: cond ?? {},
        action: act ?? { type: 'pause' },
        priority: 1,
        enabled: true,
      });
      res.json({ success: true, data: { id: insertId, name, type: type || 'custom', condition, action } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /toggle/:id — toggle rule active state */
  router.post('/toggle/:id', async (req, res) => {
    try {
      const rule = rulesRepo.findById ? await rulesRepo.findById(req.params.id) : null;
      if (!rule) return res.status(404).json({ success: false, error: 'Rule not found' });
      const newActive = rule.is_active ? 0 : 1;
      if (rulesRepo.update) await rulesRepo.update(req.params.id, { is_active: newActive });
      res.json({ success: true, is_active: newActive });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /delete/:id — delete a rule */
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
