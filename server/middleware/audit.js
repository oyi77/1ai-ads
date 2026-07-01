import { createLogger } from '../lib/logger.js';

const log = createLogger('middleware:audit');

// Fields to redact from audit logs (never store credentials/tokens)
const REDACTED_FIELDS = ['password', 'token', 'access_token', 'refresh_token', 'secret', 'api_key', 'credentials', 'authorization'];

// Max request body size to store in audit log (1 KB)
const MAX_BODY_SIZE = 1024;

function redactSensitive(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => redactSensitive(item));
  if (typeof obj !== 'object') return obj;

  const redacted = {};
  for (const key of Object.keys(obj)) {
    if (REDACTED_FIELDS.some(f => key.toLowerCase().includes(f))) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSensitive(obj[key]);
    }
  }
  return redacted;
}

/**
 * Audit logging middleware — logs all mutating API requests.
 * Intercepts res.json() to capture response status and redacted request body.
 */
export function auditLog(auditRepo) {
  return (req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        try {
          let requestBody = undefined;
          if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            const redacted = redactSensitive(req.body);
            const serialized = JSON.stringify(redacted);
            // Cap body size to prevent audit log bloat
            requestBody = serialized.length > MAX_BODY_SIZE
              ? serialized.slice(0, MAX_BODY_SIZE) + '...[truncated]'
              : redacted;
          }

          auditRepo.log({
            user_id: req.user?.id || null,
            action: `${req.method} ${req.path}`,
            resource_type: req.path.split('/')[2] || 'unknown',
            resource_id: req.params?.id || null,
            details: JSON.stringify({
              status: res.statusCode,
              success: body?.success,
              request_body: requestBody,
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
