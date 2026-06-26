import { createLogger } from '../lib/logger.js';

const log = createLogger('middleware:audit');

/**
 * Audit logging middleware — logs all mutating API requests.
 * Intercepts res.json() to capture response status.
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
            details: JSON.stringify({ status: res.statusCode, success: body?.success }),
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
