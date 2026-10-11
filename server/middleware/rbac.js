/**
 * RBAC Middleware — Role and plan-based access control.
 *
 * `requireRole(...roles)`  — rejects if req.user.role not in the list.
 * `requirePlan(...plans)` — rejects if req.user.plan not in the list.
 * Plans are hierarchical: enterprise implies pro, pro implies free.
 * requirePlan('pro') therefore passes for enterprise users — a paid tier
 * must never be locked out of a lower tier's feature.
 *                          Admin users always bypass plan restrictions.
 * `requireAddon(key)`    — rejects if user has no active row in user_addons
 *                          for the key. Admin always bypasses. 403 carries the
 *                          addon key so the SPA/bot can show the upsell.
 *
 * Both return 403 JSON with { success: false, error } on denial.
 */
import { createLogger } from '../lib/logger.js';
const log = createLogger('rbac');
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
    // Hierarchical: enterprise passes a 'pro' gate. Without this, enterprise
    // (highest paid tier) is rejected from pro-gated routes — live-proven:
    // enterprise user got 403 "Upgrade required" on /api/automation.
    const rank = { free: 0, pro: 1, enterprise: 2 };
    const need = Math.max(...plans.map(p => rank[p] ?? 0));
    const have = rank[req.user.plan] ?? 0;
    if (have >= need) return next();
    return res.status(403).json({ success: false, error: 'Upgrade required' });
  };
}

/**
 * Add-on gate — LP dan Content + Social Bridge dijual terpisah dari base
 * manage-ads 99rb. Tanpa baris aktif di user_addons = locked.
 * Setiap 403 dicatat di log = demand signal buat bos (add-on mana paling diminta).
 */
export function requireAddon(addonKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    const repo = req.app?.locals?.userAddonsRepo;
    if (!repo?.hasActive) {
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
    if (!repo.hasActive(req.user.id, addonKey)) {
      log.info('addon_locked_hit', { addon: addonKey, userId: req.user.id });
      return res.status(403).json({ success: false, error: 'addon_required', addon: addonKey });
    }
    next();
  };
}

/**
 * Varian requireAddon dengan pengecualian path read-only.
 * Dipakai saat router bawaan tidak membedakan endpoint status/disconnect
 * dari endpoint operasional — mis. adspirer /status + /disconnect tetap
 * terbuka agar SPA bisa membaca state tanpa entitlement.
 */
export function requireAddonExcept(addonKey, exemptPaths = []) {
  const gate = requireAddon(addonKey);
  const exempt = new Set(exemptPaths);
  return (req, res, next) => {
    if (exempt.has(req.path)) return next();
    return gate(req, res, next);
  };
}
