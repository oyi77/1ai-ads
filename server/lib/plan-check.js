import { AuthError } from '../lib/errors.js';

export class PlanCheck {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get user's plan and role
   */
  getUserPlan(userId) {
    const user = this.db.prepare('SELECT role, plan FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new AuthError('User not found');
    }
    return user;
  }

  /**
   * Check if user is admin (bypasses all plan restrictions)
   */
  isAdmin(userId) {
    const user = this.getUserPlan(userId);
    return user.role === 'admin';
  }

  /**
   * Check if user has access to a specific feature
   */
  hasFeature(userId, feature) {
    if (this.isAdmin(userId)) {
      return true;
    }

    const user = this.getUserPlan(userId);
    const plan = this.db.prepare('SELECT features FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) {
      return false;
    }

    const features = JSON.parse(plan.features || '[]');
    return features.includes(feature);
  }

  /**
   * Check if user has reached max ads limit
   */
  canCreateAd(userId) {
    if (this.isAdmin(userId)) {
      return { allowed: true, remaining: -1 };
    }

    const user = this.getUserPlan(userId);
    const plan = this.db.prepare('SELECT max_ads FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) {
      return { allowed: false, remaining: 0 };
    }

    if (plan.max_ads === -1) {
      return { allowed: true, remaining: -1 };
    }

    const currentAds = this.db.prepare('SELECT COUNT(*) as count FROM ads WHERE user_id = ?').get(userId);
    const remaining = plan.max_ads - (currentAds?.count || 0);
    return { allowed: remaining > 0, remaining };
  }

  /**
   * Check if user has reached max campaigns limit
   */
  canCreateCampaign(userId) {
    if (this.isAdmin(userId)) {
      return { allowed: true, remaining: -1 };
    }

    const user = this.getUserPlan(userId);
    const plan = this.db.prepare('SELECT max_campaigns FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) {
      return { allowed: false, remaining: 0 };
    }

    if (plan.max_campaigns === -1) {
      return { allowed: true, remaining: -1 };
    }

    const currentCampaigns = this.db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE user_id = ?').get(userId);
    const remaining = plan.max_campaigns - (currentCampaigns?.count || 0);
    return { allowed: remaining > 0, remaining };
  }

  /**
   * Check if user has reached max platform accounts limit
   */
  canAddPlatformAccount(userId) {
    if (this.isAdmin(userId)) {
      return { allowed: true, remaining: -1 };
    }

    const user = this.getUserPlan(userId);
    const plan = this.db.prepare('SELECT max_platform_accounts FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) {
      return { allowed: false, remaining: 0 };
    }

    if (plan.max_platform_accounts === -1) {
      return { allowed: true, remaining: -1 };
    }

    const currentAccounts = this.db.prepare('SELECT COUNT(*) as count FROM platform_accounts WHERE user_id = ?').get(userId);
    const remaining = plan.max_platform_accounts - (currentAccounts?.count || 0);
    return { allowed: remaining > 0, remaining };
  }

  /**
   * Get plan details for a user
   */
  getPlanDetails(userId) {
    const user = this.getUserPlan(userId);
    const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) {
      return null;
    }

    return {
      id: plan.id,
      name: plan.name,
      tier: plan.tier,
      maxAds: plan.max_ads,
      maxCampaigns: plan.max_campaigns,
      maxPlatformAccounts: plan.max_platform_accounts,
      features: JSON.parse(plan.features || '[]'),
      isAdmin: user.role === 'admin'
    };
  }

  /**
   * Get user-friendly limit message for a specific limit type
   */
  getLimitMessage(userId, limitType) {
    const user = this.getUserPlan(userId);
    if (user.role === 'admin') return null;
    const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(`plan_${user.plan}`);
    if (!plan) return { allowed: false, message: 'Plan tidak dikenal' };
    let current, limit, label;
    switch (limitType) {
      case 'campaign':
        current = this.db.prepare('SELECT COUNT(*) as count FROM campaigns WHERE user_id = ?').get(userId).count;
        limit = plan.max_campaigns;
        label = 'campaign';
        break;
      case 'ad':
        current = this.db.prepare('SELECT COUNT(*) as count FROM ads WHERE user_id = ?').get(userId).count;
        limit = plan.max_ads;
        label = 'iklan';
        break;
      case 'account':
        current = this.db.prepare('SELECT COUNT(*) as count FROM platform_accounts WHERE user_id = ?').get(userId).count;
        limit = plan.max_platform_accounts;
        label = 'akun iklan';
        break;
      default:
        return { allowed: true, message: '' };
    }
    if (limit === -1) return { allowed: true, message: '', current, limit: -1 };
    const remaining = limit - current;
    if (remaining > 0) {
      return { allowed: true, message: `Sisa ${remaining} ${label} bos`, current, limit };
    }
    return { allowed: false, message: `⛔ Bos, limit ${label} paket ${user.plan} (${limit} ${label}) sudah penuh. Upgrade ke Pro buat unlimited ya bos.`, current, limit };
  }

}
