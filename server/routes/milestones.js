import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('milestones');

const MILESTONE_KEYS = [
  { key: 'first_sync', label: 'First Platform Sync', desc: 'Connected your first ad platform' },
  { key: 'first_report', label: 'First AI Report', desc: 'Generated your first performance report' },
  { key: 'first_rule', label: 'First Automation Rule', desc: 'Created your first automation rule' },
  { key: 'first_campaign', label: 'First Campaign Created', desc: 'Launched your first campaign from AdForge' },
];

export function createMilestonesRouter(paymentsRepo) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/milestones — get user's unlocked milestones
  router.get('/', async (req, res) => {
    try {
      const milestones = paymentsRepo.getUnlockedMilestones(req.user.id);
      const unlockedKeys = new Set(milestones.map(m => m.milestone_key));

      const result = MILESTONE_KEYS.map(k => ({
        ...k,
        unlocked: unlockedKeys.has(k.key),
        achievedAt: milestones.find(m => m.milestone_key === k.key)?.achieved_at || null,
      }));

      res.json({ success: true, data: result });
    } catch (err) {
      log.error('Failed to get milestones', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/milestones/:key — record a milestone (internal use)
  router.post('/:key', async (req, res) => {
    try {
      const { key } = req.params;
      if (!MILESTONE_KEYS.some(k => k.key === key)) {
        return res.status(400).json({ success: false, error: 'Invalid milestone key' });
      }
      const milestone = paymentsRepo.recordMilestone(req.user.id, key, req.body || {});
      res.json({ success: true, data: milestone });
    } catch (err) {
      log.error('Failed to record milestone', { error: err.message, userId: req.user.id, key: req.params.key });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}