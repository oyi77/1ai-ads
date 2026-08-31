import { Router } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { createLogger } from '../lib/logger.js';
import { generateToken, generateRefreshToken } from '../lib/auth.js';

const log = createLogger('admin');

export function createAdminRouter(usersRepo, _refreshTokensRepo, _settingsRepo) {
  const router = Router();
  router.use(requireRole('admin'));

  // GET /api/admin/stats — dashboard stats
  router.get('/stats', (req, res) => {
    try {
      const allUsers = usersRepo.findAll();
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter(u => u.is_active !== 0).length;

      const db = usersRepo.db;
      const totalCampaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns').get()?.count ?? 0;
      const totalSpend = db.prepare('SELECT COALESCE(SUM(spend), 0) as total FROM campaigns').get()?.total ?? 0;

      res.json({
        success: true,
        data: { totalUsers, activeUsers, totalCampaigns, totalSpend },
      });
    } catch (err) {
      log.error('Failed to fetch admin stats', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
  });

  // GET /api/admin/users — list all users
  router.get('/users', (req, res) => {
    try {
      const { page = 1, limit = 50, search } = req.query;
      let users = usersRepo.findAll();

      if (search) {
        const s = String(search).toLowerCase();
        users = users.filter(u => u.username.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
      }

      const total = users.length;
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const start = (pageNum - 1) * limitNum;
      const data = users.slice(start, start + limitNum);

      res.json({ success: true, data, total, page: pageNum, limit: limitNum });
    } catch (err) {
      log.error('Failed to list users', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to list users' });
    }
  });

  // GET /api/admin/users/:id — get single user
  router.get('/users/:id', (req, res) => {
    try {
      const user = usersRepo.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      res.json({ success: true, data: user });
    } catch (err) {
      log.error('Failed to fetch user', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
  });

  // PUT /api/admin/users/:id — update user (role, is_active, email)
  router.put('/users/:id', (req, res) => {
    try {
      const { role, is_active, email } = req.body;
      const updates = {};
      if (role !== undefined) updates.role = role;
      if (is_active !== undefined) updates.is_active = is_active;
      if (email !== undefined) updates.email = email;

      const user = usersRepo.update(req.params.id, updates);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      log.info('Admin updated user', { adminId: req.user.id, targetId: req.params.id, updates });
      res.json({ success: true, data: user });
    } catch (err) {
      log.error('Failed to update user', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  });

  // DELETE /api/admin/users/:id — deactivate user (soft delete)
  router.delete('/users/:id', (req, res) => {
    try {
      const user = usersRepo.update(req.params.id, { is_active: 0 });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      log.info('Admin deactivated user', { adminId: req.user.id, targetId: req.params.id });
      res.json({ success: true, data: user });
    } catch (err) {
      log.error('Failed to deactivate user', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to deactivate user' });
    }
  });

  // POST /api/admin/impersonate/:id — generate tokens for impersonation
  router.post('/impersonate/:id', async (req, res) => {
    try {
      const user = usersRepo.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const accessToken = generateToken({ id: user.id, username: user.username, role: user.role, plan: user.plan });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Store refresh token (use injected param, not dynamic import)
      _refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());

      log.info('Admin impersonation', { adminId: req.user.id, targetId: user.id });
      res.json({ success: true, data: { accessToken, refreshToken, user } });
    } catch (err) {
      log.error('Impersonation failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Impersonation failed' });
    }
  });

  // POST /api/admin/billing/:id — override user billing
  router.post('/billing/:id', async (req, res) => {
    try {
      const { plan, expiry } = req.body;
      const user = usersRepo.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      const updates = {};
      if (plan) updates.plan = plan;
      if (expiry) updates.plan_expires_at = expiry;
      const updated = usersRepo.update(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      log.info('Admin billing override', { adminId: req.user.id, targetId: user.id, plan, expiry });
      res.json({ success: true, data: { plan: updated.plan, expiry: updated.plan_expires_at } });
    } catch (err) {
      log.error('Billing override failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Billing override failed' });
    }
  });

  return router;
}