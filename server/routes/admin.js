import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('admin');

export function createAdminRouter(usersRepo, settingsRepo) {
  const router = Router();

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
      const users = usersRepo.findAll();
      res.json({ success: true, data: users });
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

  return router;
}
