import { verifyToken } from '../lib/auth.js';
import { AuthError } from '../lib/errors.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError('Unauthorized');
  }

  try {
    const token = header.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}
