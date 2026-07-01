import { createLogger } from '../lib/logger.js';

const log = createLogger('middleware:audit');

// Fields to redact from audit logs (never store credentials/tokens)
const REDACTED_FIELDS = ['password', 'token', 'access_token', 'refresh_token', 'secret', 'api_key', 'credentials', 'authorization'];

function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const redacted = { ...obj };
  for (const key of Object.keys(redacted)) {
    if (REDACTED_FIELDS.some(f => key.toLowerCase().includes(f))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitive(redacted[key]);
    }
  }
  return redacted;
}

/**
 * Audit logging middleware — logs all mutating API requests.
 * Intercepts res.json() to capture response status and request body.
 */
export function auditLog(auditRepo) {
  return (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        try {
          auditRepo.log({
            user_id: req.user?.id || null,
            action: `${req.method} ${req.path}`,
            resource_type: req.path.split('/')[2] || 'unknown',
            resource_id: req.params?.id || null,
            details: JSON.stringify({
              status: res.statusCode,
              success: body?.success,
              request_body: redactSensitive(req.body),
            }),
            ip_address: req.ip || req.connection?.remoteAddress || 'unknown',
          });
        } catch (err) {
          log.error('Audit log write failed', { error: err.message });
        }
        return originalJson(body);
      };
    }
    next();
  };
}
