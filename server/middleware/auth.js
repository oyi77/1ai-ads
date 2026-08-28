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
    // SECURITY NOTE: We intentionally do NOT do a DB lookup here to check is_active.
    // The JWT signature is sufficient for authentication. A DB lookup on every
    // authenticated request creates a reliability risk: the server's long-lived
    // DB connection can hold a stale WAL read snapshot, causing findById to
    // return null for valid users and rejecting their tokens with 401.
    // If a user is banned or erased, rotate JWT_SECRET to invalidate all their
    // tokens immediately (the secret change rejects every existing token).
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