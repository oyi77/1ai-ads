import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createAuthRouter } from './auth.js';
import { createAdminRouter } from './admin.js';
import { createAuditRouter } from './audit.js';
import { createTokenRouter } from './tokens.js';
import { createEventsRouter } from './events.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { verifyPassword } from '../lib/auth.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('auth-group');

export function createAuthGroupRouter({ repos, services: _services, publicRateLimit }) {
  const router = Router();

  // GDPR export limiter: 1 per hour per user
  const gdprLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 1,
    message: { success: false, error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  });

  // ── GDPR Article 20: Data Portability ───────────────────────
  router.get('/auth/export-data', requireAuth, gdprLimiter, async (req, res) => {
    try {
      const userId = req.user.id;
      const user = repos.usersRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const campaigns = repos.campaignsRepo?.findAll?.({ userId }) || { data: [] };
      const platformAccounts = repos.platformAccountsRepo?.findByUserId?.(userId) || [];

      const exportData = {
        exported_at: new Date().toISOString(),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          plan: user.plan,
          created_at: user.created_at,
        },
        campaigns,
        platform_accounts: platformAccounts.map(a => ({
          id: a.id,
          platform: a.platform,
          account_name: a.account_name,
          is_active: a.is_active,
          created_at: a.created_at,
        })),
      };

      res.setHeader('Content-Disposition', `attachment; filename="adforge-export-${userId}.json"`);
      res.json({ success: true, data: exportData });
    } catch (err) {
      log.error('GDPR export failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Export failed' });
    }
  });

  // ── GDPR Article 17: Right to Erasure ───────────────────────
  router.delete('/auth/account', requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ success: false, error: 'Password confirmation required' });
      }

      const user = repos.usersRepo.findById(userId);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      if (!verifyPassword(password, user.password_hash)) {
        return res.status(403).json({ success: false, error: 'Invalid password' });
      }

      // Delete refresh tokens
      if (repos.refreshTokensRepo?.deleteByUser) {
        repos.refreshTokensRepo.deleteByUser(userId);
      }

      // Delete user (cascading deletes handle platform_accounts, payments, ai_suggestions via FK)
      repos.usersRepo.delete(userId);

      log.info('User account deleted (GDPR)', { userId });
      res.json({ success: true, message: 'Account and all associated data deleted' });
    } catch (err) {
      log.error('GDPR account deletion failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Deletion failed' });
    }
  });

  router.use('/auth', publicRateLimit, createAuthRouter(repos.usersRepo, repos.refreshTokensRepo, repos.settingsRepo));
  router.use('/admin', requireAuth, requireAdmin, createAdminRouter(repos.usersRepo, repos.settingsRepo));
  router.use('/tokens', requireAuth, createTokenRouter());
  router.use('/events', requireAuth, createEventsRouter());
  router.use('/audit', requireAuth, requireAdmin, createAuditRouter(repos.auditRepo));
  return router;
}
