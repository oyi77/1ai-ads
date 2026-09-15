import crypto from 'crypto';
import { verifyToken } from '../lib/auth.js';
import { AuthError } from '../lib/errors.js';
import { ACCESS_COOKIE } from '../lib/auth-cookies.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('auth');
export function requireAuth(req, res, next) {
  // 0. API key (external developers): x-api-key → api_keys table. Checked
  // first so key callers never need cookies/JWT. No header → session path
  // below, byte-identical behavior for SPA/bot/service callers.
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return requireApiKey(req, res, next);
  }
  let token = req.cookies?.[ACCESS_COOKIE];
  // 2. Fallback to Bearer header (API clients, service-to-service, backward compat).
  if (!token) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) token = header.slice(7);
  }
  if (!token) {
    throw new AuthError('Unauthorized');
  }

  try {
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

/**
 * API-key auth for external developers (x-api-key header).
 * Resolves paymentsRepo from app.locals (wired in server/app.js).
 * Scopes are recorded at mint time but NOT enforced per-route in v1 — a key
 * authenticates as its owner with the owner's full permissions.
 */
export function requireApiKey(req, res, next) {
  const raw = req.headers['x-api-key'];
  // paymentsRepo is exposed directly on app.locals (server/app.js); the
  // _services bag holds services, not repos.
  const paymentsRepo = req.app?.locals?.paymentsRepo;
  if (!paymentsRepo?.findApiKeyByHash) {
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
  try {
    const hash = crypto.createHash('sha256').update(String(raw)).digest('hex');
    const row = paymentsRepo.findApiKeyByHash(hash);
    if (!row) return res.status(401).json({ success: false, error: 'Invalid API key' });
    if (row.revoked_at) return res.status(401).json({ success: false, error: 'API key revoked' });
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ success: false, error: 'API key expired' });
    }
    try {
      paymentsRepo.updateApiKeyLastUsed(row.id);
    } catch (err) {
      log.warn('api-key last-used stamp failed', { keyId: row.id, error: err.message });
    }
    req.user = { id: row.user_id, apiKeyId: row.id, scopes: safeScopes(row.scopes) };
    req.apiKey = row;
    return next();
  } catch (err) {
    log.error('API key auth failed', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

function safeScopes(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}