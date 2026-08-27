import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('usage');

const METER_KEYS = [
  'api_calls',
  'campaigns_created',
  'rules_created',
  'webhook_events',
  'report_generations',
  'ai_generations',
];

export function createUsageRouter(paymentsRepo) {
  const router = Router();
  router.use(requireAuth);

  // GET /api/usage — current period usage for user
  router.get('/', async (req, res) => {
    try {
      const meters = paymentsRepo.getCurrentPeriodMeters(req.user.id);
      const formatted = meters.map(m => ({
        meterKey: m.meter_key,
        count: m.count,
        periodStart: m.period_start,
        periodEnd: m.period_end,
      }));
      res.json({ success: true, data: formatted });
    } catch (err) {
      log.error('Failed to get usage meters', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/usage/history — historical usage
  router.get('/history', async (req, res) => {
    try {
      const { periodStart, periodEnd } = req.query;
      const start = periodStart || new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).toISOString().slice(0, 10);
      const end = periodEnd || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
      const meters = paymentsRepo.getUsageMetersByUser(req.user.id, start, end);
      const formatted = meters.map(m => ({
        meterKey: m.meter_key,
        count: m.count,
        periodStart: m.period_start,
        periodEnd: m.period_end,
      }));
      res.json({ success: true, data: formatted });
    } catch (err) {
      log.error('Failed to get usage history', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/usage/limits — plan limits for current user
  router.get('/limits', async (req, res) => {
    try {
      const plan = req.user.plan || 'free';
      // Plan limits (matching plans table)
      const limits = {
        free: { api_calls: 1000, campaigns_created: 5, rules_created: 10, webhook_events: 1000, report_generations: 10, ai_generations: 50 },
        pro: { api_calls: 100000, campaigns_created: 50, rules_created: 100, webhook_events: 50000, report_generations: 500, ai_generations: 5000 },
        enterprise: { api_calls: 1000000, campaigns_created: -1, rules_created: -1, webhook_events: 500000, report_generations: -1, ai_generations: -1 },
      };
      const current = paymentsRepo.getCurrentPeriodMeters(req.user.id);
      const usage = {};
      for (const m of current) {
        usage[m.meter_key] = m.count;
      }
      const planLimits = limits[plan] || limits.free;
      const result = METER_KEYS.map(key => ({
        meterKey: key,
        used: usage[key] || 0,
        limit: planLimits[key] || 0,
        percentage: planLimits[key] > 0 ? Math.round(((usage[key] || 0) / planLimits[key]) * 100) : 0,
        unlimited: planLimits[key] < 0,
      }));
      res.json({ success: true, data: result, plan });
    } catch (err) {
      log.error('Failed to get usage limits', { error: err.message, userId: req.user.id });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Internal: increment a usage meter (called by other services)
  // Not exposed publicly
  router.post('/increment/:meterKey', async (req, res) => {
    try {
      const { meterKey } = req.params;
      if (!METER_KEYS.includes(meterKey)) {
        return res.status(400).json({ success: false, error: 'Invalid meter key' });
      }
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString().slice(0, 19).replace('T', ' ');
      const meter = paymentsRepo.incrementUsageMeter(req.user.id, meterKey, periodStart, periodEnd);
      res.json({ success: true, data: meter });
    } catch (err) {
      log.error('Failed to increment usage meter', { error: err.message, userId: req.user.id, meterKey: req.params.meterKey });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}