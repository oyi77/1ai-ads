import { verifyToken } from '../lib/auth.js';
import { AuthError } from '../lib/errors.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError('Unauthorized');
  }

  try {
    const token = header.slice(7);
    const payload = verifyToken(token);
    // Reject tokens for users that no longer exist (GDPR erasure) or are
    // disabled (is_active = 0, the admin soft-delete / ban path used by
    // DELETE /api/admin/users/:id and PUT /api/admin/users/:id). A stateless
    // JWT stays valid by signature only; without this check a deleted or
    // disabled account could keep calling the API until natural token expiry.
    // Guarded so test harnesses without app.locals still pass; production
    // always sets app.locals.usersRepo (server/app.js).
    const usersRepo = req.app?.locals?.usersRepo;
    if (usersRepo && payload?.id) {
      const user = usersRepo.findById(payload.id);
      if (!user || user.is_active === 0) {
        throw new AuthError('Invalid or expired token');
      }
    }
    req.user = payload;
    next();
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}