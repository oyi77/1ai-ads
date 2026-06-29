/**
 * RBAC Middleware — Role and plan-based access control.
 *
 * `requireRole(...roles)`  — rejects if req.user.role not in the list.
 * `requirePlan(...plans)` — rejects if req.user.plan not in the list.
 *                          Admin users always bypass plan restrictions.
 *
 * Both return 403 JSON with { success: false, error } on denial.
 */

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requirePlan(...plans) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    // Admin bypasses plan restrictions
    if (req.user.role === 'admin') {
      return next();
    }
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({ success: false, error: 'Upgrade required' });
    }
    next();
  };
}
