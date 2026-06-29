import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';

export function createAuditRouter(auditRepo) {
  const router = Router();

  router.get('/', requireAdmin, (req, res) => {
    try {
      const { page = 1, limit = 50, userId, action } = req.query;
      const result = auditRepo.findAll({
        page: Number(page) || 1,
        limit: Math.min(Number(limit) || 50, 200),
        userId: userId || undefined,
        action: action || undefined,
      });
      res.json({ success: true, ...result });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
    }
  });

  return router;
}
