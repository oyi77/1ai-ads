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
    // Reject tokens for users that no longer exist (GDPR erasure / hard delete).
    // Guarded so test harnesses without app.locals still pass; production always
    // sets app.locals.usersRepo (app.js). A deleted user's stateless JWT would
    // otherwise keep passing the signature check until natural expiry.
    const usersRepo = req.app?.locals?.usersRepo;
    if (usersRepo && payload?.id) {
      const user = usersRepo.findById(payload.id);
      if (!user) {
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